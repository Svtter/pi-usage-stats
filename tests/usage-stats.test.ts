/**
 * Unit tests for the usage-stats extension.
 *
 * Runs with Node's built-in test runner and type stripping:
 *   npm test
 */

import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import factory from "../extensions/usage-stats.ts";

interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

interface AssistantEnd {
	usage: Usage;
	durationMs?: number;
}

function createHarness() {
	const handlers = new Map<string, (event: any, ctx: any) => Promise<void> | void>();
	const statuses: Array<{ key: string; text: string | undefined }> = [];

	const pi = {
		on(type: string, handler: (event: any, ctx: any) => any) {
			handlers.set(type, handler);
		},
	};

	// theme.fg marks text with its color so tests can assert both.
	const theme = {
		fg: (color: string, text: string) => `[${color}]${text}`,
	};
	const ctx = {
		ui: {
			theme,
			setStatus: (key: string, text: string | undefined) => statuses.push({ key, text }),
		},
	};

	factory(pi as any);

	const emit = async (type: string, event: any) => {
		const handler = handlers.get(type);
		if (!handler) throw new Error(`no handler for ${type}`);
		await handler(event, ctx);
	};
	const assistantEnd = (usage: Usage, durationMs?: number) =>
		emit("message_end", {
			type: "message_end",
			message: { role: "assistant", usage, ...(durationMs !== undefined ? { durationMs } : {}) },
		});
	const lastStatus = () => statuses.at(-1)?.text ?? "";

	return { emit, assistantEnd, statuses, lastStatus };
}

const usage = (over: Partial<Usage> = {}): Usage => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	...over,
});

describe("cache hit rate", () => {
	it("shows last-response and session rates with one decimal", async () => {
		const h = createHarness();
		await h.assistantEnd(usage({ input: 100, cacheRead: 900, cacheWrite: 0, output: 50 }), 1000);
		assert.equal(h.lastStatus(), "[success]cache 90.0%[dim]/90.0%[dim] · [accent]50.0 tok/s[dim] · [dim]50 out");
	});

	it("accumulates the session rate across responses", async () => {
		const h = createHarness();
		// Turn 1: cold start, everything written, nothing read.
		await h.assistantEnd(usage({ input: 100, cacheWrite: 900, cacheRead: 0, output: 10 }), 500);
		// Turn 2: full hit.
		await h.assistantEnd(usage({ input: 0, cacheWrite: 0, cacheRead: 1000, output: 10 }), 500);
		// Session: (0 + 1000) / (1000 + 1000) = 50.0%
		assert.ok(h.lastStatus().includes("cache 100.0%[dim]/50.0%"), h.lastStatus());
	});

	it("matches pi's CH rounding (99.47% displays as 99.5%)", async () => {
		const h = createHarness();
		await h.assistantEnd(usage({ input: 53, cacheRead: 9947, cacheWrite: 0, output: 5 }), 1000);
		assert.ok(h.lastStatus().includes("cache 99.5%"), h.lastStatus());
	});

	it("colors by threshold: muted at 0, warning below 50, success at 50+", async () => {
		const muted = createHarness();
		await muted.assistantEnd(usage({ input: 1000, cacheRead: 0, cacheWrite: 0, output: 5 }), 1000);
		assert.ok(muted.lastStatus().includes("[muted]cache 0.0%"), muted.lastStatus());

		const warning = createHarness();
		await warning.assistantEnd(usage({ input: 600, cacheRead: 400, cacheWrite: 0, output: 5 }), 1000);
		assert.ok(warning.lastStatus().includes("[warning]cache 40.0%"), warning.lastStatus());

		const success = createHarness();
		await success.assistantEnd(usage({ input: 500, cacheRead: 500, cacheWrite: 0, output: 5 }), 1000);
		assert.ok(success.lastStatus().includes("[success]cache 50.0%"), success.lastStatus());
	});

	it("never divides by zero on an all-zero usage", async () => {
		const h = createHarness();
		await h.assistantEnd(usage(), 1000);
		assert.ok(h.lastStatus().includes("cache 0.0%[dim]/0.0%"), h.lastStatus());
		assert.ok(!h.lastStatus().includes("NaN"), h.lastStatus());
	});
});

