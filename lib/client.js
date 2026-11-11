/**
 * dsh-conv-calendar — browser half.
 *
 * A GitHub-style contribution calendar over the counts the host half records:
 * one square per local day, five shades, weeks running left to right, Monday on
 * top. The panel is reached from the sidebar entry it registers, and both the
 * entry and the panel are ordinary slot contributions, so the shell owns the
 * chrome, the theme and the teardown.
 *
 * The bundle is hand-written in the platform's factory form (`__ModuleLoader__`
 * registers a factory, materialization happens on first use), which keeps the
 * package buildable with no bundler: `react` comes from the shared module table.
 */

window.__ModuleLoader__.load({
	id: 'dsh-conv-calendar',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

		/**
		 * React, resolved at first use rather than at factory execution: a module
		 * table that does not seed `react` then fails inside the guarded mount
		 * instead of taking the whole boot manifest down with it.
		 *
		 * The object below is a stable façade: every property (hooks included) is
		 * forwarded to the real module on access, so hook identities never change
		 * between renders.
		 */
		let reactModule
		const React = new Proxy(
			{},
			{
				get(_target, property) {
					reactModule ??= require('react')
					const value = reactModule[property]
					return typeof value === 'function' ? value.bind(reactModule) : value
				},
				has(_target, property) {
					reactModule ??= require('react')
					return property in reactModule
				},
			},
		)

		/** Element constructor; every component below builds elements through it. */
		function h(type, props, ...children) {
			return React.createElement(type, props, ...children)
		}

		/** Dictionary namespace owned by this plugin. */
		const NS = 'convCalendar'
		/** The id shared by the sidebar entry and the main panel it opens. */
		const PANEL_ID = 'conv-calendar'
		/** Summary route served by the host half. */
		const ENDPOINT = '/dsh-conv-calendar/api/summary'
		/** Days between two refreshes while the panel stays open. */
		const POLL_MS = 90_000

		/** The repository the one-time prompt asks about. */
		const REPO_URL = 'https://github.com/Leni-More/dsh-conv-calendar'
		const ISSUES_URL = `${REPO_URL}/issues`
		/** Route the prompt reads its decision from, and posts the answer to. */
		const STAR_ENDPOINT = '/dsh-conv-calendar/api/star-notice'
		/** Let the first paint settle before anything asks for attention. */
		const STAR_DELAY_MS = 600
		/** While the user is typing, look again this often instead of interrupting. */
		const STAR_IDLE_MS = 800
		/** Give this page load roughly a minute of typing before it stops waiting. */
		const STAR_IDLE_TRIES = 60

		const DICTIONARY = {
			en: {
				'panel.label': 'Conversation calendar',
				'page.title': 'Conversation calendar',
				'page.subtitle': 'How many prompts you sent each day — darker means a busier day.',
				'page.subtitle.tokens': 'Tokens spent each day, cache reads included — darker means a heavier day.',
				'page.subtitle.output': 'Output tokens each day — darker means a heavier day.',
				'metric.messages': 'Prompts',
				'metric.sessions': 'Conversations',
				'metric.tokens': 'Tokens',
				'metric.output': 'Output',
				'stat.total': 'Prompts this year',
				'stat.totalSessions': 'Conversations this year',
				'stat.totalTokens': 'Tokens this year',
				'stat.totalOutput': 'Output tokens this year',
				'stat.activeDays': '{n} active days this year',
				'stat.activeDays.one': '1 active day this year',
				'stat.streak': 'Current streak',
				'stat.longest': 'Longest {n} days',
				'stat.longest.one': 'Longest 1 day',
				'stat.month': 'This month',
				'stat.lastMonth': 'Last month {n}',
				'stat.busiest': 'Busiest day',
				'stat.none': 'No records yet',
				'stat.unit': '{n} days',
				'stat.unit.one': '1 day',
				'chart.range': 'Full year {year}',
				'chart.less': 'Less',
				'chart.more': 'More',
				'chart.empty': 'No conversations recorded yet',
				'chart.emptyHint': 'Send a prompt from this window and today square fills in.',
				'chart.error': 'Could not read the calendar data',
				'chart.retry': 'Retry',
				'chart.refresh': 'Refresh',
				'chart.scanning': 'Scanning session logs…',
				'chart.noHistory': 'History is unavailable here, so only this run is counted.',
				'chart.updated': 'Updated {time}',
				'chart.source': '{sessions} conversations in local session logs',
				'chart.footnote': 'Only the prompts you sent are counted; injected context never is.',
				'tip.none': 'No conversations',
				'tip.messages': '{n} prompts',
				'tip.messages.one': '1 prompt',
				'tip.sessions': '{n} conversations',
				'tip.sessions.one': '1 conversation',
				'tip.tokens': '{n} tokens',
				'tip.tokens.one': '1 token',
				'tip.breakdown': 'in {input} · out {output} · cached {cache}',
				'weekday.mon': 'Mon',
				'weekday.wed': 'Wed',
				'weekday.fri': 'Fri',
				'intl.locale': 'en-US',
				'star.title': 'Enjoying the calendar?',
				'star.body':
					'A star on GitHub is what keeps a small plugin like this one alive. Found a bug, or missing a feature? Open an issue — every note gets read.',
				'star.star': 'Star on GitHub',
				'star.issue': 'Report a bug / idea',
				'star.later': 'Not now',
				'star.close': 'Dismiss',
				'star.note': 'MIT · built by LeniMore',
				'link.star': 'Star',
				'link.issues': 'Feedback',
			},
			zh: {
				'panel.label': '对话日历',
				'page.title': '对话日历',
				'page.subtitle': '每天发出的对话条数，颜色越深代表那天越忙。',
				'page.subtitle.tokens': '每天消耗的 token 总量（含缓存命中），颜色越深代表那天越重。',
				'page.subtitle.output': '每天产出的 token 数，颜色越深代表那天越重。',
				'metric.messages': '消息',
				'metric.sessions': '会话',
				'metric.tokens': 'Token',
				'metric.output': '输出',
				'stat.total': '今年对话',
				'stat.totalSessions': '今年会话',
				'stat.totalTokens': '今年 Token',
				'stat.totalOutput': '今年输出 Token',
				'stat.activeDays': '今年活跃 {n} 天',
				'stat.activeDays.one': '今年活跃 1 天',
				'stat.streak': '当前连续',
				'stat.longest': '最长 {n} 天',
				'stat.longest.one': '最长 1 天',
				'stat.month': '本月',
				'stat.lastMonth': '上月 {n}',
				'stat.busiest': '最忙一天',
				'stat.none': '暂无记录',
				'stat.unit': '{n} 天',
				'stat.unit.one': '1 天',
				'chart.range': '{year} 年全年',
				'chart.less': '少',
				'chart.more': '多',
				'chart.empty': '还没有记录到对话',
				'chart.emptyHint': '在这个窗口发一条消息，今天的格子就会亮起来。',
				'chart.error': '读取日历数据失败',
				'chart.retry': '重试',
				'chart.refresh': '刷新',
				'chart.scanning': '正在扫描会话日志…',
				'chart.noHistory': '无法读取历史记录，只统计本次运行。',
				'chart.updated': '更新于 {time}',
				'chart.source': '本机会话日志中的 {sessions} 个会话',
				'chart.footnote': '只统计你亲手发送的消息，注入的上下文不计入。',
				'tip.none': '没有对话',
				'tip.messages': '{n} 条消息',
				'tip.messages.one': '1 条消息',
				'tip.sessions': '{n} 个会话',
				'tip.sessions.one': '1 个会话',
				'tip.tokens': '{n} tokens',
				'tip.tokens.one': '1 token',
				'tip.breakdown': '输入 {input} · 输出 {output} · 缓存 {cache}',
				'weekday.mon': '一',
				'weekday.wed': '三',
				'weekday.fri': '五',
				'intl.locale': 'zh-CN',
				'star.title': '给个 Star 吧',
				'star.body':
					'如果这个对话日历合你心意，去 GitHub 点个 Star 就是最大的鼓励。哪里用着别扭，或者想要什么功能，也欢迎直接提。',
				'star.star': '去 GitHub 加星',
				'star.issue': '提个问题 / 想法',
				'star.later': '先不用',
				'star.close': '关闭',
				'star.note': 'MIT 开源 · 作者 LeniMore',
				'link.star': '加星',
				'link.issues': '反馈',
			},
		}

		const CSS = `
.dcv-page{--dcv-accent:var(--dsw-alias-state-business-primary,#4d6bfe);--dcv-empty:color-mix(in srgb,var(--dsw-alias-label-primary,#1f2329) 8%,transparent);--dcv-hair:var(--dsw-alias-border-l3,rgba(0,0,0,.1));--dcv-card:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#fff));--dcv-strong:var(--dsw-alias-label-primary,#1f2329);--dcv-muted:var(--dsw-alias-label-secondary,#61666d);--dcv-faint:var(--dsw-alias-label-tertiary,#8c929c);--dcv-cell:11px;--dcv-gap:3px;--dcv-top:var(--dsh-frame-top-clearance,0px);box-sizing:border-box;height:100%;overflow:auto;padding:calc(24px + var(--dcv-top)) 28px 56px;color:var(--dcv-strong);font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:1.5;background:color-mix(in srgb,var(--dsw-alias-label-primary,#1f2329) 3%,var(--dsw-alias-bg-base,#fff))}
.dcv-inner{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
.dcv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dcv-title{margin:0;display:flex;align-items:center;gap:8px;font-size:20px;line-height:28px;font-weight:600;letter-spacing:.01em}
.dcv-brand{display:inline-flex;align-items:center;flex:none;color:var(--dcv-accent)}
.dcv-brand svg{display:block}
.dcv-sub{margin:4px 0 0;font-size:13px;color:var(--dcv-muted)}
.dcv-head-actions{display:flex;align-items:center;gap:8px;flex:none}
.dcv-seg{display:inline-flex;padding:2px;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));gap:2px}
.dcv-seg button{appearance:none;border:0;background:transparent;color:var(--dcv-muted);font:inherit;font-size:13px;padding:4px 12px;border-radius:7px;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcv-seg button[data-on="1"]{background:var(--dcv-card);color:var(--dcv-strong);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dcv-seg button:focus-visible,.dcv-btn:focus-visible,.dcv-cell:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dcv-accent));outline-offset:1px}
.dcv-btn{appearance:none;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dcv-hair);background:var(--dcv-card);color:var(--dcv-muted);font:inherit;font-size:13px;padding:5px 12px;border-radius:9px;cursor:pointer}
.dcv-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));color:var(--dcv-strong)}
.dcv-btn[disabled]{opacity:.55;cursor:default}
.dcv-btn svg{width:13px;height:13px}
.dcv-btn[data-busy="1"] svg{animation:dcv-spin .9s linear infinite}
@keyframes dcv-spin{to{transform:rotate(360deg)}}
.dcv-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.dcv-stat{box-sizing:border-box;border:1px solid var(--dcv-hair);border-radius:12px;background:var(--dcv-card);padding:12px 14px;min-width:0;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.dcv-stat-label{font-size:12px;color:var(--dcv-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcv-stat-value{margin-top:2px;font-size:22px;line-height:30px;font-weight:600;font-variant-numeric:tabular-nums}
.dcv-stat-sub{margin-top:2px;font-size:12px;color:var(--dcv-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcv-card{box-sizing:border-box;border:1px solid var(--dcv-hair);border-radius:12px;background:var(--dcv-card);padding:16px 18px 14px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.dcv-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.dcv-card-title{font-size:13px;color:var(--dcv-muted)}
.dcv-legend{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dcv-faint)}
.dcv-legend i{display:inline-block;width:var(--dcv-cell);height:var(--dcv-cell);border-radius:2.5px;background:var(--dcv-empty)}
.dcv-legend i[data-l="1"]{background:color-mix(in srgb,var(--dcv-accent) 22%,transparent)}
.dcv-legend i[data-l="2"]{background:color-mix(in srgb,var(--dcv-accent) 42%,transparent)}
.dcv-legend i[data-l="3"]{background:color-mix(in srgb,var(--dcv-accent) 68%,transparent)}
.dcv-legend i[data-l="4"]{background:var(--dcv-accent)}
.dcv-scroll{overflow-x:auto;overflow-y:hidden;padding-bottom:2px}
.dcv-chart{display:inline-block;min-width:100%}
.dcv-months{position:relative;height:16px;margin-left:calc(28px + var(--dcv-gap));font-size:11px;color:var(--dcv-faint)}
.dcv-months span{position:absolute;top:0;white-space:nowrap}
.dcv-body{display:flex;align-items:flex-start;gap:var(--dcv-gap)}
.dcv-weekdays{display:grid;grid-template-rows:repeat(7,var(--dcv-cell));row-gap:var(--dcv-gap);width:28px;font-size:10px;color:var(--dcv-faint);text-align:right}
.dcv-weekdays span{display:flex;align-items:center;justify-content:flex-end;height:var(--dcv-cell);line-height:1}
.dcv-grid{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,var(--dcv-cell));grid-auto-columns:var(--dcv-cell);gap:var(--dcv-gap)}
.dcv-cell{box-sizing:border-box;width:var(--dcv-cell);height:var(--dcv-cell);padding:0;border:0;border-radius:2.5px;background:var(--dcv-empty);cursor:default;transition:transform .08s ease}
.dcv-cell[data-l="1"]{background:color-mix(in srgb,var(--dcv-accent) 22%,transparent)}
.dcv-cell[data-l="2"]{background:color-mix(in srgb,var(--dcv-accent) 42%,transparent)}
.dcv-cell[data-l="3"]{background:color-mix(in srgb,var(--dcv-accent) 68%,transparent)}
.dcv-cell[data-l="4"]{background:var(--dcv-accent)}
.dcv-cell:hover{box-shadow:0 0 0 1px var(--dcv-faint)}
.dcv-tip{position:fixed;z-index:70;pointer-events:none;transform:translate(-50%,-100%);background:var(--dsw-alias-tooltip-bg,#16181d);color:var(--dcv-faint);font-size:12px;line-height:18px;padding:5px 9px;border-radius:7px;box-shadow:0 6px 22px rgba(0,0,0,.22);white-space:nowrap}
.dcv-tip b{font-weight:600}
.dcv-tip small{display:block;font-size:11px}
.dcv-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding-top:10px;border-top:1px solid var(--dcv-hair);font-size:11px;color:var(--dcv-faint);flex-wrap:wrap}
.dcv-note{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dcv-muted)}
.dcv-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 16px 14px;text-align:center}
.dcv-empty-title{font-size:14px;font-weight:600;color:var(--dcv-strong)}
.dcv-empty-hint{font-size:12px;color:var(--dcv-muted)}
.dcv-error{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 4px;color:var(--dcv-muted);font-size:13px}
.dcv-skeleton{height:96px;border-radius:8px;background:linear-gradient(90deg,var(--dcv-empty) 25%,transparent 37%,var(--dcv-empty) 63%);background-size:400% 100%;animation:dcv-shimmer 1.4s ease infinite}
@keyframes dcv-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}
@media (max-width:900px){.dcv-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.dcv-page{padding:18px 16px 40px}.dcv-stats{grid-template-columns:minmax(0,1fr)}}
/* ── the one-time star prompt ───────────────────────────────────────────────
   A page-level overlay lives outside the panel root, so it stands on its own
   token set instead of inheriting the panel's. */
.dcv-star{--dcs-accent:var(--dsw-alias-state-business-primary,#4d6bfe);--dcs-card:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#fff));--dcs-strong:var(--dsw-alias-label-primary,#1f2329);--dcs-muted:var(--dsw-alias-label-secondary,#61666d);--dcs-faint:var(--dsw-alias-label-tertiary,#8c929c);--dcs-hair:var(--dsw-alias-border-l3,rgba(0,0,0,.1));--dcs-gold:#d9a13b;position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:rgba(12,14,20,.28);color:var(--dcs-strong);font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:1.5;animation:dcv-star-fade .18s ease both}
.dcv-star[data-closing="1"]{pointer-events:none;animation:dcv-star-fade .16s ease reverse both}
.dcv-star__card{width:min(400px,100%);box-sizing:border-box;padding:20px 22px 16px;border:1px solid var(--dcs-hair);border-radius:16px;background:radial-gradient(140% 90% at 50% -25%,color-mix(in srgb,var(--dcs-gold) 20%,transparent),transparent 68%),var(--dcs-card);box-shadow:0 24px 64px -16px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.08);animation:dcv-star-rise .24s cubic-bezier(.2,.8,.3,1) both}
.dcv-star__top{display:flex;align-items:center;gap:10px}
.dcv-star__badge{display:inline-flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;border-radius:11px;border:1px solid color-mix(in srgb,var(--dcs-gold) 34%,transparent);background:color-mix(in srgb,var(--dcs-gold) 14%,transparent);color:var(--dcs-gold)}
.dcv-star__badge svg{display:block;width:17px;height:17px}
.dcv-star__close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;margin-left:auto;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dcs-faint);font:inherit;font-size:15px;line-height:1;cursor:pointer}
.dcv-star__close:hover{background:color-mix(in srgb,var(--dcs-strong) 8%,transparent);color:var(--dcs-strong)}
.dcv-star__title{margin:12px 0 0;font-size:17px;line-height:24px;font-weight:600;letter-spacing:.01em}
.dcv-star__body{margin:6px 0 0;font-size:13px;line-height:20px;color:var(--dcs-muted)}
.dcv-star__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.dcv-star__btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:1 1 150px;min-height:34px;padding:0 14px;box-sizing:border-box;border:1px solid transparent;border-radius:9px;font:inherit;font-size:13px;font-weight:500;line-height:1;text-decoration:none;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .12s ease}
.dcv-star__btn:active{transform:translateY(1px)}
.dcv-star__btn--primary{background:var(--dcs-accent);color:#fff}
.dcv-star__btn--primary:hover{background:color-mix(in srgb,var(--dcs-accent) 88%,#000)}
.dcv-star__btn--quiet{border-color:var(--dcs-hair);background:transparent;color:var(--dcs-strong)}
.dcv-star__btn--quiet:hover{border-color:color-mix(in srgb,var(--dcs-strong) 24%,transparent);background:color-mix(in srgb,var(--dcs-strong) 4%,transparent)}
.dcv-star__foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding-top:10px;border-top:1px solid var(--dcs-hair)}
.dcv-star__note{font-size:11px;color:var(--dcs-faint)}
.dcv-star__later{padding:0;border:0;background:transparent;color:var(--dcs-muted);font:inherit;font-size:12px;cursor:pointer}
.dcv-star__later:hover{color:var(--dcs-strong);text-decoration:underline;text-underline-offset:2px}
.dcv-star__btn:focus-visible,.dcv-star__close:focus-visible,.dcv-star__later:focus-visible{outline:2px solid var(--dcs-accent);outline-offset:2px}
.dcv-credit{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:8px;font-size:11px;color:var(--dcv-faint)}
.dcv-credit a{display:inline-flex;align-items:center;gap:4px;color:inherit;text-decoration:none}
.dcv-credit a:hover{color:var(--dcv-muted);text-decoration:underline;text-underline-offset:2px}
.dcv-credit svg{display:block;width:11px;height:11px}
@keyframes dcv-star-fade{from{opacity:0}to{opacity:1}}
@keyframes dcv-star-rise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dcv-cell{transition:none}.dcv-btn[data-busy="1"] svg{animation:none}.dcv-skeleton{animation:none}.dcv-star,.dcv-star__card{animation:none}}
`

		// -----------------------------------------------------------------------
		// small helpers
		// -----------------------------------------------------------------------

		function pad2(value) {
			return String(value).padStart(2, '0')
		}

		function startOfDay(date) {
			return new Date(date.getFullYear(), date.getMonth(), date.getDate())
		}

		function addDays(date, days) {
			return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
		}

		function dayId(date) {
			return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
		}

		function parseDayId(id) {
			const parts = String(id).split('-')
			return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
		}

		/** Spread a localized string over `{name}` placeholders. */
		function format(template, values) {
			return String(template).replace(/\{(\w+)\}/g, (match, key) =>
				values && Object.hasOwn(values, key) ? String(values[key]) : match,
			)
		}

		/** Singular dictionary key when exactly one item is counted. */
		function counted(key, n) {
			return n === 1 ? `${key}.one` : key
		}

		/** Day arithmetic through the local calendar, so DST never shifts a cell. */
		function nextDayId(id) {
			return dayId(addDays(parseDayId(id), 1))
		}

		function previousDayId(id) {
			return dayId(addDays(parseDayId(id), -1))
		}

		/** Language tag for `Intl`, derived from the document the shell rendered. */
		function documentLanguage() {
			const documentTag = typeof document !== 'undefined' ? String(document.documentElement?.lang || '') : ''
			if (documentTag) return documentTag
			return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
		}

		/** One attempted read, absolute path first and the document-relative fallback second. */
		async function fetchSummary(refresh) {
			const targets = [ENDPOINT]
			try {
				targets.push(new URL('dsh-conv-calendar/api/summary', document.baseURI).href)
			} catch {
				/* no usable base URI: keep the absolute path only */
			}
			let failure
			for (const target of targets) {
				try {
					const response = await fetch(refresh ? `${target}?refresh=1` : target, {
						credentials: 'same-origin',
						cache: 'no-store',
						headers: { accept: 'application/json' },
					})
					if (!response.ok) throw new Error(`HTTP ${response.status}`)
					const payload = await response.json()
					if (!payload || !Array.isArray(payload.days)) throw new Error('unexpected payload')
					return payload
				} catch (error) {
					failure = error
				}
			}
			throw failure || new Error('request failed')
		}

		// -----------------------------------------------------------------------
		// derived model
		// -----------------------------------------------------------------------

		/** Level 0..4 for one day value; small maxima keep single prompts visible. */
		function levelOf(value, maximum) {
			if (!value || value <= 0) return 0
			if (maximum <= 4) return Math.min(4, value)
			const ratio = value / maximum
			if (ratio <= 0.25) return 1
			if (ratio <= 0.5) return 2
			if (ratio <= 0.75) return 3
			return 4
		}

		/** The metric keys the panel can draw, in switch order. */
		const METRICS = ['messages', 'sessions', 'tokens', 'output']

		/**
		 * One day's value under the active metric.
		 * @param day - one row of the summary payload.
		 * @param metric - one of {@link METRICS}.
		 */
		function valueOf(day, metric) {
			if (!day) return 0
			if (metric === 'sessions') return day.sessions ?? 0
			if (metric === 'tokens') return day.total ?? 0
			if (metric === 'output') return day.output ?? 0
			return day.messages ?? 0
		}

		/** Compact token counts: 987, 1.2k, 34.5k, 1.7M. */
		function formatTokens(value) {
			const number = Number(value) || 0
			if (number < 1000) return String(number)
			if (number < 1_000_000) return `${(number / 1000).toFixed(number < 10_000 ? 1 : 0)}k`
			return `${(number / 1_000_000).toFixed(number < 10_000_000 ? 1 : 0)}M`
		}

		/** A count printed with thousands separators. */
		function formatCount(value, language) {
			try {
				return new Intl.NumberFormat(language).format(Number(value) || 0)
			} catch {
				return String(Number(value) || 0)
			}
		}

		/** Values in a metric are tokens rather than counts. */
		function isTokenMetric(metric) {
			return metric === 'tokens' || metric === 'output'
		}

		/** Streak facts over a `day -> value` map. */
		function streakOf(values, todayKey) {
			const days = [...values.keys()].filter((day) => values.get(day) > 0).sort()
			let longest = 0
			let run = 0
			let previous
			for (const day of days) {
				run = previous !== undefined && previousDayId(day) === previous ? run + 1 : 1
				if (run > longest) longest = run
				previous = day
			}
			let current = 0
			let cursor = values.get(todayKey) > 0 ? todayKey : previousDayId(todayKey)
			while (values.get(cursor) > 0) {
				current += 1
				cursor = previousDayId(cursor)
			}
			return { current, longest }
		}

		/**
		 * The whole panel's numbers for one metric.
		 *
		 * Two scopes, deliberately. `yearValues` holds the current calendar year and
		 * drives every card and the colour scale, so each number agrees with the grid
		 * the panel draws instead of counting a history the user cannot see. `values`
		 * keeps the full history because a streak legitimately crosses 1 January, and
		 * truncating it would understate a run that is really unbroken.
		 */
		function buildModel(payload, metric) {
			const today = startOfDay(new Date())
			const todayKey = dayId(today)
			const yearPrefix = `${today.getFullYear()}-`
			const values = new Map()
			const yearValues = new Map()
			for (const item of payload.days) {
				const value = valueOf(item, metric)
				if (value <= 0) continue
				values.set(item.day, value)
				if (item.day.startsWith(yearPrefix)) yearValues.set(item.day, value)
			}
			const byDay = new Map()
			for (const item of payload.days) byDay.set(item.day, item)
			const box = {
				values,
				yearValues,
				today,
				todayKey,
				year: today.getFullYear(),
				byDay,
				total: 0,
				activeDays: yearValues.size,
				busiest: null,
			}
			for (const [day, value] of yearValues) {
				box.total += value
				if (box.busiest === null || value > box.busiest.value || (value === box.busiest.value && day > box.busiest.day)) {
					box.busiest = { day, value }
				}
			}
			const streak = streakOf(values, todayKey)
			box.currentStreak = streak.current
			box.longestStreak = streak.longest
			const monthPrefix = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`
			const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
			const lastMonthPrefix = `${lastMonthDate.getFullYear()}-${pad2(lastMonthDate.getMonth() + 1)}`
			box.thisMonth = 0
			box.lastMonth = 0
			for (const [day, value] of values) {
				if (day.startsWith(monthPrefix)) box.thisMonth += value
				else if (day.startsWith(lastMonthPrefix)) box.lastMonth += value
			}
			box.todayValue = values.get(todayKey) ?? 0
			box.maximum = 0
			for (const value of yearValues.values()) if (value > box.maximum) box.maximum = value
			return box
		}

		// -----------------------------------------------------------------------
		// components
		// -----------------------------------------------------------------------

		/** Sidebar glyph: a tiny calendar whose dots are the heat levels. */
		function CalendarGlyph({ size, active }) {
			const dots = []
			for (let row = 0; row < 2; row += 1) {
				for (let column = 0; column < 3; column += 1) {
					const lit = row === 0 ? column < 2 : column === 0
					dots.push(
						h('rect', {
							key: `d${row}${column}`,
							x: 4.2 + column * 2.8,
							y: 8.2 + row * 2.8,
							width: 2.1,
							height: 2.1,
							rx: 0.6,
							fill: 'currentColor',
							opacity: lit ? (active ? 0.95 : 0.72) : 0.28,
						}),
					)
				}
			}
			return h(
				'svg',
				{
					width: size ?? 16,
					height: size ?? 16,
					viewBox: '0 0 16 16',
					fill: 'none',
					'aria-hidden': 'true',
					focusable: 'false',
				},
				h('rect', {
					x: 1.7,
					y: 2.6,
					width: 12.6,
					height: 11.4,
					rx: 2.6,
					stroke: 'currentColor',
					strokeWidth: 1.25,
					opacity: 0.9,
				}),
				h('path', { d: 'M5.1 1.5v2.2M10.9 1.5v2.2', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }),
				h('path', { d: 'M2.1 6.2h11.8', stroke: 'currentColor', strokeWidth: 1.1, opacity: 0.5 }),
				dots,
			)
		}

		function StatCard({ label, value, sub }) {
			return h(
				'div',
				{ className: 'dcv-stat' },
				h('div', { className: 'dcv-stat-label', title: label }, label),
				h('div', { className: 'dcv-stat-value' }, value),
				h('div', { className: 'dcv-stat-sub', title: sub }, sub),
			)
		}

		function Legend({ t }) {
			return h(
				'div',
				{ className: 'dcv-legend' },
				h('span', null, t('chart.less')),
				[0, 1, 2, 3, 4].map((level) => h('i', { key: level, 'data-l': level })),
				h('span', null, t('chart.more')),
			)
		}

		/** The same star for React; `starSvg` builds the DOM twin the prompt uses. */
		function starIcon() {
			return h(
				'svg',
				{ viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': 'true', focusable: 'false' },
				h('path', { d: STAR_PATH }),
			)
		}

		/**
		 * A quiet way back to the repository.
		 *
		 * The prompt asks once, but the panel is where a user sits for a minute, so
		 * the two links stay: a star is appreciated, and a complaint is more useful.
		 */
		function RepoCredits({ t }) {
			return h(
				'div',
				{ className: 'dcv-credit' },
				h('a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, starIcon(), t('link.star')),
				h('span', { 'aria-hidden': 'true' }, '\u00b7'),
				h('a', { href: ISSUES_URL, target: '_blank', rel: 'noopener noreferrer' }, t('link.issues')),
			)
		}

		/**
		 * The contribution grid itself: always the whole current calendar year, padded
		 * out to whole Monday→Sunday weeks, so the grid keeps one full year of squares
		 * even when the year has not finished yet.
		 */
		function Heatmap({ model, t, language, metric }) {
			const [tip, setTip] = React.useState(null)
			const today = model.today
			const year = today.getFullYear()
			const yearStart = new Date(year, 0, 1)
			const yearEnd = new Date(year, 11, 31)
			/*
			 * 1 January sits in the first column even when its week began in December,
			 * and 31 December keeps its own column even when the week runs into January.
			 */
			const firstDay = addDays(yearStart, -((yearStart.getDay() + 6) % 7))
			const lastDay = addDays(yearEnd, 6 - ((yearEnd.getDay() + 6) % 7))
			const dateFormatter = React.useMemo(
				() => new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
				[language],
			)
			const monthFormatter = React.useMemo(() => new Intl.DateTimeFormat(language, { month: 'short' }), [language])
			const tokenMode = isTokenMetric(metric)

			const columns = []
			const months = []
			for (let week = 0; addDays(firstDay, week * 7) <= lastDay; week += 1) {
				const cells = []
				let label
				for (let offset = 0; offset < 7; offset += 1) {
					const date = addDays(firstDay, week * 7 + offset)
					const key = dayId(date)
					const future = date > today
					const value = future ? 0 : model.values.get(key) ?? 0
					/* Month labels cover the rest of the year too, future days included. */
					if (!label && date.getFullYear() === year && date.getDate() === 1) label = monthFormatter.format(date)
					cells.push({ key, date, value, future, level: levelOf(value, model.maximum) })
				}
				if (label) months.push({ week, label })
				columns.push(cells)
			}

			const showTip = (event, cell) => {
				const rect = event.currentTarget.getBoundingClientRect()
				const row = model.byDay.get(cell.key)
				let detail
				if (cell.future) {
					/* A day that has not arrived yet has nothing to report, only a date. */
					detail = undefined
				} else if (tokenMode) {
					detail = cell.value > 0
						? t(counted('tip.tokens', cell.value), { n: formatTokens(cell.value) })
						: t('tip.none')
				} else {
					detail = cell.value > 0 ? t(counted('tip.messages', cell.value), { n: cell.value }) : t('tip.none')
				}
				const breakdown = !cell.future && tokenMode && row && row.total > 0
					? t('tip.breakdown', {
							input: formatTokens(row.input),
							output: formatTokens(row.output),
							cache: formatTokens(row.cache),
						})
					: undefined
				setTip({
					x: rect.left + rect.width / 2,
					y: rect.top - 8,
					title: dateFormatter.format(cell.date),
					detail,
					breakdown,
				})
			}

			return h(
				'div',
				{ className: 'dcv-chart' },
				h(
					'div',
					{ className: 'dcv-months', 'aria-hidden': 'true' },
					months.map((month) =>
						h(
							'span',
							{ key: month.week, style: { left: `calc(${month.week} * (var(--dcv-cell) + var(--dcv-gap)))` } },
							month.label,
						),
					),
				),
				h(
					'div',
					{ className: 'dcv-body' },
					h(
						'div',
						{ className: 'dcv-weekdays', 'aria-hidden': 'true' },
						['', 'mon', '', 'wed', '', 'fri', ''].map((name, index) =>
							h('span', { key: index }, name ? t(`weekday.${name}`) : ''),
						),
					),
					h(
						'div',
						{ className: 'dcv-grid', 'aria-label': format(t('chart.range'), { year }) },
						columns.map((cells) =>
							cells.map((cell) =>
								h('button', {
									key: cell.key,
									type: 'button',
									className: 'dcv-cell',
									'data-l': cell.level,
									'data-future': cell.future ? '1' : undefined,
									tabIndex: cell.future ? -1 : 0,
									/* Future squares are drawn but carry no count, so they read as a date only. */
									'aria-label': cell.future
										? dateFormatter.format(cell.date)
										: `${dateFormatter.format(cell.date)}: ${
												cell.value > 0
													? tokenMode
														? t(counted('tip.tokens', cell.value), { n: formatTokens(cell.value) })
														: t(counted('tip.messages', cell.value), { n: cell.value })
													: t('tip.none')
											}`,
									onMouseEnter: (event) => showTip(event, cell),
									onMouseLeave: () => setTip(null),
									onFocus: (event) => showTip(event, cell),
									onBlur: () => setTip(null),
								}),
							),
						),
					),
				),
				tip
					? h(
							'div',
							{ className: 'dcv-tip', style: { left: `${tip.x}px`, top: `${tip.y}px` } },
							tip.detail ? h('b', null, tip.detail) : null,
							tip.breakdown ? h('small', null, tip.breakdown) : null,
							h('small', null, tip.title),
						)
					: null,
			)
		}

		/** The global panel registered into the layout's keyed `main` slot. */
		function CalendarPanel(props) {
			const t = props && typeof props.t === 'function' ? props.t : (key) => key
			const [metric, setMetric] = React.useState('messages')
			const [snapshot, setSnapshot] = React.useState({ status: 'loading', data: null, error: null, busy: false })
			const requestId = React.useRef(0)
			/*
			 * `Intl` formatting follows the plugin's own dictionary rather than
			 * `<html lang>`: switching the GUI language re-renders `t` in place but
			 * does not always rewrite the document tag, and mixing the two produced
			 * month labels in one language beside weekday labels in another.
			 */
			const dictionaryTag = t('intl.locale')
			const language = React.useMemo(
				() => (dictionaryTag && !dictionaryTag.startsWith('intl.') ? dictionaryTag : documentLanguage()),
				[dictionaryTag],
			)

			const load = React.useCallback(async (refresh) => {
				const id = requestId.current + 1
				requestId.current = id
				setSnapshot((current) => ({ ...current, busy: true, error: null, status: current.data ? current.status : 'loading' }))
				try {
					const data = await fetchSummary(refresh === true)
					if (requestId.current !== id) return
					setSnapshot({ status: 'ready', data, error: null, busy: false })
				} catch (error) {
					if (requestId.current !== id) return
					setSnapshot((current) => ({
						status: current.data ? current.status : 'error',
						data: current.data,
						error: String((error && error.message) || error),
						busy: false,
					}))
				}
			}, [])

			React.useEffect(() => {
				void load(false)
			}, [load])

			React.useEffect(() => {
				const timer = setInterval(() => {
					if (typeof document === 'undefined' || !document.hidden) void load(false)
				}, POLL_MS)
				const onVisible = () => {
					if (typeof document === 'undefined' || !document.hidden) void load(false)
				}
				document.addEventListener('visibilitychange', onVisible)
				return () => {
					clearInterval(timer)
					document.removeEventListener('visibilitychange', onVisible)
				}
			}, [load])

			const data = snapshot.data
			const model = React.useMemo(() => (data ? buildModel(data, metric) : null), [data, metric])
			const timeFormatter = React.useMemo(
				() => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }),
				[language],
			)
			const dayFormatter = React.useMemo(
				() => new Intl.DateTimeFormat(language, { month: 'long', day: 'numeric', weekday: 'short' }),
				[language],
			)

			const tokenMode = isTokenMetric(metric)
			const print = (value) => (tokenMode ? formatTokens(value) : formatCount(value, language))
			const metricLabel =
				metric === 'messages'
					? t('stat.total')
					: metric === 'sessions'
						? t('stat.totalSessions')
						: metric === 'tokens'
							? t('stat.totalTokens')
							: t('stat.totalOutput')
			const stats = model
				? [
						{
							key: 'total',
							label: metricLabel,
							value: print(model.total),
							sub: t(counted('stat.activeDays', model.activeDays), { n: model.activeDays }),
						},
						{
							key: 'streak',
							label: t('stat.streak'),
							value: t(counted('stat.unit', model.currentStreak), { n: model.currentStreak }),
							sub: t(counted('stat.longest', model.longestStreak), { n: model.longestStreak }),
						},
						{
							key: 'month',
							label: t('stat.month'),
							value: print(model.thisMonth),
							sub: t(counted('stat.lastMonth', model.lastMonth), { n: print(model.lastMonth) }),
						},
						{
							key: 'busiest',
							label: t('stat.busiest'),
							value: model.busiest ? print(model.busiest.value) : '—',
							sub: model.busiest ? dayFormatter.format(parseDayId(model.busiest.day)) : t('stat.none'),
						},
					]
				: []

			const updatedAt = data && data.meta && data.meta.updatedAt ? new Date(data.meta.updatedAt) : null

			return h(
				'div',
				{ className: 'dcv-page' },
				h(
					'div',
					{ className: 'dcv-inner' },
					h(
						'header',
						{ className: 'dcv-head' },
						h(
							'div',
							null,
							h(
								'h1',
								{ className: 'dcv-title' },
								h('span', { className: 'dcv-brand', 'aria-hidden': 'true' }, h(CalendarGlyph, { size: 18 })),
								t('page.title'),
							),
							h('p', { className: 'dcv-sub' }, t(tokenMode ? `page.subtitle.${metric}` : 'page.subtitle')),
						),
						h(
							'div',
							{ className: 'dcv-head-actions' },
							h(
								'div',
								{ className: 'dcv-seg', role: 'group', 'aria-label': t('page.title') },
								METRICS.map((key) =>
									h(
										'button',
										{
											key,
											type: 'button',
											'data-on': metric === key ? '1' : '0',
											'aria-pressed': metric === key,
											onClick: () => setMetric(key),
										},
										t(`metric.${key}`),
									),
								),
							),
							h(
								'button',
								{
									type: 'button',
									className: 'dcv-btn',
									'data-busy': snapshot.busy ? '1' : '0',
									disabled: snapshot.busy,
									onClick: () => void load(true),
								},
								h(
									'svg',
									{ viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
									h('path', {
										d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.75',
										stroke: 'currentColor',
										strokeWidth: 1.4,
										strokeLinecap: 'round',
									}),
									h('path', { d: 'M13.4 1.9v3h-3', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
								),
								t('chart.refresh'),
							),
						),
					),
					snapshot.status === 'error'
						? h(
								'div',
								{ className: 'dcv-card' },
								h(
									'div',
									{ className: 'dcv-error' },
									h('span', null, `${t('chart.error')}（${snapshot.error}）`),
									h('button', { type: 'button', className: 'dcv-btn', onClick: () => void load(true) }, t('chart.retry')),
								),
							)
						: null,
					snapshot.status === 'loading'
						? h('div', { className: 'dcv-card' }, h('div', { className: 'dcv-skeleton' }))
						: null,
					model
						? h(
								'div',
								{ className: 'dcv-stats' },
								stats.map((stat) => h(StatCard, { key: stat.key, label: stat.label, value: stat.value, sub: stat.sub })),
							)
						: null,
					model
						? h(
								'section',
								{ className: 'dcv-card' },
								h(
									'div',
									{ className: 'dcv-card-head' },
									h(
										'span',
										{ className: 'dcv-card-title' },
										format(t('chart.range'), { year: model.today.getFullYear() }),
									),
									h(Legend, { t }),
								),
								h('div', { className: 'dcv-scroll' }, h(Heatmap, { model, t, language, metric })),
								model.total === 0
									? h(
											'div',
											{ className: 'dcv-empty' },
											h('div', { className: 'dcv-empty-title' }, t('chart.empty')),
											h('div', { className: 'dcv-empty-hint' }, t('chart.emptyHint')),
										)
									: null,
								h(
									'div',
									{ className: 'dcv-foot' },
									h(
										'div',
										{ className: 'dcv-note' },
										h('span', null, t('chart.source', { sessions: data?.meta?.sessions ?? 0 })),
										data?.history && data.history.available === false
											? h('span', null, `· ${t('chart.noHistory')}`)
											: null,
										snapshot.busy || data?.historyPending ? h('span', null, `· ${t('chart.scanning')}`) : null,
									),
									h(
										'div',
										{ className: 'dcv-note' },
										updatedAt ? h('span', null, t('chart.updated', { time: timeFormatter.format(updatedAt) })) : null,
										h('span', null, t('chart.footnote')),
									),
								),
							)
						: null,
					model ? h(RepoCredits, { t }) : null,
				),
			)
		}

		// -----------------------------------------------------------------------
		// plugin body
		// -----------------------------------------------------------------------

		/** Services required: slot contribution and the dictionary seat. */
		const inject = ['slots', 'locale']

		// -----------------------------------------------------------------------
		// the one-time star prompt
		// -----------------------------------------------------------------------

		/** The star the prompt wears as a badge. */
		const STAR_PATH = 'M8 1.5l2.03 4.11 4.54.66-3.28 3.2.77 4.53L8 11.86l-4.06 2.14.77-4.53L1.43 6.27l4.54-.66L8 1.5z'

		/** Whether focus sits somewhere the user is typing. */
		function isEditing() {
			const active = document.activeElement
			if (!active || active === document.body) return false
			const tag = String(active.tagName ?? '').toLowerCase()
			if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
			return active.isContentEditable === true
		}

		function starSvg() {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
			svg.setAttribute('viewBox', '0 0 16 16')
			svg.setAttribute('fill', 'currentColor')
			svg.setAttribute('aria-hidden', 'true')
			svg.setAttribute('focusable', 'false')
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			path.setAttribute('d', STAR_PATH)
			svg.appendChild(path)
			return svg
		}

		/** Ask the host what this page load should do about the prompt. */
		async function fetchStarNotice() {
			const targets = [STAR_ENDPOINT]
			try {
				targets.push(new URL('dsh-conv-calendar/api/star-notice', document.baseURI).href)
			} catch {
				/* a base URI that cannot be parsed leaves the absolute route */
			}
			for (const target of targets) {
				try {
					const response = await fetch(target, {
						credentials: 'same-origin',
						cache: 'no-store',
						headers: { accept: 'application/json' },
					})
					if (!response.ok) continue
					return await response.json()
				} catch {
					/* try the next spelling */
				}
			}
			return null
		}

		/** Tell the host what happened. The card leaves either way. */
		function postStarNotice(action) {
			try {
				void fetch(STAR_ENDPOINT, {
					method: 'POST',
					credentials: 'same-origin',
					cache: 'no-store',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action }),
					/* The answer must still leave if this tab is closing. */
					keepalive: true,
				}).catch(() => {})
			} catch {
				/* the next visit asks again */
			}
		}

		/** Build the card as plain DOM: it has to sit above the whole shell. */
		function buildStarCard(t) {
			const overlay = document.createElement('div')
			overlay.className = 'dcv-star'
			overlay.dataset.dshConvCalendar = 'star-prompt'

			const card = document.createElement('div')
			card.className = 'dcv-star__card'
			card.setAttribute('role', 'dialog')
			card.setAttribute('aria-modal', 'true')
			card.setAttribute('aria-labelledby', 'dcv-star-title')
			card.setAttribute('aria-describedby', 'dcv-star-body')

			const top = document.createElement('div')
			top.className = 'dcv-star__top'
			const badge = document.createElement('span')
			badge.className = 'dcv-star__badge'
			badge.setAttribute('aria-hidden', 'true')
			badge.appendChild(starSvg())
			const close = document.createElement('button')
			close.type = 'button'
			close.className = 'dcv-star__close'
			close.dataset.dcvAction = 'dismissed'
			close.setAttribute('aria-label', t('star.close'))
			close.textContent = '\u00d7'
			top.append(badge, close)

			const title = document.createElement('h2')
			title.className = 'dcv-star__title'
			title.id = 'dcv-star-title'
			title.textContent = t('star.title')

			const body = document.createElement('p')
			body.className = 'dcv-star__body'
			body.id = 'dcv-star-body'
			body.textContent = t('star.body')

			const actions = document.createElement('div')
			actions.className = 'dcv-star__actions'
			const starLink = document.createElement('a')
			starLink.className = 'dcv-star__btn dcv-star__btn--primary'
			starLink.href = REPO_URL
			starLink.target = '_blank'
			starLink.rel = 'noopener noreferrer'
			starLink.dataset.dcvAction = 'starred'
			starLink.textContent = t('star.star')
			const issueLink = document.createElement('a')
			issueLink.className = 'dcv-star__btn dcv-star__btn--quiet'
			issueLink.href = ISSUES_URL
			issueLink.target = '_blank'
			issueLink.rel = 'noopener noreferrer'
			issueLink.dataset.dcvAction = 'issue'
			issueLink.textContent = t('star.issue')
			actions.append(starLink, issueLink)

			const foot = document.createElement('div')
			foot.className = 'dcv-star__foot'
			const note = document.createElement('span')
			note.className = 'dcv-star__note'
			note.textContent = t('star.note')
			const later = document.createElement('button')
			later.type = 'button'
			later.className = 'dcv-star__later'
			later.dataset.dcvAction = 'dismissed'
			later.textContent = t('star.later')
			foot.append(note, later)

			card.append(top, title, body, actions, foot)
			overlay.appendChild(card)
			return overlay
		}

		/**
		 * Ask once, politely.
		 *
		 * The host owns the decision — it remembers the answer in a file, because
		 * the Desktop host binds a new random port on each restart and `localStorage`
		 * would forget with it. This half only paints what it is told to paint: it
		 * waits for the first paint to settle, never interrupts typing, and leaves
		 * immediately on Escape, on the backdrop, or on any answer.
		 */
		function mountStarPrompt(ctx) {
			if (typeof document === 'undefined' || !document.body) return
			const t = ctx.locale.bind(NS)

			ctx.effect(() => {
				let timer = 0
				let overlay = null
				let closed = false
				let watching = false
				const previous = document.activeElement

				const dismiss = () => {
					if (!overlay) return
					const node = overlay
					overlay = null
					node.dataset.closing = '1'
					setTimeout(() => node.remove(), 160)
				}

				const finish = (action) => {
					if (closed) return
					closed = true
					postStarNotice(action)
					dismiss()
					if (previous && typeof previous.focus === 'function') previous.focus({ preventScroll: true })
				}

				const paint = () => {
					const node = buildStarCard(t)
					overlay = node
					node.addEventListener('click', (event) => {
						if (event.target === node) {
							finish('dismissed')
							return
						}
						const hit = event.target?.closest?.('[data-dcv-action]')
						if (hit) finish(String(hit.dataset.dcvAction))
					})
					node.addEventListener('keydown', (event) => {
						if (event.key === 'Escape') {
							event.preventDefault()
							finish('dismissed')
							return
						}
						if (event.key !== 'Tab') return
						const card = node.firstElementChild
						if (!card) return
						const items = [...card.querySelectorAll('a[href],button')]
						if (items.length === 0) return
						const first = items[0]
						const last = items[items.length - 1]
						if (event.shiftKey && document.activeElement === first) {
							event.preventDefault()
							last.focus()
						} else if (!event.shiftKey && document.activeElement === last) {
							event.preventDefault()
							first.focus()
						}
					})
					document.body.appendChild(node)
					node.querySelector('.dcv-star__btn--primary')?.focus({ preventScroll: true })
				}

				const ask = async (tries) => {
					const answer = await fetchStarNotice()
					if (closed) return
					/* The host may still be booting: a blank answer deserves one more look. */
					if (!answer) {
						if (tries < STAR_IDLE_TRIES) timer = setTimeout(() => attempt(tries + 1), STAR_IDLE_MS)
						return
					}
					if (answer.show !== true) return
					paint()
				}

				/**
				 * A prompt that steals focus mid-sentence costs more than it earns, and
				 * one painted into a hidden tab is never seen. Both are worth waiting
				 * out: the asker retries until the reader is present and idle.
				 */
				const onVisible = () => {
					if (closed || document.hidden) return
					document.removeEventListener('visibilitychange', onVisible)
					watching = false
					attempt(0)
				}

				const attempt = (tries) => {
					if (closed) return
					if (document.hidden) {
						if (!watching) {
							watching = true
							document.addEventListener('visibilitychange', onVisible)
						}
						return
					}
					if (isEditing()) {
						if (tries >= STAR_IDLE_TRIES) return
						timer = setTimeout(() => attempt(tries + 1), STAR_IDLE_MS)
						return
					}
					void ask(tries)
				}

				timer = setTimeout(() => attempt(0), STAR_DELAY_MS)

				return () => {
					closed = true
					clearTimeout(timer)
					document.removeEventListener('visibilitychange', onVisible)
					overlay?.remove()
					overlay = null
				}
			}, 'dsh-conv-calendar: star prompt')
		}

		/**
		 * Mount the browser half.
		 *
		 * Every slot contribution goes through `ctx.slots.inject(name, …)` instead
		 * of a bare `ctx.slots.register(...)`: the declaration of a slot may arrive
		 * after this plugin, and registering into an undeclared key throws — which
		 * the shell reports as an entry that "did not activate". `inject` defers
		 * the registration until the declaration exists and re-runs it if the
		 * contributing package is replaced.
		 *
		 * @param ctx - the browser plugin context.
		 */
		function apply(ctx) {
			try {
				mountCalendar(ctx)
			} catch (error) {
				/* A contribution that cannot mount must not cost the shell its boot. */
				console.error('[dsh-conv-calendar] mount failed:', error)
			}
			try {
				mountStarPrompt(ctx)
			} catch (error) {
				/* The panel is the product; a prompt that cannot mount is not worth it. */
				console.error('[dsh-conv-calendar] star prompt failed:', error)
			}
		}

		/**
		 * Contribute the sidebar entry, the panel and the styles.
		 * @param ctx - the browser plugin context.
		 */
		function mountCalendar(ctx) {
			ctx.effect(() => ctx.locale.register(NS, DICTIONARY), 'dsh-conv-calendar: dictionaries')
			const t = ctx.locale.bind(NS)

			ctx.slots.inject('sidebar.panellist', () =>
				ctx.slots.register(
					{
						name: 'sidebar.panellist',
						id: PANEL_ID,
						order: 20,
						label: () => t('panel.label'),
						locale: NS,
					},
					CalendarGlyph,
				),
			)

			ctx.slots.inject('main', () =>
				ctx.slots.register(
					{
						name: 'main',
						key: PANEL_ID,
						locale: NS,
					},
					CalendarPanel,
				),
			)

			ctx.effect(() => {
				if (typeof document === 'undefined') return () => {}
				const tagId = 'dsh-conv-calendar/calendar.css'
				if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return () => {}
				const tag = document.createElement('style')
				tag.dataset.plugin = 'dsh-conv-calendar'
				tag.dataset.pluginCss = tagId
				tag.textContent = CSS
				document.head.appendChild(tag)
				return () => {
					tag.remove()
				}
			}, 'dsh-conv-calendar: styles')
		}

		exports.NS = NS
		exports.PANEL_ID = PANEL_ID
		exports.apply = apply
		exports.inject = inject
		return module.exports
	},
})
