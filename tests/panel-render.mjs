// Browser-half smoke test: load the hand-written factory bundle in a jsdom
// page, mount the panel with a stubbed host route, and assert what a user sees.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const ReactDOMClient = nodeRequire('react-dom/client')
const { act } = nodeRequire('react')

// --- assertions ---------------------------------------------------------------
// A check failure never stops the run: every mismatch is collected and reported,
// so one broken rule still shows what the rest of the panel does.
const failures = []
const check = (name, actual, expected) => {
	const ok = JSON.stringify(actual) === JSON.stringify(expected)
	console.log(ok ? `PASS ${name}` : `FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
	if (!ok) failures.push(name)
}

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
const yearPrefix = `${today.getFullYear()}-`
const days = []
for (let offset = 400; offset >= 0; offset -= 1) {
	const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
	const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
	/*
	 * One deliberately enormous day from last year: if the colour scale or the cards
	 * ever fall back to the whole history, this value flattens the current year and
	 * the assertions below catch it.
	 */
	const value = key.startsWith(yearPrefix) ? (offset % 7 === 0 ? 0 : (offset % 5) + 1) : offset === 400 ? 400 : 0
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
		'stat.total': '今年对话',
		'stat.totalSessions': '今年会话',
		'stat.activeDays': '今年活跃 {n} 天',
		'stat.streak': '当前连续',
		'stat.longest': '最长 {n} 天',
		'stat.month': '本月',
		'stat.lastMonth': '上月 {n}',
		'stat.busiest': '最忙一天',
		'stat.none': '暂无记录',
		'stat.unit': '{n} 天',
		'chart.range': '{year} 年全年',
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

// --- the grid is always one full year, and every card agrees with it ----------
const yearDays = days.filter((item) => item.day.startsWith(yearPrefix))
const lastYearDays = days.filter((item) => !item.day.startsWith(yearPrefix))
const yearMessages = yearDays.reduce((sum, item) => sum + item.messages, 0)
const yearBusiest = Math.max(...yearDays.map((item) => item.messages))
const zhCount = (value) => new Intl.NumberFormat('zh').format(value)
const cardValues = [...container.querySelectorAll('.dcv-stat-value')].map((node) => node.textContent)
const activeSub =
	yearDays.length === 1 ? '今年活跃 1 天' : `今年活跃 ${zhCount(yearDays.length)} 天`

check('grid draws a whole year', cells.length, 371)
check('months run january to december', months, ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'])
check('future squares exist', future > 0, true)
check('fixture spans two years', lastYearDays.length > 0, true)
check('total counts this year only', cardValues[0], zhCount(yearMessages))
check('active days count this year only', container.querySelector('.dcv-stat-sub')?.textContent, activeSub)
check('busiest day stays inside the year', cardValues[3], zhCount(yearBusiest))
check('colour scale ignores last year', Math.max(...[...cells].map((cell) => Number(cell.dataset.l))), 4)

// A future square reports its date and nothing else.
const futureCell = [...cells].find((cell) => cell.dataset.future === '1')
await act(async () => {
	futureCell.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
})
const futureTipText = document.querySelector('.dcv-tip')?.textContent ?? ''
console.log('future tooltip:', futureTipText)
check('future square names its date', /年/.test(futureTipText) && /日/.test(futureTipText), true)
check('future square reports no count', /条消息|没有对话|tokens/.test(futureTipText), false)

// The tooltip has to speak in the same colour as the card labels beside the grid.
const cssText = document.querySelector('style[data-plugin-css]')?.textContent ?? ''
const colorOf = (selector) => {
	const block = cssText.match(new RegExp(`${selector.replace(/\./g, '\\.')}\\{([^}]*)\\}`))
	return block?.[1].match(/color:([^;]+)/)?.[1]?.trim()
}
check('tooltip text uses the card label colour', colorOf('.dcv-tip'), colorOf('.dcv-stat-label'))
check('card label colour found', colorOf('.dcv-stat-label'), 'var(--dcv-faint)')
await act(async () => {
	futureCell.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }))
})

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
console.log(failures.length ? `FAILED checks: ${failures.join(', ')}` : 'ALL CHECKS PASSED')
process.exit(errors.length + failures.length ? 1 : 0)
