# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-11-11

### Changed

- **The star card is now tied to activation, not to a counter.** The Host applies the
  plug-in every time the desktop app starts and every time it is switched on, so that is
  the moment it hands out one greeting: the first page that asks gets the card, every later
  load and every second tab is told no, and the next activation starts over. The decision
  lives only in memory.

### Fixed

- **The star card now shows up.** It used to be bounded by a budget of three
  appearances, a week apart, remembered in `notice.json`. Uninstalling a plugin never
  deletes that file, so a reinstall inherited "already asked" and the card silently never
  appeared for the person who had just installed it. Nothing is written to disk any more,
  so no leftover file can mute it.
- **A background window no longer swallows the ask.** The prompt used to give up when the
  tab was hidden. It now waits for `visibilitychange` and asks as soon as the window is
  looked at.

## [0.3.0] - 2026-11-11

### Added

- **The panel asks once for a star, and makes it easy to argue with.** The first time
  the calendar opens, a small card asks for a GitHub star and points at the issue
  tracker. It is a courtesy, so it is bounded: at most three appearances ever, never two
  inside the same week, and nothing at all once the user has followed the star link or
  opened an issue (`dismissed` only postpones the next question). Two tabs opened
  together spend one showing between them, not two.
- **The Host owns the decision, and remembers it in a file.** The answer lives in
  `notice.json`, beside `state.json` and deliberately separate from it. The Desktop host
  binds a fresh random loopback port on every restart, so `localStorage` would forget the
  answer along with the old origin; `state.json` is a rebuildable cache that a future
  counter-layout change will discard. A user's answer is neither, so it gets its own file.
- **Its own route, so reading the calendar costs nothing.** `GET` and `POST
  /dsh-conv-calendar/api/star-notice` carry the decision and the answer. The summary route
  is untouched, so a passive panel refresh never spends one of the three showings.
- **A prompt that does not interrupt.** The card waits for the first paint to settle and
  for the composer to go idle, closes on `Escape`, on the backdrop or on any button,
  keeps focus inside itself while open and hands it back afterwards, and is built as
  plain DOM on `document.body`: it has to paint above the whole shell, and `react-dom`'s
  `createRoot` is not guaranteed to exist in every host build.
- **The panel keeps a quiet way back.** The calendar footer now carries *Star* and
  *Feedback* links, so the one-time ask is not the only path to the repository.
- **An icon of its own.** `icon.svg` puts the shape the sidebar already uses — a calendar
  frame with a two-row heat strip — on the brand indigo, and `package.json` carries both
  the `icon` field and the file inside `files`, so the mark survives publishing instead
  of existing only in the repository. The panel title wears the same glyph at 18px,
  tinted with `--dcv-accent`.

### Changed

- **Both routes now share one JSON responder.** `respondJson` owns the status line, the
  cache headers, the `HEAD` body rule and the 500 fallback, so the new route could not
  drift away from the old one; a payload that cannot be serialised becomes a `500`
  instead of a half-written response.

## [0.2.1] - 2026-11-05

### Changed

- **The hover tooltip speaks in the card-label colour.** Its text used the inverted
  primary colour; it now uses the same `--dcv-faint` token as the labels of the cards
  above the grid, and the date line no longer dims itself further, so a hovered day
  reads like part of the same surface instead of a separate bright slab.

## [0.2.0] - 2026-11-05

### Changed

- **The grid always shows the whole current calendar year.** It now spans 1 January to
  31 December, padded out to whole Monday-started weeks, instead of a rolling 53-week
  window that ended on the current week. Days that have not arrived yet keep their
  squares, and the month labels cover the remaining months too, so the year no longer
  looks truncated in November and December.
- **Every card and the colour scale now use the grid's year scope.** The total, the
  active-day count, the busiest day and the maximum that drives the five shades are all
  computed over the current calendar year, so the numbers agree with the squares the
  user can see and one heavy day from a previous year can no longer wash the current
  year out to level 1. The card labels say "this year". The streaks still walk the full
  history, because an unbroken run may cross 1 January.
- **A future square now answers its hover with its date.** It carries no count, so the
  tooltip shows the date alone, and the hover outline applies to it like any other
  square.

## [0.1.1]

### Fixed

- **`Intl` formatting follows the plugin's dictionary** instead of `<html lang>`. Switching
  the GUI language re-renders the panel in place but does not always rewrite the document
  tag, which left month labels, tooltip dates and the busiest-day card in the previous
  language beside correctly translated copy.

### Changed

- **The fold test builds its own fixture** when `$DSH_HOME/sessions` is absent, instead of
  throwing. It asserts the same totals over a generated tree that keeps the interesting
  shapes: several zstd frames per file, and a forked session repeating its ancestor.
- **Frame decoding in the tests no longer relies on one decompress call** reading every
  concatenated zstd frame, which differs between Node versions.

## [0.1.0]

First public release.

### Added

- **Sidebar entry and full-page panel** for the DeepSeek Harness Web GUI, contributed
  through the `sidebar.panellist` list slot and the layout's keyed `main` slot.
- **GitHub-style contribution grid**: the last 53 weeks, Monday-first, five shades,
  one square per local day, hover/focus tooltip, month and weekday labels.
- **Four metrics**: prompts, conversations, total tokens, output tokens.
- **Four stat cards** that follow the selected metric: total (with active days),
  current streak (with longest), this month (with last month), busiest day.
- **Token accounting** from `assistant/message` usage, with an `input · output · cached`
  breakdown in the tooltip.
- **Live counting** from the `session/event` feed, plus **history backfill** read
  through `ctx.sessionQuery`, with finished sessions cached and live ones merged.
- **Cross-session de-duplication** by message id, so forked sessions never double count.
- **Durable state** in `$DSH_HOME/plugins/dsh-conv-calendar/state.json`, written atomically,
  self-healing when the layout version changes.
- **Read-only HTTP endpoint** `GET /dsh-conv-calendar/api/summary`, behind the Host's
  connection fence.
- **English and Chinese** dictionaries; colors taken from DSH theme variables.
- Offline tests for the fold, the Host contract and the panel.

### Fixed

- **Client bundle dependencies are now declared** in `dsh.client.inject`. Without them the
  module graph activated the bundle before `ui-renderer` / `ui-layout` / `client-locale`,
  which made the whole application refuse to start with `1 entry did not activate`.
- **Both slot contributions** go through `ctx.slots.inject(...)` instead of a bare
  `ctx.slots.register(...)`, so a slot declared after this plugin no longer throws.
- **`apply` is guarded**: a mount failure is logged as `[dsh-conv-calendar] mount failed: …`
  instead of taking the boot manifest down.
- **React is resolved lazily**, so a module table without `react` degrades to that log line.
- **Session history is read via `sessionQuery`** rather than a direct `zstdDecompressSync`:
  the logs are appended frame by frame, and a one-shot decompress yields only the first
  frame on some runtimes.

[Unreleased]: https://github.com/Leni-More/dsh-conv-calendar/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Leni-More/dsh-conv-calendar/releases/tag/v0.1.1
[0.1.0]: https://github.com/Leni-More/dsh-conv-calendar/releases/tag/v0.1.0
