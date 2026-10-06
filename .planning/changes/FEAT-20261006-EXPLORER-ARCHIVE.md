# FEAT-20261006-EXPLORER-ARCHIVE

## Goal and scope
Website-only read-only migration history, authenticated using the existing BFF
cookie identity, and explicit opt-in to the exact Docker host gateway upstream.
Base: 6323d32. Owner: provider-admin-20261006.
Worktree: /Users/a123/Developer/explorer-archive-20261006.
No Provider changes, real data export, runtime imports, live configuration,
service restart, deployment, release, or push.

## Design and acceptance
- Optional private archive; strict bounded validation before listening, fail closed.
- Owner comes exclusively from getClientId; no owner fields in public responses.
- Separate archive ID namespace, no native registration or queued dispatch.
- Existing answer rendering/copy; fresh native session for subsequent questions.
- Exact host gateway allowlist requires explicit server setting; no redirects.
- Test owner isolation, malformed input, read-only routes, collisions, UI and URLs.
- Run npm test, npm run build, staged diff/security review and governance checks.

## Rollout and rollback
Unpublished candidate only. Parent audits and exports private data separately.
Disable archive setting to remove historical view; revert this commit to restore
base behavior. Preserve all existing signing keys, cookies and native runtime.

## Verification
- npm test: 100/100 passed; final rerun with dot reporter passed.
- npm run build and git diff --check passed.
- Synthetic BFF tests cover mixed owners, forged/current/legacy/namespaced
  cookies, read-only methods, native/archive ID collisions, no archive enqueue,
  malformed JSON/UTF-8/schema, bounded bytes/counts, optional startup config,
  metadata defaults and Provider numeric timestamps.
- Both preview allowlists and exact host-gateway opt-in tested; all Provider
  requests prohibit redirects. UI tests exercise normal rendering/copy and a
  fresh native session after archive viewing, without submitting archive IDs.
- Synthetic browser check: 1366x768 desktop and 390x844 mobile; archive list,
  answer, copy control and read-only labels visible; no document overflow.
- Worktree ownership verified. Named files staged and diff reviewed; all test
  identities and credentials are synthetic. Final staged scanner flags the
  unchanged Authorization template interpolation in provider-a-client.mjs as a
  literal credential (also present at 6323d32), not an embedded secret.
- Website has no scripts/check_governance.py (requested command cannot run).
  Shared skill checker reports an existing baseline hard finding in
  UI-20261004-EXPLORER-MAIN-SHELL.md: its mention of production acceptance is
  interpreted as a production deployment without SHA. Confirmed at 6323d32;
  no unrelated governance files or historical records changed. Other baseline
  warnings: partial governance initialization, old verification record, original
  worktree without owner, feature branch without upstream.
- npm ci reported one high advisory; dependencies/lockfile unchanged, no audit
  fix applied. Provider transitive dependency audit remains outside scope.
- No real export, running Provider audit, Docker host reachability test, service
  restart, live configuration mutation, deployment, release or push performed.

## Parent contract clarification
Epoch-millisecond timestamps accepted. Optional title/mode and turn metadata may
be absent; ownership and structural timestamps remain mandatory. Evidence keeps
source_intent, answer_basis and all three source counts. Closed source fields
are index/title/snippet/url/type. Full exporter constraints and unpublished
candidate compatibility are documented in docs/MIGRATION_HISTORY.md.
Parent reports maintenance/enrollment/admin integration and offline stopped-port
plus file-lock migration guards. No actual migration performed here. Documentation
requires accepted read-only archive before any upstream change, then independent
running-target contract acceptance and explicit service-window approval.
