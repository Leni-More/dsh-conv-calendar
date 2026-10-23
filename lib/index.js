/**
 * dsh-conv-calendar — host half.
 *
 * Counts exactly one thing: a human prompt, i.e. a `user/message` session event
 * whose `data.source.kind === 'user'`. Injected context messages (runtime
 * context, skill catalog, time context, reminders …) carry their own source
 * kinds and are therefore never counted.
 *
 * Counts are stored per session and per local day as a set of hashed message
 * ids, which gives two properties for free:
 *   - a forked session copies its ancestor's prompts, but the copied ids hash to
 *     the same value, so one prompt is counted once across every log that holds
 *     it;
 *   - merging a log into a day can never double count, because the day holds a
 *     set.
 *
 * Two sources feed the store:
 *   - the live `session/event` feed, from mount onwards;
 *   - session history, read through the Host's own `sessionQuery` service, which
 *     owns log decoding (the zstd logs are appended frame by frame, so a plain
 *     one-shot decompress would read only the first frame). A persisted session
 *     is read once and kept; a live session is re-read and merged.
 *
 * HTTP: `GET /dsh-conv-calendar/api/summary[?refresh=1]` answers the JSON the
 * browser calendar renders. Nothing here is model-facing.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Cordis plugin name (the Loader entry id). */
export const name = 'dsh-conv-calendar'

/** The calendar only keeps state while a Web carrier can serve it. */
export const inject = ['webServer']

/** Exact HTTP route the browser half reads. */
const ROUTE = '/dsh-conv-calendar/api/summary'

/**
 * State layout version.
 *
 * 1 — `days[day]` was a bare array of prompt hashes.
 * 2 — `days[day]` is `{ prompts: [], replies: { hash: usage } }`, which is what
 *     token accounting needs. A version bump drops the incompatible store
 *     instead of migrating it: the store is a cache, and one full re-read of the
 *     session logs rebuilds it with the richer shape.
 */
const STATE_VERSION = 2

/** Budget for one history refresh; a partial pass keeps what it read. */
const HISTORY_BUDGET_MS = 8_000

/** How many days the response may carry (a little over eight years). */
const MAX_REPORTED_DAYS = 3_000

// ---------------------------------------------------------------------------
// paths and small helpers
// ---------------------------------------------------------------------------

/** The harness home: `$DSH_HOME`, else `~/.dsh`. */
function dshHome() {
	const fromEnv = process.env.DSH_HOME?.trim()
	return fromEnv ? fromEnv : join(homedir(), '.dsh')
}

/** Durable counter state, kept beside the other plugin-owned files. */
function stateFile() {
	return join(dshHome(), 'plugins', 'dsh-conv-calendar', 'state.json')
}

function pad2(value) {
	return String(value).padStart(2, '0')
}

/** Local-time day key (`YYYY-MM-DD`) for one epoch millisecond value. */
export function dayKey(ms) {
	const date = new Date(Number(ms))
	if (Number.isNaN(date.getTime())) return undefined
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Stable short digest for one counted prompt. */
export function messageHash(id, sessionId, seq) {
	const basis = typeof id === 'string' && id !== '' ? id : `${sessionId}#${String(seq ?? '')}`
	return createHash('sha1').update(basis).digest('hex').slice(0, 16)
}

/** Resolve the machine's IANA zone so the browser can label the calendar. */
function timeZoneName() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
	} catch {
		return 'local'
	}
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

function emptyState() {
	return { version: STATE_VERSION, updatedAt: 0, sessions: {} }
}

/** Read the durable store, falling back to an empty one on any defect. */
export function loadState(file = stateFile()) {
	try {
		const parsed = JSON.parse(readFileSync(file, 'utf8'))
		if (parsed && parsed.version === STATE_VERSION && parsed.sessions && typeof parsed.sessions === 'object') {
			return parsed
		}
	} catch {
		/* missing or unreadable: start empty */
	}
	return emptyState()
}

/** Write the store atomically (temp file + rename) so a crash cannot truncate it. */
export function saveState(state, file = stateFile()) {
	state.updatedAt = Date.now()
	const temporary = `${file}.${process.pid}.tmp`
	try {
		mkdirSync(dirname(file), { recursive: true })
		writeFileSync(temporary, `${JSON.stringify(state)}\n`, 'utf8')
		renameSync(temporary, file)
		return true
	} catch {
		try {
			unlinkSync(temporary)
		} catch {
			/* nothing to clean */
		}
		return false
	}
}

/**
 * One day's stored facts.
 *
 * `prompts` holds a hashed id per human prompt; `replies` holds one usage record
 * per assistant message, keyed by the same kind of hash. Both are sets, so
 * merging a log twice can never double count, and a forked session's copied
 * history hashes to the same keys and collapses into the ancestor's entries.
 *
 * Version 1 stored a bare hash array per day; {@link dayRecord} upgrades that
 * shape on read.
 */
