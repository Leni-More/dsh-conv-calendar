// Load the plugin through the real cordis runtime with a stubbed Web carrier and
// session-query service, then drive the HTTP handler the way the server does.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'

const home = join(tmpdir(), 'dsh-conv-calendar-test-home')
rmSync(home, { recursive: true, force: true })
process.env.DSH_HOME = home

const failures = []
const check = (label, actual, expected) => {
	const ok = JSON.stringify(actual) === JSON.stringify(expected)
	console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
	if (!ok) failures.push(label)
}

const routes = []
const webServer = {
	port: 1234,
	register(route) {
		routes.push(route)
		return () => {
			const index = routes.indexOf(route)
			if (index >= 0) routes.splice(index, 1)
		}
	},
	getOrigin() {
		return 'http://127.0.0.1:1234'
	},
}

/** Two persisted sessions: one closed, one still live. */
const sessions = [
	{ header: { id: 'session-closed' }, live: false, persisted: true },
	{ header: { id: 'session-live' }, live: true, persisted: true },
]
const reads = []
const now = Date.now()
const eventsOf = {
	'session-closed': [
		{ type: 'user/message', seq: 0, time: now - 60_000, data: { id: 'a1', source: { kind: 'user' } } },
		{ type: 'user/message', seq: 1, time: now - 60_000, data: { id: 'a2', source: { kind: 'user' } } },
		{ type: 'user/message', seq: 2, time: now - 60_000, data: { id: 'a3', source: { kind: 'runtime-context' } } },
		{
			type: 'assistant/message',
			seq: 3,
			time: now - 60_000,
			data: {
				message: { id: 'r1' },
				usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 1000, totalTokens: 1120 },
			},
		},
		/* A reply without usage must not contribute tokens. */
		{ type: 'assistant/message', seq: 4, time: now - 60_000, data: { message: { id: 'r2' } } },
	],
	'session-live': [{ type: 'user/message', seq: 0, time: now, data: { id: 'b1', source: { kind: 'user' } } }],
}
const sessionQuery = {
	async listSessions() {
		return sessions
	},
	async readSession(id) {
		reads.push(id)
		return { events: eventsOf[id] ?? [] }
	},
}

const ctx = new Context()
const errors = []
ctx.on('internal/error', (info) => errors.push(String(info.message ?? info)))
ctx.provide('webServer', webServer)
ctx.provide('sessionQuery', sessionQuery)

const plugin = await import('../lib/index.js')
const fork = ctx.plugin(plugin)
await new Promise((resolve) => setTimeout(resolve, 200))

check('route', routes.map((route) => `${route.kind} ${route.path}`), ['exact /dsh-conv-calendar/api/summary'])
check('load errors', errors.length, 0)

const call = async (url, method = 'GET') => {
	const chunks = []
	const response = {
		statusCode: 0,
		headers: {},
		setHeader(name, value) {
			this.headers[name.toLowerCase()] = value
		},
		end(body) {
			if (body !== undefined) chunks.push(Buffer.from(body))
		},
	}
	await routes[0].handler({ method, url, headers: {} }, response)
	return {
		status: response.statusCode,
		headers: response.headers,
		json: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'),
	}
}

// 1. A forced pass reads both sessions; injected context is not counted.
const first = await call('/dsh-conv-calendar/api/summary?refresh=1')
check('first status', first.status, 200)
check('first sessions', first.json.meta.sessions, 2)
const pick = (day) => ({ day: day.day, messages: day.messages, sessions: day.sessions })
check('first today', pick(first.json.days.at(-1)), { day: first.json.today, messages: 3, sessions: 2 })
check('first tokens', {
	input: first.json.days.at(-1).input,
	output: first.json.days.at(-1).output,
	cache: first.json.days.at(-1).cache,
	total: first.json.days.at(-1).total,
	replies: first.json.days.at(-1).replies,
}, { input: 100, output: 20, cache: 1000, total: 1120, replies: 1 })
check('first history available', first.json.history.available, true)
check('both logs read', [...new Set(reads)].sort(), ['session-closed', 'session-live'])

// 2. A second pass caches the completed session and re-reads only the live one.
const beforeSecond = reads.length
const second = await call('/dsh-conv-calendar/api/summary?refresh=1')
check('second cached', second.json.history.cached, 1)
check('second read', second.json.history.read, 1)
check('second pass reads', reads.slice(beforeSecond), ['session-live'])

// 3. A live session is re-read even when an earlier process marked it final.
sessions[1].live = true
const stuck = (await import('../lib/index.js')).loadState(
	`${home}/plugins/dsh-conv-calendar/state.json`,
)
check('live record final flag', stuck.sessions['session-live'].final, false)
const beforeReread = reads.length
await call('/dsh-conv-calendar/api/summary?refresh=1')
check('live re-read', reads.slice(beforeReread), ['session-live'])

// 3. Once the live session closes, one more pass finalizes it; afterwards
//    nothing is re-read at all.
sessions[1].live = false
const third = await call('/dsh-conv-calendar/api/summary?refresh=1')
check('third read', third.json.history.read, 1)
const fourth = await call('/dsh-conv-calendar/api/summary?refresh=1')
check('fourth cached', fourth.json.history.cached, 2)
check('fourth read', fourth.json.history.read, 0)

// 4. A prompt this run sees is counted immediately; injected context is not.
ctx.emit('session/event', { id: 'session-live' }, {
	type: 'user/message',
	seq: 9,
	time: Date.now(),
	data: { id: 'c1', source: { kind: 'user' } },
})
ctx.emit('session/event', { id: 'session-live' }, {
	type: 'user/message',
	seq: 10,
	time: Date.now(),
	data: { id: 'c2', source: { kind: 'injected' } },
})
const fifth = await call('/dsh-conv-calendar/api/summary')
check('live today', pick(fifth.json.days.at(-1)), { day: fifth.json.today, messages: 4, sessions: 2 })

// A live reply's usage is recorded the moment the event arrives.
ctx.emit('session/event', { id: 'session-live' }, {
	type: 'assistant/message',
	seq: 11,
	time: Date.now(),
	data: { message: { id: 'r-live' }, usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } },
})
const sixth = await call('/dsh-conv-calendar/api/summary')
check('live reply tokens', { input: sixth.json.days.at(-1).input, output: sixth.json.days.at(-1).output, cache: sixth.json.days.at(-1).cache, total: sixth.json.days.at(-1).total }, { input: 107, output: 23, cache: 1000, total: 1130 })

// 5. HEAD answers headers only; POST is refused; the payload is cache-less JSON.
const head = await call('/dsh-conv-calendar/api/summary', 'HEAD')
check('HEAD status', head.status, 200)
const post = await call('/dsh-conv-calendar/api/summary', 'POST')
check('POST status', post.status, 405)
check('cache header', fifth.headers['cache-control'], 'no-store')

// 6. The state file was written and reloads to the same numbers.
check('state file written', existsSync(`${home}/plugins/dsh-conv-calendar/state.json`), true)
const reloaded = (await import(`../lib/index.js?ts=${Date.now()}`)).loadState(
	`${home}/plugins/dsh-conv-calendar/state.json`,
)
check('reloaded sessions', Object.keys(reloaded.sessions).sort(), ['session-closed', 'session-live'])
check('reloaded final flags', Object.values(reloaded.sessions).map((record) => record.final), [true, true])

await fork.dispose()
check('routes removed on dispose', routes.length, 0)
check('runtime errors', errors.length, 0)

console.log(failures.length === 0 ? '\nALL PASS' : `\nFAILURES: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
