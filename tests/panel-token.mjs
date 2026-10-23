// Render the panel in jsdom with token data and assert every metric.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const ReactDOMClient = nodeRequire('react-dom/client')
const { act } = nodeRequire('react')

const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="root"></div></body></html>', {
	url: 'http://127.0.0.1:49674/',
	pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const captured = []
window.__ModuleLoader__ = { load: (record) => captured.push(record) }
window.eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
const mod = captured[0].factory((id) => {
	if (id === 'react') return React
	throw new Error(`unexpected external: ${id}`)
})

const now = new Date()
const dayKey = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const days = []
/**
 * Four days whose metrics deliberately do NOT share one ordering: the day with
 * the most prompts is not the day that burned the most tokens. That way each
 * metric must shade the grid differently, which is what the level assertion
 * below checks. Totals are kept round so the formatting assertions stay exact.
 */
const shape = [
	{ messages: 4, sessions: 1, input: 1_000, output: 500, cache: 4_000 },
	{ messages: 1, sessions: 1, input: 20_000, output: 9_000, cache: 300_000 },
	{ messages: 3, sessions: 1, input: 5_000, output: 2_000, cache: 40_000 },
	{ messages: 2, sessions: 1, input: 10_000, output: 4_000, cache: 100_000 },
]
for (let index = 0; index < shape.length; index += 1) {
	const offset = shape.length - 1 - index
	const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
	const row = shape[index]
	days.push({
		day: dayKey(date),
		messages: row.messages,
		sessions: row.sessions,
		replies: row.messages * 2,
		input: row.input,
		output: row.output,
		cache: row.cache,
		total: row.input + row.output + row.cache,
	})
}
const payload = {
	version: 1,
	timeZone: 'Asia/Shanghai',
	today: dayKey(now),
	days,
	meta: {
		updatedAt: Date.now(),
		sessions: 2,
		activeDays: days.length,
		totalMessages: days.reduce((a, d) => a + d.messages, 0),
		totalTokens: days.reduce((a, d) => a + d.total, 0),
		totalOutput: days.reduce((a, d) => a + d.output, 0),
	},
	history: { available: true },
	historyPending: false,
}
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload })
window.fetch = globalThis.fetch

const dictionaries = {}
let registered = []
const ctx = {
	effect: (cb) => {
		const dispose = cb()
		return () => dispose?.()
	},
	locale: {
		register: (ns, d) => {
			dictionaries[ns] = d
		},
		bind: (ns) => (key, values) =>
			String(dictionaries[ns].zh[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (values && k in values ? String(values[k]) : m)),
	},
	slots: {
		inject: (n, f) => f(),
		register: (o, c) => {
			registered.push({ options: o, component: c })
			return () => {}
		},
	},
}
act(() => mod.apply(ctx))
const panel = registered.find((r) => r.options.name === 'main')
const t = ctx.locale.bind('convCalendar')

const root = ReactDOMClient.createRoot(document.getElementById('root'))
await act(async () => {
	root.render(React.createElement(panel.component, { t }))
	await new Promise((r) => setTimeout(r, 20))
})

const text = (node) => node.textContent
const stats = () => [...document.querySelectorAll('.dcv-stat')].map((card) => ({
	label: text(card.querySelector('.dcv-stat-label')),
	value: text(card.querySelector('.dcv-stat-value')),
	sub: text(card.querySelector('.dcv-stat-sub')),
}))
const buttons = () => [...document.querySelectorAll('.dcv-seg button')]
const filled = () => [...document.querySelectorAll('.dcv-cell')].filter((c) => Number(c.dataset.l) > 0).length

console.log('metric buttons:', buttons().map((b) => text(b)))
console.log('default stats:', stats())

let failures = 0
const check = (label, actual, expected) => {
	const ok = JSON.stringify(actual) === JSON.stringify(expected)
	if (!ok) failures += 1
	console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

const expectTotals = {
	messages: days.reduce((sum, day) => sum + day.messages, 0),
	sessions: days.reduce((sum, day) => sum + day.sessions, 0),
	tokens: days.reduce((sum, day) => sum + day.total, 0),
	output: days.reduce((sum, day) => sum + day.output, 0),
}
/** Mirror of the panel's compact token formatting, spelled out independently. */
const compact = (value) =>
	value < 1000 ? String(value) : value < 1_000_000 ? `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k` : `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`
const labels = ['总对话', '总会话', '总 Token', '输出 Token']
const keys = ['messages', 'sessions', 'tokens', 'output']
console.log('expected totals:', expectTotals)

for (let index = 0; index < keys.length; index += 1) {
	const key = keys[index]
	await act(async () => {
		buttons()[index].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
	})
	const card = stats()[0]
	const isToken = key === 'tokens' || key === 'output'
	const expected = isToken ? compact(expectTotals[key]) : String(expectTotals[key])
	check(`${key} label`, card.label, labels[index])
	check(`${key} total`, card.value, expected)
}

// Token tooltip must carry the input/output/cache breakdown.
await act(async () => {
	buttons()[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
})
const cell = [...document.querySelectorAll('.dcv-cell')].find((c) => Number(c.dataset.l) > 0)
await act(async () => {
	cell.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
})
const tip = document.querySelector('.dcv-tip')
console.log('token tooltip:', tip && tip.textContent)
check('tooltip has breakdown', !!(tip && /输入.*输出.*缓存/.test(tip.textContent)), true)

// The grid must colour differently for tokens than for prompts (different maxima).
const levelsForTokens = [...document.querySelectorAll('.dcv-cell')].map((c) => c.dataset.l).join('')
await act(async () => {
	buttons()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
})
const levelsForPrompts = [...document.querySelectorAll('.dcv-cell')].map((c) => c.dataset.l).join('')
check('levels differ per metric', levelsForTokens !== levelsForPrompts, true)
console.log('filled cells:', filled())

console.log(failures === 0 ? '\nALL PASS' : `\nFAILURES: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
