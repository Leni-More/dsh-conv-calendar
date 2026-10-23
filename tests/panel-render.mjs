// Browser-half smoke test: load the hand-written factory bundle in a jsdom
// page, mount the panel with a stubbed host route, and assert what a user sees.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const ReactDOMClient = nodeRequire('react-dom/client')
const { act } = nodeRequire('react')

const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body><div id="root"></div></body></html>', {
	url: 'http://127.0.0.1:56542/',
	pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.HTMLElement = window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// --- capture the bundle through the module loader facade ---------------------
const captured = []
window.__ModuleLoader__ = { load: (record) => captured.push(record) }
window.eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
if (captured.length !== 1) throw new Error(`expected one bundle registration, got ${captured.length}`)
const bundle = captured[0]
console.log('bundle id:', bundle.id)
const mod = bundle.factory((id) => {
	if (id === 'react') return React
	throw new Error(`unexpected external: ${id}`)
})
console.log('exports:', Object.keys(mod).sort().join(', '))

// --- stub the host route ------------------------------------------------------
const DAY = 86_400_000
const today = new Date()
const days = []
for (let offset = 400; offset >= 0; offset -= 1) {
	const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
	const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
	const value = offset % 7 === 0 ? 0 : (offset % 5) + 1
	if (value > 0) days.push({ day: key, messages: value, sessions: 1 + (value % 3) })
}
const payload = {
	version: 1,
	timeZone: 'Asia/Shanghai',
	today: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
	days,
	meta: { updatedAt: Date.now(), sessions: 7, activeDays: days.length, totalMessages: days.reduce((s, d) => s + d.messages, 0) },
	scan: { scanned: 7, skipped: 0, failed: 0, partial: false },
	scanning: false,
}
const calls = []
globalThis.fetch = async (url, init) => {
	calls.push({ url: String(url), init })
	return {
		ok: true,
		status: 200,
		json: async () => payload,
	}
}
window.fetch = globalThis.fetch

// --- mount through the plugin body -------------------------------------------
const slots = []
const ctx = {
	effect: (callback) => {
		const dispose = callback()
		return () => dispose?.()
	},
	locale: {
		register: (ns, dictionary) => {
			console.log('locale namespace:', ns, 'zh keys:', Object.keys(dictionary.zh).length, 'en keys:', Object.keys(dictionary.en).length)
		},
		bind: () => (key, values) =>
			String(dictionaryZh()[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (values && k in values ? String(values[k]) : m)),
	},
	slots: {
		inject: (name, factory) => {
			slots.push(name)
			return factory()
		},
		register: (options, component) => {
			slots.push({ ...options })
			return () => {}
		},
	},
}
let registered = []
ctx.slots.register = (options, component) => {
	registered.push({ options, component })
	return () => {}
}

function dictionaryZh() {
	return {
		'page.title': '对话日历',
		'page.subtitle': '每天发出的对话条数',
		'metric.messages': '消息',
		'metric.sessions': '会话',
		'stat.total': '总对话',
		'stat.totalSessions': '总会话',
		'stat.activeDays': '活跃 {n} 天',
		'stat.streak': '当前连续',
		'stat.longest': '最长 {n} 天',
		'stat.month': '本月',
		'stat.lastMonth': '上月 {n}',
		'stat.busiest': '最忙一天',
		'stat.none': '暂无记录',
		'stat.unit': '{n} 天',
		'chart.range': '过去 53 周',
		'chart.less': '少',
		'chart.more': '多',
		'chart.empty': '还没有记录到对话',
		'chart.emptyHint': '发一条消息试试',
		'chart.error': '读取失败',
		'chart.retry': '重试',
		'chart.refresh': '刷新',
		'chart.scanning': '正在扫描',
		'chart.updated': '更新于 {time}',
		'chart.source': '共 {sessions} 个会话',
		'chart.footnote': '只统计你发的消息',
		'tip.none': '没有对话',
		'tip.messages': '{n} 条消息',
		'tip.sessions': '{n} 个会话',
		'weekday.mon': '一',
		'weekday.wed': '三',
		'weekday.fri': '五',
		'panel.label': '对话日历',
	}
}

const errors = []
const originalError = console.error
console.error = (...args) => {
	errors.push(args.map(String).join(' '))
	originalError(...args)
}

act(() => mod.apply(ctx))

console.log('slot registrations:', registered.map((r) => `${r.options.name}${r.options.key ? '#' + r.options.key : ''}${r.options.id ? '@' + r.options.id : ''}`).join(' | '))
const icon = registered.find((r) => r.options.name === 'sidebar.panellist')
const panel = registered.find((r) => r.options.name === 'main')

// Icon render: the sidebar hands it { size, active }.
const iconHtml = ReactDOMClient ? null : null
const iconMarkup = nodeRequire('react-dom/server').renderToStaticMarkup(
	React.createElement(icon.component, { size: 18, active: true }),
)
console.log('icon markup ok:', iconMarkup.startsWith('<svg') && iconMarkup.includes('rect'))

// Panel render with the real component and the stubbed route.
const t = ctx.locale.bind('convCalendar')
const container = document.getElementById('root')
const root = ReactDOMClient.createRoot(container)
await act(async () => {
	root.render(React.createElement(panel.component, { t }))
	await Promise.resolve()
	await Promise.resolve()
})

const cells = container.querySelectorAll('.dcv-cell')
const filled = [...cells].filter((cell) => Number(cell.dataset.l) > 0).length
const future = [...cells].filter((cell) => cell.dataset.future === '1').length
const stats = [...container.querySelectorAll('.dcv-stat')].map((card) => card.textContent)
const months = [...container.querySelectorAll('.dcv-months span')].map((s) => s.textContent)
const title = container.querySelector('.dcv-title')?.textContent

console.log('title:', title)
console.log('cells:', cells.length, 'filled:', filled, 'future:', future)
console.log('months:', months.join(' '))
console.log('stats:', stats)
console.log('fetch calls:', calls.length, calls[0]?.url, 'credentials:', calls[0]?.init?.credentials)
console.log('foot:', container.querySelector('.dcv-foot')?.textContent)

// Hover one filled cell and read the tooltip the way a user would.
const target = [...cells].find((cell) => Number(cell.dataset.l) > 0)
await act(async () => {
	target.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
})
const tip = document.querySelector('.dcv-tip')
console.log('tooltip:', tip?.textContent)
await act(async () => {
	target.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }))
})
console.log('tooltip dismissed:', document.querySelector('.dcv-tip') === null)

// Metric switch: sessions recompute every number.
const buttons = [...container.querySelectorAll('.dcv-seg button')]
await act(async () => {
	buttons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
})
console.log('after switch stats:', [...container.querySelectorAll('.dcv-stat')].map((card) => card.textContent))
console.log('after switch cells filled:', [...container.querySelectorAll('.dcv-cell')].filter((c) => Number(c.dataset.l) > 0).length)

// Refresh button performs a forced (refresh=1) read.
await act(async () => {
	container.querySelector('.dcv-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
	await Promise.resolve()
})
console.log('refresh calls:', calls.map((c) => c.url).join(' , '))

console.log('react errors:', errors.length)
if (errors.length) console.log(errors.slice(0, 5).join('\n---\n'))
process.exit(errors.length ? 1 : 0)
