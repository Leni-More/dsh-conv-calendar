# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
