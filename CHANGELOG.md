# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **`Intl` formatting follows the plugin's dictionary** instead of `<html lang>`. Switching
  the GUI language re-renders the panel in place but does not always rewrite the document
  tag, which left month labels, tooltip dates and the busiest-day card in the previous
  language beside correctly translated copy.

[Unreleased]: https://github.com/LeniMore/dsh-conv-calendar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/LeniMore/dsh-conv-calendar/releases/tag/v0.1.0
