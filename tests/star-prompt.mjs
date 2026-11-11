// Browser-half test for the one-time star prompt: it waits, it yields to typing,
// it reports what the user did, and it never leaves a ghost behind.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const nodeRequire = createRequire(import.meta.url)
const React = nodeRequire('react')

const failures = []
const check = (name, actual, expected) => {
	const ok = JSON.stringify(actual) === JSON.stringify(expected)
	console.log(ok ? `PASS ${name}` : `FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
	if (!ok) failures.push(name)
}

const dom = new JSDOM(
	'<!doctype html><html lang="zh"><head></head><body><div id="root"></div><input id="composer"></body></html>',
	{ url: 'http://127.0.0.1:56542/', pretendToBeVisual: true },
)
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.HTMLElement = window.HTMLElement

const captured = []
window.__ModuleLoader__ = { load: (record) => captured.push(record) }
window.eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
const bundle = captured[0]
const mod = bundle.factory((id) => {
	if (id === 'react') return React
	throw new Error(`unexpected external: ${id}`)
})

const dict = {
	'star.title': '给个 Star 吧',
	'star.body': '如果这个对话日历合你心意，去 GitHub 点个 Star 就是最大的鼓励。',
	'star.star': '去 GitHub 加星',
	'star.issue': '提个问题 / 想法',
	'star.later': '先不用',
	'star.close': '关闭',
	'star.note': 'MIT 开源 · 作者 LeniMore',
}

const posts = []
const reply = { show: true, reason: 'first' }
globalThis.fetch = async (url, init = {}) => {
	const target = String(url)
	if (!target.includes('star-notice')) throw new Error(`unexpected fetch ${target}`)
	if ((init.method ?? 'GET') === 'POST') {
		posts.push(JSON.parse(init.body ?? '{}'))
		return { ok: true, json: async () => ({ ok: true }) }
	}
	return { ok: true, json: async () => reply }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function mount() {
	const disposers = []
	mod.apply({
		effect: (fn) => {
			disposers.push(fn())
			return () => {}
		},
		locale: {
			register: () => () => {},
			bind: () => (key) => dict[key] ?? key,
		},
		slots: {
			inject: (name, factory) => {
				factory()
				return () => {}
			},
			register: () => () => {},
		},
	})
	return () => {
		for (const dispose of disposers.reverse()) {
			try {
				dispose?.()
			} catch {
				/* already gone */
			}
		}
	}
}

const card = () => document.querySelector('.dcv-star')

// 1. A first visit: nothing at once, then one card with the two working links.
const dispose1 = mount()
check('nothing before the delay', card(), null)
check('the dictionary is bound', mod.NS, 'convCalendar')
await wait(2_700)
check('the card appears', card() !== null, true)
check('the card names itself', document.querySelector('.dcv-star__title')?.textContent, '给个 Star 吧')
check('the card explains itself', document.querySelector('.dcv-star__body')?.textContent, dict['star.body'])
const links = [...document.querySelectorAll('.dcv-star__actions a')].map((a) => a.getAttribute('href'))
check('the star link', links[0], 'https://github.com/Leni-More/dsh-conv-calendar')
check('the issue link', links[1], 'https://github.com/Leni-More/dsh-conv-calendar/issues')
check('the star link opens away', document.querySelector('.dcv-star__btn--primary')?.getAttribute('rel'), 'noopener noreferrer')
check('the card is modal', document.querySelector('.dcv-star__card')?.getAttribute('role'), 'dialog')

document.querySelector('.dcv-star__btn--primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await wait(60)
check('the answer is posted', posts, [{ action: 'starred' }])
await wait(220)
check('the card leaves', card(), null)
dispose1()

// 2. A user mid-sentence is never interrupted, and Escape closes quietly.
posts.length = 0
const composer = document.getElementById('composer')
composer.focus()
const dispose2 = mount()
await wait(2_700)
check('typing holds the card back', card(), null)
composer.blur()
await wait(1_000)
check('the card waits for a calm moment', card() !== null, true)
card().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await wait(60)
check('escape is reported as a dismissal', posts, [{ action: 'dismissed' }])
await wait(220)
check('escape removes the card', card(), null)
dispose2()

console.log(
	failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} FAILED: ${failures.join(', ')}`,
)
process.exit(failures.length === 0 ? 0 : 1)