describe("token speed", () => {
	it("uses pi-ai's monotonic durationMs", async () => {
		const h = createHarness();
		await h.assistantEnd(usage({ input: 100, cacheRead: 900, output: 200 }), 4000);
		assert.ok(h.lastStatus().includes("50.0 tok/s"), h.lastStatus());
	});

	it("falls back to the message_start wall clock when durationMs is absent", async () => {
		const h = createHarness();
		mock.timers.enable({ now: 1000 });
		try {
			await h.emit("message_start", {
				type: "message_start",
				message: { role: "assistant" },
			});
			mock.timers.tick(500);
			await h.assistantEnd(usage({ input: 100, cacheRead: 900, output: 100 }));
			// 100 tokens over 500ms → 200.0 tok/s
			assert.ok(h.lastStatus().includes("200.0 tok/s"), h.lastStatus());
		} finally {
			mock.timers.reset();
		}
	});

	it("omits the speed segment when no timing is available", async () => {
		const h = createHarness();
		// No durationMs and no prior message_start (e.g. resumed session).
		await h.assistantEnd(usage({ input: 100, cacheRead: 900, output: 100 }));
		assert.ok(!h.lastStatus().includes("tok/s"), h.lastStatus());
		assert.ok(h.lastStatus().includes("cache 90.0%"), h.lastStatus());
	});
});

describe("output token formatting", () => {
	it("formats counts as 500 / 1.2k / 1.5M", async () => {
		const h = createHarness();
		await h.assistantEnd(usage({ input: 10, cacheRead: 90, output: 500 }), 1000);
		assert.ok(h.lastStatus().includes("500 out"), h.lastStatus());

		await h.assistantEnd(usage({ input: 10, cacheRead: 90, output: 1234 }), 1000);
		assert.ok(h.lastStatus().includes("1.2k out"), h.lastStatus());

		await h.assistantEnd(usage({ input: 10, cacheRead: 90, output: 1_500_000 }), 1000);
		assert.ok(h.lastStatus().includes("1.5M out"), h.lastStatus());
	});
});

describe("event filtering and lifecycle", () => {
	it("ignores non-assistant messages and messages without usage", async () => {
		const h = createHarness();
		await h.emit("message_end", { message: { role: "user", content: "hi" } });
		await h.emit("message_end", { message: { role: "toolResult" } });
		await h.emit("message_end", { message: { role: "assistant" } }); // no usage
		assert.equal(h.statuses.length, 0);
	});

	it("only tracks assistant message_start for the wall-clock fallback", async () => {
		const h = createHarness();
		mock.timers.enable({ now: 1000 });
		try {
			// A toolResult start between request start and end must not reset the clock.
			await h.emit("message_start", { message: { role: "assistant" } });
			mock.timers.tick(200);
			await h.emit("message_start", { message: { role: "toolResult" } });
			mock.timers.tick(300);
			await h.assistantEnd(usage({ input: 10, cacheRead: 90, output: 100 }));
			// 100 tokens over 500ms → 200.0 tok/s
			assert.ok(h.lastStatus().includes("200.0 tok/s"), h.lastStatus());
		} finally {
			mock.timers.reset();
		}
	});

	it("session_start resets counters and clears the status", async () => {
		const h = createHarness();
		await h.assistantEnd(usage({ input: 100, cacheRead: 900, output: 50 }), 1000);
		await h.emit("session_start", { type: "session_start" });

		const cleared = h.statuses.at(-1);
		assert.equal(cleared?.key, "usage-stats");
		assert.equal(cleared?.text, undefined);

		// Counters were reset: session rate equals the new single response.
		await h.assistantEnd(usage({ input: 500, cacheRead: 500, output: 10 }), 1000);
		assert.ok(h.lastStatus().includes("cache 50.0%[dim]/50.0%"), h.lastStatus());
	});
});
