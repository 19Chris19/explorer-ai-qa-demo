# FEAT-20261004-EXPLORER-HOST-ADAPTER

## User goal and baseline

Prepare the same-origin main-site adapter for the separate v0.2.0 candidate.
Baseline is private v0.1.0 / 3e85a166. Keep the standalone entry, QA protocol,
credentials, persistent data and existing deployed services unchanged.

## Scope

- Validate the configured module prefix and cookie namespace.
- Support direct prefixed routes as well as the documented prefix-stripping proxy.
- Add a versioned parent/frame ready and preferences bridge; require same origin
  and the actual parent window. Keep the three existing top-bar commands.
- Make the Vue adapter path configurable and provide separate environment samples.

## Verification and rollout

First add failing synthetic tests, then implementation, full application checks
and named staging. This is adapter infrastructure, not a claim of visual 1:1
fidelity or production main-site acceptance. The shell is a separate change.
Only show an integrated candidate on 4318 after synthetic acceptance; user review
precedes v0.2.0 publication or stable cutover.

## Rollback

Revert the adapter commit before reverting a dependent shell/integration change.
Never restore old runtime data or restart Provider A as a website rollback.