function dayRecord(container, day) {
	let entry = container[day]
	if (Array.isArray(entry)) {
		entry = { prompts: entry, replies: {} }
		container[day] = entry
	} else if (!entry || typeof entry !== 'object') {
		entry = { prompts: [], replies: {} }
		container[day] = entry
	}
	if (!Array.isArray(entry.prompts)) entry.prompts = []
	if (!entry.replies || typeof entry.replies !== 'object') entry.replies = {}
	return entry
}

/** One session record: `days` plus whether its log is complete. */
function sessionRecord(state, sessionId) {
	let record = state.sessions[sessionId]
	if (!record || typeof record !== 'object') {
		record = { days: {} }
		state.sessions[sessionId] = record
	}
	if (!record.days || typeof record.days !== 'object') record.days = {}
	return record
}

/**
 * Count one prompt for one session/day pair.
 * @returns `true` when the prompt was not counted before (the caller persists).
 */
export function recordPrompt(state, sessionId, day, hash) {
	if (typeof day !== 'string' || typeof hash !== 'string') return false
	const entry = dayRecord(sessionRecord(state, sessionId).days, day)
	if (entry.prompts.includes(hash)) return false
	entry.prompts.push(hash)
	return true
}

/** Normalize one provider usage report into the four numbers we keep. */
export function usageOf(usage) {
	if (!usage || typeof usage !== 'object') return undefined
	const input = Number(usage.inputTokens)
	const output = Number(usage.outputTokens)
	const cache = Number(usage.cacheReadTokens ?? 0)
	const total = Number(usage.totalTokens)
	if (!Number.isFinite(input) && !Number.isFinite(output) && !Number.isFinite(total)) return undefined
	const safeInput = Number.isFinite(input) ? input : 0
	const safeOutput = Number.isFinite(output) ? output : 0
	const safeCache = Number.isFinite(cache) ? cache : 0
	return {
		input: safeInput,
		output: safeOutput,
		cache: safeCache,
		total: Number.isFinite(total) ? total : safeInput + safeOutput + safeCache,
	}
}

/**
 * Record one assistant reply's token usage for a session/day pair.
 * @returns `true` when the reply was not recorded before (the caller persists).
 */
export function recordUsage(state, sessionId, day, hash, usage) {
	if (typeof day !== 'string' || typeof hash !== 'string' || !usage) return false
	const entry = dayRecord(sessionRecord(state, sessionId).days, day)
	const previous = entry.replies[hash]
	if (previous && previous.total === usage.total && previous.input === usage.input && previous.output === usage.output) {
		return false
	}
	entry.replies[hash] = usage
	return true
}

// ---------------------------------------------------------------------------
// history fold
// ---------------------------------------------------------------------------

/**
 * Fold one session log into per-day facts: human prompts, and the token usage
 * of every assistant message that reported one.
 *
 * @param events - the session's raw events, oldest first.
 * @param sessionId - owning session id, used as the hash fallback.
 */
export function foldEvents(events, sessionId) {
	const days = {}
	if (!Array.isArray(events)) return days
	for (const event of events) {
		if (!event) continue
		if (event.type === 'user/message') {
			const source = event.data?.source
			if (!source || source.kind !== 'user') continue
			const day = dayKey(event.time)
			if (!day) continue
			const entry = dayRecord(days, day)
			const hash = messageHash(event.data?.id, sessionId, event.seq)
			if (!entry.prompts.includes(hash)) entry.prompts.push(hash)
			continue
		}
		if (event.type === 'assistant/message') {
			const usage = usageOf(event.data?.usage)
			if (!usage) continue
			const day = dayKey(event.time)
			if (!day) continue
			const entry = dayRecord(days, day)
			const hash = messageHash(event.data?.message?.id, sessionId, event.seq)
			entry.replies[hash] = usage
		}
	}
	return days
}

/**
 * Read session history through the Host's own query service.
 *
 * A persisted session is read once and marked `final` — its log can no longer
 * change. A live session may still grow, so its fresh fold is merged into the
 * stored one instead of replacing it (a merge is idempotent because a day holds
 * a set).
 *
 * @param ctx - host context.
 * @param state - store to update in place.
 * @param options - `budgetMs` bounds one pass.
 * @returns a report of what the pass did.
 */
