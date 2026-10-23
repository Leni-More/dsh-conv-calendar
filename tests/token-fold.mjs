// Fold session logs through the plugin's own host code and compare the per-day token
// numbers against an independent pass over the same events.
//
// By default this reads the real logs under $DSH_HOME/sessions, which is how the fold
// was validated during development. CI has no such directory, so when the path is
// missing it builds an equivalent fixture in a temp directory: several zstd frames
// appended to one file, which is the shape that made a one-shot decompress read only
// the first frame.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { foldEvents, buildSummary, recordUsage, recordPrompt, dayKey, usageOf } from '../lib/index.js'

const REAL_ROOT = 'C:/Users/LeniMore/.dsh/sessions'

/**
 * Write a synthetic session tree shaped like a real one: one directory per session,
 * one `session.v4.jsonl.zstd` each, holding several zstd frames.
 * @returns the temporary root, which the caller removes.
 */
function buildFixture() {
	const root = mkdtempSync(join(tmpdir(), 'dsh-conv-calendar-'))
	const day = (offset, hour) => {
		const date = new Date()
		date.setDate(date.getDate() - offset)
		date.setHours(hour, 0, 0, 0)
		return date.getTime()
	}

	/** `frames` mirrors how the Host appends: the file is many zstd streams in a row. */
	const write = (sessionId, frames) => {
		const directory = join(root, sessionId)
		mkdirSync(directory, { recursive: true })
		const payload = frames
			.map((events) => zstdCompressSync(Buffer.from(events.map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8')))
			.reduce((acc, chunk) => Buffer.concat([acc, chunk]), Buffer.alloc(0))
		writeFileSync(join(directory, 'session.v4.jsonl.zstd'), payload)
	}

	const prompt = (id, time) => ({ type: 'user/message', time, data: { id, source: { kind: 'user' } } })
	const injected = (id, time) => ({ type: 'user/message', time, data: { id, source: { kind: 'runtime-context' } } })
	const reply = (id, time, usage) => ({ type: 'assistant/message', time, data: { message: { id }, usage } })
	/* Two shapes appear in real logs: with and without cacheReadTokens. */
	const full = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 1000, totalTokens: 1120 }
	const bare = { inputTokens: 5, outputTokens: 7, totalTokens: 12 }

	write('session-a', [
		[prompt('a1', day(2, 10)), prompt('a2', day(2, 11))],
		[reply('ar1', day(2, 12), full), reply('ar2', day(2, 13), bare)],
		[injected('ax1', day(2, 14)), reply('ar3', day(1, 9), full)],
	])
	/* A forked session repeats ancestor events verbatim: same ids must not double count. */
	write('session-a-fork', [[prompt('a1', day(2, 10)), reply('ar1', day(2, 12), full)]])
	write('session-b', [[reply('br1', day(1, 15), bare)]])
	return root
}

const requested = process.argv[2]
const realRoot = requested ?? REAL_ROOT
const usingFixture = !existsSync(realRoot)
let fixtureRoot
if (usingFixture) {
	fixtureRoot = buildFixture()
	console.log(`no session logs at ${realRoot}; using a generated fixture instead`)
}
const root = usingFixture ? fixtureRoot : realRoot

/** zstd frame magic, little-endian. */
const ZSTD_MAGIC = 0xfd2fb528

/**
 * Decode a file that may contain several concatenated zstd frames.
 *
 * A single `zstdDecompressSync` over the whole buffer returns only the first frame on
 * some runtimes — the exact reason the Host reads history through `sessionQuery` instead
 * of decompressing the log itself. Here each frame is located by its magic number and
 * decompressed in turn, so the reference pass is independent of that behaviour.
 *
 * @param buffer - the raw file bytes.
 * @returns the decoded text.
 */
function decodeFrames(buffer) {
	if (buffer.length < 4 || buffer.readUInt32LE(0) !== ZSTD_MAGIC) return buffer.toString('utf8')
	const offsets = []
	for (let index = 0; index + 4 <= buffer.length; index += 1) {
		if (buffer.readUInt32LE(index) === ZSTD_MAGIC) {
			offsets.push(index)
			index += 3
		}
	}
	/* `offsets` always starts at 0 because of the check above. */
	let text = ''
	for (let index = 0; index < offsets.length; index += 1) {
		const slice = buffer.subarray(offsets[index], offsets[index + 1] ?? buffer.length)
		text += zstdDecompressSync(slice).toString('utf8')
	}
	return text
}

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
	const text = decodeFrames(buffer)
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
	const text = decodeFrames(buffer)
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
const withoutCache = usageOf({ inputTokens: 5, outputTokens: 7, totalTokens: 12 })
const bareOk = withoutCache && withoutCache.cache === 0 && withoutCache.total === 12
if (!bareOk) failures += 1
console.log(`${bareOk ? 'PASS' : 'FAIL'} usage without cacheReadTokens normalizes to cache=0`)
if (usageOf(undefined) !== undefined || usageOf({}) !== undefined) {
	failures += 1
	console.log('FAIL empty usage should normalize to undefined')
}

// Fixture-only checks: the synthetic tree encodes facts the real logs cannot assert.
if (usingFixture) {
	const check = (label, actual, want) => {
		const ok = actual === want
		if (!ok) failures += 1
		console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expected ${want})`}`)
	}

	// Three sessions on disk. session-a holds prompts a1/a2 and replies ar1/ar2/ar3;
	// session-a-fork repeats a1 and ar1 verbatim, so the distinct totals are 2 prompts
	// and 4 replies — the fork adds nothing.
	check('fixture sessions', Object.keys(state.sessions).length, 3)
	check('fixture total prompts (fork deduplicated)', summary.meta.totalMessages, 2)
	check('fixture total replies (fork deduplicated)', summary.meta.totalReplies, 4)
	/* ar1 (full) + ar2 (bare) + ar3 (full) + br1 (bare) = 1120 + 12 + 1120 + 12. */
	check('fixture total tokens', summary.meta.totalTokens, 2264)
	check('fixture total input', summary.meta.totalInput, 210)
	check('fixture total output', summary.meta.totalOutput, 54)
	check('fixture total cache', summary.meta.totalCache, 2000)

	// Every frame must have been read, not just the first one of each file.
	const firstFrameOnly = [...expected.values()].reduce((a, b) => a + b.replies, 0)
	check('fixture replies across all frames', firstFrameOnly, 4)
}

if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true })

console.log(failures === 0 ? '\nALL PASS' : `\nFAILURES: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
