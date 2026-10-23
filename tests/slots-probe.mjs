// Does registering into an undeclared slot throw, and does `slots.inject` wait?
// Runs the real renderer bundle in jsdom with a minimal cordis-like context.
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:1/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })

const captured = []
dom.window.__ModuleLoader__ = { load: (record) => captured.push(record) }
dom.window.eval(readFileSync(process.argv[2], 'utf8'))
const record = captured[0]
console.log('renderer bundle:', record.id)

// Minimal React stand-in: the renderer only needs element constructors here.
const React = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	Fragment: 'fragment',
	useState: (value) => [value, () => {}],
	useEffect: () => {},
	useMemo: (fn) => fn(),
	useCallback: (fn) => fn(),
	useRef: (value) => ({ current: value }),
	useSyncExternalStore: () => undefined,
	createContext: () => ({ Provider: 'provider', Consumer: 'consumer' }),
	memo: (component) => component,
	forwardRef: (component) => component,
}
const require = (id) => {
	if (id === 'react') return React
	if (id === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement, Fragment: 'fragment' }
	if (id === 'react-dom') return { createPortal: (node) => node }
	if (id === 'react-dom/client') return { createRoot: () => ({ render: () => {}, unmount: () => {} }), hydrateRoot: () => ({ render: () => {} }) }
	if (id === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: () => ({ getSnapshot: () => ({}), set: () => {}, subscribe: () => () => {} }), defineStore: (x) => x }
	if (id === '@deepseek-ai/dsh-client-ui-slots') return { SlotOwnershipError: class extends Error {}, StaleAuthorizationError: class extends Error {} }
	if (id === '@deepseek-ai/cordis') return { Service: class {}, Context: class {} }
	throw new Error(`unexpected external: ${id}`)
}
let exports
try {
	exports = record.factory(require)
} catch (error) {
	console.log('FACTORY FAILED:', String(error?.message ?? error).slice(0, 400))
	process.exit(0)
}
console.log('renderer exports:', Object.keys(exports).slice(0, 12).join(', '))
