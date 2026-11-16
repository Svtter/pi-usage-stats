## [1.1.0] - 2026-11-16

- tok/s now uses pi-ai's monotonic `durationMs` (request start → response end) instead of a wall clock from stream open, which could report inflated speeds when the provider buffers responses.
- Cache hit rate shown with one decimal to match pi's built-in `CH` footer indicator (same formula).
- Added unit tests (`node:test`, zero dependencies).

## [1.0.0] - 2026-11-16

- Initial release.
- Footer status showing per-response and session-cumulative prompt-cache hit rate.
- Per-response output token speed and output token count.
