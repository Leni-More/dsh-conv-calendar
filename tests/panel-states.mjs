// Edge-case render test: empty payload, failing route, and an English document.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')
const ReactDOMClient = nodeRequire('react-dom/client')
const { act } = nodeRequire('react')

async function mount({ html, payload, fail, language }) {
	const dom = new JSDOM(html, { url: 'http://127.0.0.1:56542/', pretendToBeVisual: true })
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

	globalThis.fetch = async () => {
		if (fail) throw new Error('network down')
		return { ok: true, status: 200, json: async () => payload }
	}
	window.fetch = globalThis.fetch

	const dictionaries = {}
	const registered = []
	const ctx = {
		effect: (callback) => {
			const dispose = callback()
			return () => dispose?.()
		},
		locale: {
			register: (ns, dictionary) => {
				dictionaries[ns] = dictionary
			},
			bind: (ns) => (key, values) =>
				String(dictionaries[ns][language]?.[key] ?? key).replace(/\{(\w+)\}/g, (match, k) =>
					values && k in values ? String(values[k]) : match,
				),
		},
		slots: {
			inject: (name, factory) => factory(),
			register: (options, component) => {
				registered.push({ options, component })
				return () => {}
			},
		},
	}
	act(() => mod.apply(ctx))
	const panel = registered.find((r) => r.options.name === 'main')
	const errors = []
	const original = console.error
	console.error = (...args) => errors.push(args.map(String).join(' '))
	const root = ReactDOMClient.createRoot(document.getElementById('root'))
	await act(async () => {
		root.render(React.createElement(panel.component, { t: ctx.locale.bind('convCalendar') }))
		await new Promise((resolve) => setTimeout(resolve, 20))
	})
	console.error = original
	const container = document.getElementById('root')
	const result = {
		errors,
		text: container.textContent,
		cells: container.querySelectorAll('.dcv-cell').length,
		empty: container.querySelector('.dcv-empty')?.textContent ?? null,
		error: container.querySelector('.dcv-error')?.textContent ?? null,
		stats: [...container.querySelectorAll('.dcv-stat')].map((card) => card.textContent),
		months: [...container.querySelectorAll('.dcv-months span')].map((s) => s.textContent),
	}
	await act(async () => root.unmount())
	return result
}

const pageHtml = (lang) => `<!doctype html><html lang="${lang}"><head></head><body><div id="root"></div></body></html>`
const today = new Date()
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const emptyPayload = { version: 1, timeZone: 'Asia/Shanghai', today: todayKey, days: [], meta: { updatedAt: 0, sessions: 0, activeDays: 0, totalMessages: 0 }, history: { available: true }, historyPending: true }

const empty = await mount({ html: pageHtml('zh'), payload: emptyPayload, language: 'zh' })
console.log('EMPTY cells:', empty.cells, '| empty card:', empty.empty, '| stats:', empty.stats, '| errors:', empty.errors.length)
console.log('EMPTY foot:', empty.text.includes('扫描') ? 'shows scanning note' : 'no scanning note')

const failed = await mount({ html: pageHtml('zh'), fail: true, language: 'zh' })
console.log('ERROR card:', failed.error, '| errors:', failed.errors.length)

const oneDay = {
	version: 1,
	timeZone: 'Asia/Shanghai',
	today: todayKey,
	days: [{ day: todayKey, messages: 3, sessions: 1 }],
	meta: { updatedAt: Date.now(), sessions: 1, activeDays: 1, totalMessages: 3 },
	scanning: false,
}
const english = await mount({ html: pageHtml('en'), payload: oneDay, language: 'en' })
console.log('EN title:', english.text.slice(0, 24))
console.log('EN stats:', english.stats)
console.log('EN months:', english.months.join(' '))
console.log('EN cells:', english.cells, '| errors:', english.errors.length)
