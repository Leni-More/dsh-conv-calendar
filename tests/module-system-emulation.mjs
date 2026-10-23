// Exercise the real client module system against a live Host: fetch the page,
// read `__DSH_BOOT__`, materialize every row through the real bootstrap bundle,
// and report each entry's activation result — the same verdict the shell makes.
import { JSDOM } from 'jsdom'

const origin = process.argv[2]
const token = process.argv[3]
const cookieJar = []

async function http(path, init = {}) {
	const headers = { ...(init.headers ?? {}) }
	if (cookieJar.length) headers.cookie = cookieJar.join('; ')
	const response = await fetch(new URL(path, origin), { ...init, headers, redirect: 'manual' })
	for (const entry of response.headers.getSetCookie?.() ?? []) cookieJar.push(entry.split(';')[0])
	return response
}

await (await http(`/?token=${token}`)).text()
const html = await (await http('/')).text()

const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="root"></div></body></html>`, {
	url: `${origin}/`,
	runScripts: 'outside-only',
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })

// The boot graph is a JSON object literal; take it verbatim from the page.
const match = html.match(/__DSH_BOOT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
if (!match) {
	console.log('no boot graph found in the page')
	process.exit(1)
}
const boot = JSON.parse(match[1])
console.log('boot graph rows:', boot.plugins?.length ?? 'n/a', 'release:', JSON.stringify(boot.release))

// The registration facade the shell installs before any bundle runs.
const registrations = new Map()
const queue = []
window.__ModuleLoader__ = {
	load: (record) => {
		registrations.set(record.id, record)
	},
	create: () => {
		throw new Error('bootstrap create() not emulated')
	},
}
window.__DSH_BOOT_READY__ = { promise: Promise.resolve() }

// Fetch and execute every row's script the way the browser would.
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
console.log('scripts:', scripts.length)
for (const src of scripts) {
	const url = new URL(src, `${origin}/`).href
	const response = await http(url)
	if (!response.ok) {
		console.log('script fetch failed', url, response.status)
		continue
	}
	const code = await response.text()
	try {
		window.eval(code)
	} catch (error) {
		console.log('script threw:', url.slice(0, 120), String(error?.message ?? error).slice(0, 300))
	}
}
console.log('registered bundles:', registrations.size)
const mine = registrations.get('dsh-conv-calendar')
if (!mine) {
	console.log('MISSING: dsh-conv-calendar bundle was not registered by the page scripts')
	process.exit(1)
}
console.log('my bundle registered')

// Materialize it with the platform seeds the shell would provide.
const platform = new Map()
const errors = []
const require = (id) => {
	if (platform.has(id)) return platform.get(id)
	throw new Error(`module "${id}" is not in the platform table`)
}
try {
	const exports = mine.factory(require)
	console.log('factory ok, exports:', Object.keys(exports).join(', '))
} catch (error) {
	errors.push(['factory', error])
	console.log('FACTORY THREW:', String(error?.message ?? error).slice(0, 500))
}

// Try to mount it against a stand-in context and report what fails.
if (errors.length === 0) {
	const exports = mine.factory(require)
	const disposed = []
	const ctx = {
		effect: (fn) => {
			const dispose = fn()
			disposed.push(dispose)
			return dispose
		},
		locale: {
			register: () => () => {},
			bind: () => (key) => key,
		},
		slots: {
			inject: (name, factory) => {
				console.log('slots.inject:', name)
				const result = factory()
				return () => {}
			},
			register: (options) => {
				console.log('slots.register:', options.name, options.key ?? options.id ?? '')
				return () => {}
			},
		},
	}
	try {
		exports.apply(ctx)
		console.log('apply ok')
	} catch (error) {
		console.log('APPLY THREW:', String(error?.message ?? error).slice(0, 500))
	}
}
process.exit(0)
