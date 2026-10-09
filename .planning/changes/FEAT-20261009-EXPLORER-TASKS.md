# Durable Provider tasks in the website BFF

User goal: an observer disconnect must not cancel an accepted IMA answer.
Scope: task adapter, same-origin routes, private/public gateway allowlists and
queued-turn bridge. Legacy ask remains compatible but is not a fallback for the
new website. No live service, account or deployment changes are authorized here.

Plan: capability gate; fixed server-controlled Provider task routes; signed-cookie
ownership; hashed idempotency keys; replay subscriptions; explicit cancellation.
Keep submission frequency and pending protections without a public execution lock.
Preserve existing editable pending turns and dispatch them as durable tasks.

Verification: synthetic transport, ownership, replay, cancellation, overload and
public path tests; full tests/build/governance before integration. Real IMA,
production rollout and physical phone checks remain separate acceptance gates.

Rollout: isolated candidate first, then 4318 only after compatible Provider is
available and the maintenance window is approved. Do not silently use legacy ask.
Rollback: drain tasks, switch compatible code only; never restore old user data.

Initial verification: Node suite 186 PASS / 2 explicitly skipped, build PASS;
root governance 0 failures (existing dirty-tree/worktree warnings). The first
370596 ms synthetic chain passed with one upstream dispatch, one completion,
byte-equivalent Markdown and one 240-second subscription rotation after a
deliberate viewer disconnect. This used development Provider core code and the
actual local proxy function, not the live Vercel/ngrok network or real IMA.
Final combined candidate and Docker checks remain integration gates.
