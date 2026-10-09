# Durable task integration

Goal: integrate Provider-owned execution with browser replay and explicit stop.
Branches: BFF 662cfa4 + fixture a57aa8c; frontend 3551d68. No live rollout.
Initial review finding: a succeeded task whose event retention elapsed must be
recognized via its retained completion/history receipt, not pause later work.
Checks: combined Node suite, isolated Docker chain, desktop/mobile browser,
staged safety and governance. Record actual outcomes below before release.
Initial combined verification: 209 passed, 2 skipped, 0 failed; build passed.
Real-clock synthetic chain: 370596 ms, one 240-second subscription rotation,
one upstream dispatch, unique completion, exact Markdown/history. This used
local fake IMA and an emulated tunnel hop, not actual Vercel/ngrok/IMA evidence.
Independent review found cancellation, ambiguous-submit recovery and public
pending-admission issues; follow-up recovery branch must merge before rollout.
Docker fixture smoke passed through Nginx/BFF/Provider: replay, idempotence,
one history answer, exact Markdown, cross-owner rejection, explicit cancellation
and management-path blocking. An independent container restart produced an
indeterminate task, no fabricated success/history and no redispatch on repetition.
The fixture uses nginx:1.28-alpine, matching the already installed gateway image;
the initial 1.27 download failed and was not treated as a product failure.
Browser interaction on this preliminary image passed refresh during generation,
offline/online recovery, table completion, desktop and 390px DOM overflow checks.
Page.captureScreenshot timed out, so visual screenshot approval remains pending.
These checks must be repeated on the final recovery integration before rollout.
Final-chain rerun initially exposed an outdated synthetic client: it omitted
the required pre-dispatch callback and was correctly rejected. The fixture now
marks dispatch and reports byte-count-only activity; the 1500ms smoke passed in
2473ms. The >=6-minute rerun remains a separate required result.
The optional SYNTHETIC_TOKENLESS fixture setting is only for local synthetic
built-in UI checks. Production credentials and auth policy are not changed.
Rollback: drain accepted tasks; revert dependent UI/BFF code together, retain all
new history and Provider task records. Public/runtime rollout requires approval.
Final full-suite load exposed two test timing assumptions (heartbeat before a
60ms expiry and a CLI snapshot remaining fresh across process startup). Focused
reproduction passed. Heartbeat ordering now uses a controlled clock separately
from HTTP expiry; the maintenance check waits for a fresh valid snapshot without
relaxing the production 2-second freshness bound.
Final verification (2026-10-09): 240 tests, 238 passed, 2 optional skips,
no failures; build passed. Final paired real-clock synthetic run: 370717ms,
one subscription rotation, one upstream dispatch, one completion, exact text.
Final Docker images passed chain and restart tests; final browser refresh while
generating recovered the same third table, then history preserved all three
answers. DOM overflow checks passed at 390px and 1366px, not visual screenshot
approval. Detailed evidence and remaining gates: docs/DURABLE_TASK_ACCEPTANCE.md.
