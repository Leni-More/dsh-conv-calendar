// Fold the real session logs through the plugin's own host code and compare the
// per-day token numbers against an independent pass over the same logs.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readFileSync as rf } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { foldEvents, buildSummary, recordUsage, recordPrompt, dayKey, usageOf } from '../lib/index.js'

const root = process.argv[2] ?? 'C:/Users/LeniMore/.dsh/sessions'

// --- independent pass: the numbers we expect, computed here from raw JSONL ---
const files = []
;(function walk(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) walk(path)
		else if (/session.*\.jsonl(\.zstd)?$/.test(entry.name)) files.push(path)
	}
})(root)

const expected = new Map()
const seenReply = new Set()
for (const file of files) {
	const buffer = readFileSync(file)
	const text = buffer.subarray(0, 4).readUInt32LE(0) === 0xfd2fb528 ? zstdDecompressSync(buffer).toString('utf8') : buffer.toString('utf8')
	for (const line of text.split('\n')) {
		if (!line) continue
		let event
		try {
			event = JSON.parse(line)
		} catch {
			continue
		}
		if (event.type !== 'assistant/message') continue
		const usage = event.data?.usage
		const id = event.data?.message?.id
		if (!usage || !id || seenReply.has(id)) continue
		seenReply.add(id)
		const day = dayKey(event.time)
		const bucket = expected.get(day) ?? { input: 0, output: 0, cache: 0, total: 0, replies: 0 }
		bucket.input += usage.inputTokens || 0
		bucket.output += usage.outputTokens || 0
		bucket.cache += usage.cacheReadTokens || 0
		bucket.total += usage.totalTokens || 0
		bucket.replies += 1
		expected.set(day, bucket)
	}
}

// --- the plugin's own fold, through the same entry points the Host uses ---
const state = { version: 1, updatedAt: 0, sessions: {} }
let decoded = 0
for (const file of files) {
	const buffer = readFileSync(file)
	const text = buffer.subarray(0, 4).readUInt32LE(0) === 0xfd2fb528 ? zstdDecompressSync(buffer).toString('utf8') : buffer.toString('utf8')
	const events = []
	for (const line of text.split('\n')) {
		if (!line) continue
		try {
			events.push(JSON.parse(line))
		} catch {
			/* skip */
		}
	}
	const sessionId = file.split(/[\\/]/).at(-2)
	state.sessions[sessionId] = { days: foldEvents(events, sessionId), final: true }
	decoded += 1
}

const summary = buildSummary(state)
const actual = new Map(summary.days.map((day) => [day.day, day]))

console.log(`files: ${decoded}  days: ${summary.days.length}`)
console.log('meta:', summary.meta)

let failures = 0
for (const [day, want] of [...expected].sort()) {
	const got = actual.get(day)
	const ok =
		got &&
		got.input === want.input &&
		got.output === want.output &&
		got.cache === want.cache &&
		got.total === want.total &&
		got.replies === want.replies
	if (!ok) failures += 1
	console.log(`${ok ? 'PASS' : 'FAIL'} ${day}  in=${got?.input}/${want.input} out=${got?.output}/${want.output} cache=${got?.cache}/${want.cache} total=${got?.total}/${want.total} replies=${got?.replies}/${want.replies}`)
}

// Token arithmetic must agree with the per-day parts.
for (const day of summary.days) {
	if (day.total !== day.input + day.output + day.cache) {
		failures += 1
		console.log(`FAIL ${day.day}: total ${day.total} != input+output+cache ${day.input + day.output + day.cache}`)
	}
}
const sumTotal = summary.days.reduce((acc, day) => acc + day.total, 0)
if (sumTotal !== summary.meta.totalTokens) {
	failures += 1
	console.log(`FAIL meta.totalTokens ${summary.meta.totalTokens} != sum ${sumTotal}`)
}

// Legacy v1 shape (bare hash array per day) must still read.
const legacy = { version: 1, updatedAt: 0, sessions: { 'sess-old': { days: { [summary.today]: ['aaa', 'bbb'] }, final: true } } }
const legacyDay = buildSummary(legacy).days.at(-1)
const legacyOk = legacyDay && legacyDay.messages === 2 && legacyDay.total === 0
if (!legacyOk) failures += 1
console.log(`${legacyOk ? 'PASS' : 'FAIL'} legacy hash-array day reads as 2 prompts, 0 tokens`)

// Idempotence: folding the same logs twice must not change any number.
const before = JSON.stringify(buildSummary(state).days)
for (const [sessionId, record] of Object.entries(state.sessions)) {
	for (const [day, entry] of Object.entries(record.days)) {
		for (const hash of entry.prompts) recordPrompt(state, sessionId, day, hash)
		for (const [hash, usage] of Object.entries(entry.replies)) recordUsage(state, sessionId, day, hash, usage)
	}
}
const after = JSON.stringify(buildSummary(state).days)
const idempotent = before === after
if (!idempotent) failures += 1
console.log(`${idempotent ? 'PASS' : 'FAIL'} re-recording every fact changes nothing`)

// Usage normalization tolerates the shape without cacheReadTokens.
const bare = usageOf({ inputTokens: 5, outputTokens: 7, totalTokens: 12 })
const bareOk = bare && bare.cache === 0 && bare.total === 12
if (!bareOk) failures += 1
console.log(`${bareOk ? 'PASS' : 'FAIL'} usage without cacheReadTokens normalizes to cache=0`)
if (usageOf(undefined) !== undefined || usageOf({}) !== undefined) {
	failures += 1
	console.log('FAIL empty usage should normalize to undefined')
}

console.log(failures === 0 ? '\nALL PASS' : `\nFAILURES: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