export async function refreshHistory(ctx, state, options = {}) {
	const startedAt = Date.now()
	const budgetMs = options.budgetMs ?? HISTORY_BUDGET_MS
	const query = ctx.get?.('sessionQuery')
	const report = {
		available: typeof query?.listSessions === 'function' && typeof query?.readSession === 'function',
		ranAt: startedAt,
		elapsedMs: 0,
		sessions: 0,
		read: 0,
		cached: 0,
		failed: 0,
		partial: false,
	}
	if (!report.available) {
		report.elapsedMs = Date.now() - startedAt
		return report
	}

	let listed
	try {
		listed = await query.listSessions()
	} catch {
		report.failed += 1
		report.elapsedMs = Date.now() - startedAt
		return report
	}
	if (!Array.isArray(listed)) {
		report.failed += 1
		report.elapsedMs = Date.now() - startedAt
		return report
	}

	for (const entry of listed) {
		const id = entry?.header?.id
		if (typeof id !== 'string' || id === '') continue
		report.sessions += 1
		const existing = state.sessions[id]
		/* A completed log is final; a session that is live in this process is not. */
		if (existing?.final === true && entry.live !== true) {
			report.cached += 1
			continue
		}
		if (Date.now() - startedAt > budgetMs) {
			report.partial = true
			break
		}
		try {
			const read = await query.readSession(id)
			const days = foldEvents(read?.events, id)
			const record = sessionRecord(state, id)
			if (entry.live === true && existing) {
				/* Merge: a live log may lag the events this run already counted. */
				for (const day of Object.keys(days)) {
					const fresh = dayRecord(days, day)
					for (const hash of fresh.prompts) recordPrompt(state, id, day, hash)
					for (const hash of Object.keys(fresh.replies)) recordUsage(state, id, day, hash, fresh.replies[hash])
				}
			} else {
				record.days = days
			}
			record.final = entry.live !== true
			report.read += 1
		} catch {
			report.failed += 1
		}
	}

	report.elapsedMs = Date.now() - startedAt
	return report
}

// ---------------------------------------------------------------------------
// read model
// ---------------------------------------------------------------------------

/**
 * Aggregate every session record into one day list plus the totals the panel
 * prints. Prompts and replies are deduplicated across sessions by message hash,
 * so a forked session's inherited history collapses into its ancestor's day.
 */
export function buildSummary(state) {
	/** day → { prompts: Set, replies: Map } */
	const byDay = new Map()

	const bucketOf = (day) => {
		let bucket = byDay.get(day)
		if (!bucket) byDay.set(day, (bucket = { prompts: new Set(), replies: new Map(), sessions: new Set() }))
		return bucket
	}

	for (const [sessionId, record] of Object.entries(state.sessions)) {
		const days = record && record.days
		if (!days || typeof days !== 'object') continue
		for (const day of Object.keys(days)) {
			const entry = dayRecord(days, day)
			const hasPrompts = entry.prompts.length > 0
			const hasReplies = Object.keys(entry.replies).length > 0
			if (!hasPrompts && !hasReplies) continue
			const bucket = bucketOf(day)
			for (const hash of entry.prompts) bucket.prompts.add(hash)
			for (const [hash, usage] of Object.entries(entry.replies)) bucket.replies.set(hash, usage)
			bucket.sessions.add(sessionId)
		}
	}

	const days = [...byDay.keys()]
		.sort()
		.slice(-MAX_REPORTED_DAYS)
		.map((day) => {
			const bucket = byDay.get(day)
			let input = 0
			let output = 0
			let cache = 0
			let total = 0
			for (const usage of bucket.replies.values()) {
				input += usage.input
				output += usage.output
				cache += usage.cache
				total += usage.total
			}
			return {
				day,
				messages: bucket.prompts.size,
				sessions: bucket.sessions.size,
				replies: bucket.replies.size,
				input,
				output,
				cache,
				total,
			}
		})

	const sum = (key) => days.reduce((acc, item) => acc + item[key], 0)
	return {
		version: STATE_VERSION,
		timeZone: timeZoneName(),
		today: dayKey(Date.now()),
		days,
		meta: {
			updatedAt: state.updatedAt ?? 0,
			sessions: Object.keys(state.sessions).length,
			activeDays: days.filter((item) => item.messages > 0).length,
			totalMessages: sum('messages'),
			totalReplies: sum('replies'),
			totalInput: sum('input'),
			totalOutput: sum('output'),
			totalCache: sum('cache'),
			totalTokens: sum('total'),
		},
	}
}

// ---------------------------------------------------------------------------
// cordis plugin surface
// ---------------------------------------------------------------------------

/**
 * Mount the plugin.
 * @param ctx - host cordis context (serves the summary once a Web carrier exists).
 */
