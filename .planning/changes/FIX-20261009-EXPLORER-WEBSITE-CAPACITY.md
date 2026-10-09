# Read website capacity independently from bot capacity

Change-ID: FIX-20261009-EXPLORER-WEBSITE-CAPACITY

## Goal and scope

Base: website parent b2fb43e. Prefer the nested website capacity snapshot over
aggregate bot capabilities. Validate its own schema, native mode and features;
do not fall back to bot facts when a nested snapshot is invalid or incompatible.
Retain both existing generic capacity shapes when website is absent.

Nested contract requires schemaVersion 1 and mode knowledge_agent, with boolean
knowledge_agent_keyed_sse_v1 and durable_qa_tasks_v1 feature flags. Capacity and
queue counters come from that same snapshot; missing nested counters use zero,
not aggregate health counters. Capability remains independent of empty capacity.

Only provider-a-client.mjs, focused tests and this record are in scope. No
parent edits, Provider changes, UI changes, live configuration or deployment.

## Verification plan

Red first: native website empty pool remains connected and compatible but has
no capacity; classic website plus native bot is incompatible, never ready.
Cover positive nested readiness, invalid nested metadata, and both legacy
generic policies and policy_capacity shapes. Run focused tests only; parent
owns the subsequent full suite.

## Verification results

- Red first: 4 nested-snapshot tests failed; both generic legacy shapes passed.
  Empty website capacity was incorrectly reported as bot capacity 9, and the
  classic website incorrectly retained a native contract.
- Green: 16 focused tests pass across provider-website-capacity,
  provider-a-client and composer-controls. Covers malformed nested snapshots,
  independent schema/features, mode mismatch, empty pool and queue counters.
- git diff --check passes. External root governance: 0 failures, 3 existing
  warnings; this standalone website repository has no local governance checker.
- Full suite and build not run as requested; parent owns final verification.
  All Provider responses are synthetic; no live request or config edit.

## Rollout and rollback

Parent may cherry-pick the atomic commit together with Provider's mode-based
website capability correction. Revert this commit to restore the previous
aggregate capacity interpretation. No live rollout is performed here.
