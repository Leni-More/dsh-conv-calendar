// Emulate the real shell page in jsdom against a live Host: the shell bundle,
// the boot graph and every plugin bundle run for real, so a failed entry reports
// its own reason instead of a summary line.
import { JSDOM, VirtualConsole } from 'jsdom'

const origin = process.argv[2]
const token = process.argv[3]

const cookieJar = []
async function http(path, init = {}) {
	const headers = { ...(init.headers ?? {}) }
	if (cookieJar.length) headers.cookie = cookieJar.join('; ')
	const response = await fetch(new URL(path, origin), { ...init, headers, redirect: 'manual' })
	const setCookie = response.headers.getSetCookie?.() ?? []
	for (const entry of setCookie) cookieJar.push(entry.split(';')[0])
	return response
}

// Exchange the launch token for the session cookie the way the browser does.
const exchange = await http(`/?token=${token}`)
console.log('token exchange:', exchange.status, exchange.headers.get('location'))
await exchange.text()

const pageResponse = await http('/')
const html = await pageResponse.text()
console.log('page:', pageResponse.status, 'bytes:', html.length)

const consoleLines = []
const virtualConsole = new VirtualConsole()
virtualConsole.on('error', (...args) => consoleLines.push(['error', args.map(String).join(' ')]))
virtualConsole.on('warn', (...args) => consoleLines.push(['warn', args.map(String).join(' ')]))
virtualConsole.on('log', (...args) => consoleLines.push(['log', args.map(String).join(' ')]))
virtualConsole.on('jsdomError', (error) => consoleLines.push(['jsdomError', String(error?.message ?? error)]))

const dom = new JSDOM(html, {
	url: `${origin}/`,
	runScripts: 'dangerously',
	resources: 'usable',
	pretendToBeVisual: true,
	virtualConsole,
	beforeParse(window) {
		// Same-origin HTTP with the session cookie, like the browser fetch.
		window.fetch = (input, init) => {
			const target = typeof input === 'string' ? input : input.url
			return http(target, init ?? {})
		}
		window.EventSource = class EventSource {
			constructor(url) {
				this.url = url
				this.readyState = 0
				this.listeners = new Map()
				this.#open()
			}
			#open() {
				let closed = false
				this.close = () => {
					closed = true
					this.readyState = 2
				}
				const loop = async () => {
					while (!closed) {
						try {
							const response = await http(this.url, { headers: { accept: 'text/event-stream' } })
							if (!response.ok || !response.body) {
								await new Promise((resolve) => setTimeout(resolve, 500))
								continue
							}
							const reader = response.body.getReader()
							const decoder = new TextDecoder()
							let buffer = ''
							while (!closed) {
								const { value, done } = await reader.read()
								if (done) break
								buffer += decoder.decode(value, { stream: true })
								let index
								while ((index = buffer.indexOf('\n\n')) >= 0) {
									const chunk = buffer.slice(0, index)
									buffer = buffer.slice(index + 2)
									this.#dispatch(chunk)
								}
							}
						} catch {
							await new Promise((resolve) => setTimeout(resolve, 500))
						}
					}
				}
				void loop()
			}
			#dispatch(chunk) {
				const event = { type: 'message', data: '' }
				for (const line of chunk.split('\n')) {
					if (line.startsWith('data:')) event.data += line.slice(5).trim()
					else if (line.startsWith('event:')) event.type = line.slice(6).trim()
				}
				for (const listener of this.listeners.get(event.type) ?? []) listener(event)
				if (event.type === 'message') for (const listener of this.listeners.get('message') ?? []) listener(event)
			}
			addEventListener(type, listener) {
				if (!this.listeners.has(type)) this.listeners.set(type, [])
				this.listeners.get(type).push(listener)
			}
			removeEventListener(type, listener) {
				const list = this.listeners.get(type) ?? []
				const index = list.indexOf(listener)
				if (index >= 0) list.splice(index, 1)
			}
			set onmessage(listener) {
				this.addEventListener('message', listener)
			}
			set onopen(listener) {
				this.addEventListener('open', listener)
			}
			set onerror(listener) {
				this.addEventListener('error', listener)
			}
		}
	},
})

await new Promise((resolve) => setTimeout(resolve, 25_000))

const window = dom.window
const audit = window.__DSH_BOOT_AUDIT__ ?? null
console.log('\n--- renderer console (errors and warnings) ---')
for (const [level, line] of consoleLines) {
	if (level === 'error' || level === 'warn' || level === 'jsdomError') console.log(`[${level}] ${line.slice(0, 1200)}`)
}
console.log('\n--- boot markers ---')
console.log('DSH_BOOT present:', typeof window.__DSH_BOOT__)
console.log('modules service:', typeof window.__DSH_BOOT__?.plugins)
try {
	const state = window.__DSH_TRANSPORT__ ? 'transport present' : 'no transport'
	console.log(state)
} catch (error) {
	console.log('transport probe failed', String(error))
}
if (audit) console.log('audit:', JSON.stringify(audit).slice(0, 3000))
dom.window.close()
process.exit(0)