export function apply(ctx) {
	/** Live + historical counter state, kept in memory between writes. */
	const state = loadState()
	/** Set while a history pass is in flight so the route can report progress. */
	let historyTask = null
	/** Last history report, surfaced in the payload for the client footer. */
	let historyReport = null
	let saveTimer

	const flush = () => {
		if (saveTimer !== undefined) {
			clearTimeout(saveTimer)
			saveTimer = undefined
		}
		saveState(state)
	}

	const scheduleSave = () => {
		if (saveTimer !== undefined) return
		saveTimer = setTimeout(() => {
			saveTimer = undefined
			saveState(state)
		}, 1200)
		try {
			saveTimer.unref?.()
		} catch {
			/* not a Node timer handle: keep the write scheduled */
		}
	}

	/**
	 * Read history once per in-flight pass. A forced pass waits for the running
	 * one and then reads again, so `?refresh=1` is a real refresh; completed
	 * sessions are cached, so only live ones are re-read.
	 */
	const ensureHistory = (force = false) => {
		const run = async () => {
			try {
				const report = await refreshHistory(ctx, state)
				historyReport = report
				if (report.read > 0) flush()
			} catch (error) {
				ctx.logger?.warn?.(`[dsh-conv-calendar] history read failed: ${String(error?.message ?? error)}`)
			} finally {
				historyTask = null
			}
		}
		if (historyTask !== null) {
			if (!force) return historyTask
			historyTask = historyTask.then(() => run())
			return historyTask
		}
		historyTask = run()
		return historyTask
	}

	ctx.on('session/event', (session, event) => {
		try {
			if (!event) return
			const day = dayKey(event.time ?? Date.now())
			if (!day) return
			const sessionId = String(session?.id ?? 'unknown')

			if (event.type === 'user/message') {
				const source = event.data?.source
				if (!source || source.kind !== 'user') return
				const hash = messageHash(event.data?.id, sessionId, event.seq)
				if (recordPrompt(state, sessionId, day, hash)) scheduleSave()
				return
			}

			if (event.type === 'assistant/message') {
				const usage = usageOf(event.data?.usage)
				if (!usage) return
				const hash = messageHash(event.data?.message?.id, sessionId, event.seq)
				if (recordUsage(state, sessionId, day, hash, usage)) scheduleSave()
			}
		} catch (error) {
			ctx.logger?.debug?.(`[dsh-conv-calendar] live event skipped: ${String(error?.message ?? error)}`)
		}
	})

	ctx.effect(() => {
		/* Read history after the tree settles so startup is never held up. */
		const timer = setTimeout(() => void ensureHistory(), 0)
		timer.unref?.()
		return () => {
			clearTimeout(timer)
			flush()
		}
	}, 'dsh-conv-calendar: history and flush')

	/**
	 * Refuse a request the Host's own fence would refuse; without a fence
	 * service (a hand-built tree) the loopback listener stays the boundary.
	 */
	const rejection = (request) => {
		try {
			const connection = ctx.get?.('connection')
			if (!connection || typeof connection.requestRejection !== 'function') return 0
			const code = connection.requestRejection(request)
			if (code === undefined || code === null || code === false || code === 0) return 0
			return typeof code === 'number' ? code : 403
		} catch {
			return 403
		}
	}

	/**
	 * Serve the summary while a Web carrier exists. The imperative
	 * `ctx.inject()` form is deliberate: the Loader honours a namespace-level
	 * `inject` export only for class plugins, so a function plugin reaches the
	 * service here, and the callback re-runs when the carrier is replaced.
	 */
	ctx.inject(['webServer'], (inner) => {
		inner.effect(
			() =>
				inner.webServer.register({
					kind: 'exact',
					path: ROUTE,
					handler: async (request, response) => {
						const denied = rejection(request)
						if (denied) {
							response.statusCode = denied
							response.end()
							return
						}
						if (request.method !== 'GET' && request.method !== 'HEAD') {
							response.statusCode = 405
							response.setHeader('allow', 'GET, HEAD')
							response.end()
							return
						}
						const url = new URL(request.url ?? ROUTE, 'http://localhost')
						if (url.searchParams.get('refresh') === '1') {
							await ensureHistory(true)
						} else if (historyReport === null && historyTask === null) {
							void ensureHistory()
						}
						let body
						try {
							body = JSON.stringify({
								...buildSummary(state),
								history: historyReport,
								historyPending: historyTask !== null,
							})
						} catch (error) {
							response.statusCode = 500
							response.setHeader('content-type', 'application/json; charset=utf-8')
							response.end(JSON.stringify({ error: String(error?.message ?? error) }))
							return
						}
						response.statusCode = 200
						response.setHeader('content-type', 'application/json; charset=utf-8')
						response.setHeader('cache-control', 'no-store')
						response.setHeader('content-length', Buffer.byteLength(body))
						response.end(request.method === 'HEAD' ? undefined : body)
					},
				}),
			'dsh-conv-calendar: summary route',
		)
		ctx.logger?.info?.(`[dsh-conv-calendar] serving ${ROUTE}`)
	})
}

export default apply
