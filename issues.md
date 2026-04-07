# Issues

Last updated: 2026-04-07

## Security

- [ ] LOW: CORS is wildcard (*) on all API endpoints. Acceptable for public tool, but monitor for abuse.
- [ ] LOW: LLM prompt injection surface via user queries. Inherent to LLM-based systems.

## Bugs

## UX

- [ ] MEDIUM: Tailwind loaded from CDN (play mode). Should vendor a pre-built CSS file for production reliability.
- [ ] LOW: Theme toggle missing from report.html permalink page.
- [ ] LOW: Source contribution text hidden on mobile.

## Code Quality

- [ ] LOW: `escapeHtml()` duplicated in app.js and report.js. Could extract to shared util.
- [ ] LOW: D1 source/product inserts in orchestrator are sequential, not batched.
