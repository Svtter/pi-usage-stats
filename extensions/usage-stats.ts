/**
 * pi-usage-stats
 *
 * Footer status for the pi coding agent: prompt-cache hit rate and
 * output token speed, updated after every assistant response.
 *
 *   cache 99.5%/49.7% · 42.3 tok/s · 1.2k out
 *
 * - `cache 99.5%/49.7%` — prompt-cache hit rate of the last response and
 *   of the session so far: cacheRead / (input + cacheRead + cacheWrite).
 *   Same formula as pi's built-in footer `CH` indicator.
 * - `42.3 tok/s` — output tokens ÷ response duration. Duration comes from
 *   pi-ai's `durationMs` (monotonic clock, measured from request start to
 *   response end), so the figure includes time-to-first-token, prompt
 *   processing, and reasoning tokens. Falls back to wall-clock
 *   message_start → message_end when `durationMs` is absent.
 * - `1.2k out` — output tokens of the last response.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "usage-stats";

function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${n}`;
}

export default function (pi: ExtensionAPI) {
	let responseStartMs = 0;
	let totalPromptTokens = 0;
	let totalCacheReadTokens = 0;

	pi.on("message_start", async (event) => {
		if (event.message.role === "assistant") {
			responseStartMs = Date.now();
		}
	});

	pi.on("message_end", async (event, ctx) => {
		const message = event.message;
		if (message.role !== "assistant" || !message.usage) return;

		const usage = message.usage;
		const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
		totalPromptTokens += promptTokens;
		totalCacheReadTokens += usage.cacheRead;

		// Prefer pi-ai's monotonic request timing; fall back to the
		// stream-open wall clock captured at message_start.
		let elapsedMs = message.durationMs ?? 0;
		if (elapsedMs <= 0 && responseStartMs > 0) {
			elapsedMs = Math.max(1, Date.now() - responseStartMs);
		}
		responseStartMs = 0;

		const theme = ctx.ui.theme;

		// Cache hit rate: last response and session cumulative.
		const hitRate = promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : 0;
		const sessionHitRate =
			totalPromptTokens > 0 ? (totalCacheReadTokens / totalPromptTokens) * 100 : 0;
		const hitColor = hitRate >= 50 ? "success" : hitRate > 0 ? "warning" : "muted";

		const parts = [
			theme.fg(hitColor, `cache ${hitRate.toFixed(1)}%`) +
				theme.fg("dim", `/${sessionHitRate.toFixed(1)}%`),
		];

		if (elapsedMs > 0 && usage.output > 0) {
			const tokensPerSecond = usage.output / (elapsedMs / 1000);
			parts.push(theme.fg("accent", `${tokensPerSecond.toFixed(1)} tok/s`));
			parts.push(theme.fg("dim", `${formatTokenCount(usage.output)} out`));
		}

		ctx.ui.setStatus(STATUS_KEY, parts.join(theme.fg("dim", " · ")));
	});

	pi.on("session_start", async (_event, ctx) => {
		responseStartMs = 0;
		totalPromptTokens = 0;
		totalCacheReadTokens = 0;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
