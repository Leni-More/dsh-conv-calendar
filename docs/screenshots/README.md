# Screenshots

Each README has its own screenshot set, shot with the GUI set to that language — the
plugin follows the interface language, so the two sets differ in labels and copy.

| Directory | Used by | UI language |
| --- | --- | --- |
| `en/` | [README.md](../../README.md) | English |
| `zh-CN/` | [README.zh-CN.md](../../README.zh-CN.md) | Chinese |

Both directories need the same two files:

| File | What it should show |
| --- | --- |
| `panel.png` | The whole panel in the Web GUI — sidebar entry highlighted, four stat cards, the full 53-week grid with a few months of real activity |
| `tooltip.png` | A close-up of one day hovered under the **Tokens** metric, with the `in · out · cached` breakdown visible |

> In the Chinese set the metric switch reads 消息 / 会话 / Token / 输出 and the tooltip
> breakdown reads 输入 · 输出 · 缓存 — that is expected, not a mismatch.

## Status

All four images are in place.

| File | State |
| --- | --- |
| `en/panel.png` | done |
| `en/tooltip.png` | done |
| `zh-CN/panel.png` | done |
| `zh-CN/tooltip.png` | done |

## How to retake them

1. Install the plugin and restart DeepSeek Harness.
2. **Pick the language first**: Settings → General → Language. The panel re-renders in
   place, so you can shoot one language, switch, and shoot the other without restarting.
3. Open **Conversation calendar** in the sidebar.
4. For `panel.png`, capture the whole window; keep it ~1200 px wide so the 53 columns fit.
5. For `tooltip.png`, hover a shaded square under the **Token** metric until the tooltip
   with `in · out · cached` shows, then capture that region only.
6. Trim the browser chrome and save as PNG under the matching directory.

Light or dark theme both work — the panel follows the DSH theme variables. Pick whichever
looks better and keep it consistent across all four images.

## Tips

- Prefer screenshots with real activity (several shaded weeks) over an almost-empty grid.
- PNG at 1× or 2× scale is fine; avoid JPEG for UI text.
- Keep each file under ~400 KB.
