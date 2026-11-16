/**
 * pi-usage-stats
 *
 * Footer status for the pi coding agent: prompt-cache hit rate and
 * output token speed, updated after every assistant response.
 *
 *   cache 87%/91% · 42.3 tok/s · 1.2k out
 *
 * - `cache 87%/91%` — prompt-cache hit rate of the last response and of
 *   the session so far: cacheRead / (input + cacheRead + cacheWrite).
 * - `42.3 tok/s` — average output speed of the last response, measured
 *   from message_start to message_end (includes TTFT and reasoning tokens).
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

		const elapsedMs =
			responseStartMs > 0 ? Math.max(1, Date.now() - responseStartMs) : 0;
		responseStartMs = 0;

		const theme = ctx.ui.theme;

		// Cache hit rate: last response and session cumulative.
		const hitRate = promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : 0;
		const sessionHitRate =
			totalPromptTokens > 0 ? (totalCacheReadTokens / totalPromptTokens) * 100 : 0;
		const hitColor = hitRate >= 50 ? "success" : hitRate > 0 ? "warning" : "muted";

		const parts = [
			theme.fg(hitColor, `cache ${hitRate.toFixed(0)}%`) +
				theme.fg("dim", `/${sessionHitRate.toFixed(0)}%`),
		];

		// Output speed of this response.
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
