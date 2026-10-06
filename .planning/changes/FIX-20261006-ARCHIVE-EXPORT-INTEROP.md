# FIX-20261006-ARCHIVE-EXPORT-INTEROP

## Goal
Verify synthetic archives produced by the actual Provider migration exportHistory
function against the website parser. Keep all changes in the website repository.
Owner: provider-admin-20261006. Parent change: FEAT-20261006-EXPLORER-ARCHIVE.

## Scope and decisions
Accept validated sourceType (0/1/2) and integer source type metadata. Normalize
the exported sourceIntent alias to source_intent, rejecting conflicting aliases.
Retain strict unknown-field, enum, timestamp and empty-turn rejection. Document
the explicit exporter preflight needed for valid empty Provider conversations.
No Provider edits, real data, runtime reads, migration, deployment or push.

## Verification
- Reproduced failures against the first actual exporter for raw sourceType and
  sourceIntent. Parent concurrently added exportSource/exportEvidence mappings;
  reread the file and tested that current implementation without editing it.
- Reviewed file: /Users/a123/Developer/provider-migration-20261006/src/account-transfer.js.
  SHA-256 before/after full suite:
  0fc2eedce29e1042deeaa8a638df3df5f8150d71fbc8209c2314982f3c6d332f.
- Actual exportHistory -> JSON serialization -> parseHistoryArchive interop and
  parser boundary tests: 9/9 passed. Full npm test with the explicit
  PROVIDER_A_TRANSFER_TEST_MODULE setting: 106/106 passed, no skipped tests.
- npm run build and git diff --check passed. Tests invoke exportHistory only;
  no prepareTransfer, runtime store reads, online validation or account transfer.
- Current exporter maps sourceType 0 to web and 1/2 to knowledge when type is
  absent; existing numeric/string type survives. It normalizes a valid intent
  alias only when canonical intent is absent. Website also validates old raw
  sourceType/alias archives and rejects conflicting aliases without mutation.
- Invalid canonical enums/counts and invalid/missing/reversed dates are rejected.
  Empty conversations and blank turns remain explicit acceptance blockers;
  parent must inventory/exclude valid empty shells and quarantine malformed data.
  Invalid alias metadata dropped by the exporter requires parent preflight;
  parser acceptance cannot validate data removed before serialization.
- Repository governance script remains absent; shared checker has the existing
  baseline production-record finding documented by the parent website change.

## Rollout and rollback
Unpublished candidate. Archive acceptance still precedes any upstream cutover.
Revert this follow-up to website 6237d8a; never restore upstream session state.
