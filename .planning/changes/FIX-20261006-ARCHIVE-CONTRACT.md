# FIX-20261006-ARCHIVE-CONTRACT

## Goal

Audit the public Provider export against the unchanged website archive contract,
from isolated Explorer f4992da and public Provider 32be509 worktrees. No live
histories, credentials, services, Docker, push or release operations.

## Reproduction and decision

Enabled archive-export-interop.test.mjs: source mapping passes; five child tests
fail because auditHistoryInput/exportHistoryWithReport are missing. This is a
Provider producer gap, not a reason to loosen website ownership/privacy parsing.
Implement pure exporter hardening in the isolated public Provider branch and
leave website parser, fixtures and assertions unchanged.

## Result and exact pair

Provider fix SHA: c04e13372388281bf30546348645bc9936f0279d on
codex/FIX-20261006-PUBLIC-ARCHIVE-CONTRACT, based on 32be509.
Explorer verification base: f4992da; this branch only adds documentation.
Provider export/preflight implementation files match reviewed monorepo 92c01bd7
byte-for-byte. No Air CLI or live-state behavior was ported.

- Original unchanged Explorer interop: 7/7 including parent test.
- Explorer complete suite with Provider test module enabled: 158/158, zero skips.
- Provider focused transfer/preflight/native-store tests: 19/19; independent
  offline apply/rollback regression: 40/40; full suite exit 0 with parser enabled.
- Explorer build and Provider web-vendor build: passed; diff checks passed.
- Both standalone governance commands exit 2 because the script is absent.
  This validation gate remains unavailable, not passed.
- No runtime data, live credentials, existing services, Docker or push used.

## Contract differences and rollout

Public nested evidence is preserved; legacy flat evidence is mapped without
coercion and conflicts fail. Auditing now precedes projection, checks ownership,
dates, completion, metadata and quotas, and emits count-only diagnostics.
Default export rejects shells and unsafe URLs; explicit options remove only
valid shells or all URLs with counts, never malformed records or entire sources.
Supported timing/process/completion fields survive; private upstream/L0 fields
are excluded with counts. Missing/null summaries stay null. Success remains
schema v1; rejection is now archive_preflight_failed. Public store normalization,
account cryptography, CLI flags and offline apply/rollback remain unchanged.

This is unpublished isolated candidate evidence, not acceptance of any image or
live Air process. Integrate the Provider commit before enabling this gate on the
release pair. Rollback this documentation commit independently; reverting the
Provider fix restores the incompatibility and must block archive acceptance.
