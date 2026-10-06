# FEAT-20261004-EXPLORER-HOST-ADAPTER

## Source and deployment evidence (retrospective)

Implementation-SHA: 722f62c9c622df87df8a17cc3c3fdbcb7fd2e266
Preview-Source-SHA: b6bb34f8caf6ef6720d96f5049a8ba9327993a3e
Evidence-Record-SHA: a553b78fa01fd6961f791030cc894335a9de927d
Production-Deployment: Not deployed to the production main site at this checkpoint.

The implementation commit was candidate-only; later committed evidence in
docs/MAIN_SITE_ACCEPTANCE_20261004.md records its integrated 4318 preview.
The implementation is an ancestor of that preview source. Do not mislabel the
preview as production or infer current deployment from this historical record.
Current runtime and any later production promotion are unverified by this audit.


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
