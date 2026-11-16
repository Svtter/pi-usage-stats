# pi-usage-stats

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that shows **prompt-cache hit rate** and **output token speed** in the footer status bar, updated after every assistant response.

![pi-usage-stats in the footer](assets/screenshot.png)

```
cache 87%/91% · 42.3 tok/s · 1.2k out
```

## What it shows

| Segment | Meaning |
|---|---|
| `cache 99.5%` | Prompt-cache hit rate of the last response: `cacheRead / (input + cacheRead + cacheWrite)` — same formula as pi's built-in footer `CH` indicator |
| `/49.7%` | Session-cumulative hit rate across all responses so far |
| `42.3 tok/s` | Output tokens ÷ response duration (pi-ai's monotonic `durationMs`, from request start to response end) |
| `1.2k out` | Output tokens of the last response |

Hit-rate color hints: green ≥ 50%, yellow > 0%, muted when 0.

## Install

With the pi CLI:

```bash
pi install git:github.com/Svtter/pi-usage-stats
```

Or manually copy [`extensions/usage-stats.ts`](extensions/usage-stats.ts) into your user extensions directory and restart pi (or run `/reload`):

```bash
mkdir -p ~/.pi/agent/extensions
cp extensions/usage-stats.ts ~/.pi/agent/extensions/
```

## How it works

The extension subscribes to message lifecycle events. On `message_end` of an assistant response it reads `message.usage` (`input`, `output`, `cacheRead`, `cacheWrite`) and `message.durationMs` (pi-ai's monotonic request timing), computes both metrics, and renders them with `ctx.ui.setStatus()`.

## Provider support

Cache hit rate requires the provider to report cache token usage. Works with Anthropic-compatible APIs (Anthropic, Zhipu GLM, DeepSeek, Kimi, OpenRouter, ...). Providers that do not report cache fields will show `cache 0%` while the token speed still works.

## Notes

- `tok/s` is end-to-end throughput from request start to response end: it includes time-to-first-token, server-side prompt processing, and reasoning/thinking tokens (they are part of `output`). It is a conservative figure rather than a pure decode speed.
- Cache hit rate matches pi's built-in footer `CH` indicator (one decimal). The session-cumulative number includes cold-start turns, which pull it down early in a session.
- A cold start (new session, changed system prompt, or an idle gap longer than the provider's cache TTL) shows as a hit-rate drop on the next response.

## 中文说明

pi 状态栏扩展：显示提示缓存命中率与输出 token 速度。

- `cache 99.5%/49.7%` — 最近一条响应的缓存命中率 / 本次会话累计命中率（与 pi 内置 `CH` 同公式、同精度）
- `42.3 tok/s` — 最近一条响应的端到端产出速度（含首 token 延迟与思考 token，采用 pi-ai 单调时钟计时）
- `1.2k out` — 最近一条响应的输出 token 数

安装：`pi install git:github.com/Svtter/pi-usage-stats`，或将 `extensions/usage-stats.ts` 复制到 `~/.pi/agent/extensions/` 后重启（或 `/reload`）。

## Development

```bash
npm test
```

Runs the unit tests with Node's built-in test runner (`node:test`, no dependencies). The tests instantiate the extension with a mock `pi` event bus and assert on the rendered status text, including the cache formula alignment with pi's `CH` indicator and the `durationMs` / wall-clock fallback paths.

## License

[MIT](LICENSE)
