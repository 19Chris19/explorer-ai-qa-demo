# Read-only Migration History (Unpublished Candidate)

This website candidate adds a private historical view, not a Provider session
import. No tag/image has been published by this change. It does not deploy,
restart, export live data, or alter existing cookies, signing or native runtime.
The parent operator must audit the running Air port 3117 additional-Bot contracts
before any separately approved cutover. Health alone is not that audit.

## Private Input Contract

`PROVIDER_A_HISTORY_ARCHIVE_PATH` is optional and disabled when blank. When set,
use an absolute path to a private regular UTF-8 JSON file outside the checkout,
static directories and container image. Mount it read-only for the BFF user;
restrict its host directory and file permissions. Symlink files are rejected.
Never commit archives, identities, tokens, account IDs or live questions.
Only synthetic fixtures belong in tests. No runtime directory is imported.

The exact top-level shape is `{schemaVersion: 1, conversations: [...]}`.
Unknown keys at every validated level are errors, not silently stripped.
Each conversation supports:

| Field | Contract |
| --- | --- |
| `id` | Required unique string, ASCII letters/digits/hyphen, 1-100 characters |
| `ownerKey` | Required exact Provider `X-IMA-Client-Id` previously sent by this BFF: `demo:` plus UUID, or the legacy bare UUID |
| `title` | Optional string, at most 500 characters; missing/empty uses the UI default |
| `createdAt`, `updatedAt`, `expiresAt` | Required finite nonnegative integer epoch milliseconds, as serialized by Provider; UTC ISO strings also accepted |
| `mode` | Optional nonempty descriptive string, at most 80 characters; never enables continuing a session |
| `turns` | Required nonempty array; chronological timestamps within conversation creation/update bounds |

Creation <= update <= expiry is required. Expired rows remain private but are
not served. Missing owners, invalid identities, empty turns, duplicate IDs and
inconsistent timestamps reject the entire archive. Nothing guesses ownership.
An otherwise valid UUID whose original cookie is unavailable cannot be recovered
by selecting an owner in a request. Do not reassign orphaned rows to a new visitor.

Each turn requires `question` (1-2000 characters), `answer` (1-200000 characters)
and `createdAt` (same timestamp format). Optional metadata:

- `sources`: defaults to `[]`, up to 100 nonempty objects. Only `index` (integer
  1-100), `title` (up to 2000 characters), `snippet` (up to 8000), `url` and `type`
  (up to 2000 each) are accepted. Empty title/snippet is allowed. Optional URLs
  must be HTTP(S), without userinfo; the exporter must redact sensitive URL
  parameters or omit unsafe URLs. URLs are not fetched by the archive loader.
- `searchSummary`: defaults to `null`; null or a string up to 16000 characters.
- `evidence`: defaults to `null`; null or an object with only `source_intent`,
  `answer_basis`, `source_count`, `knowledge_source_count`, `web_source_count`,
  `complete`, `interrupted`, `timing`, `process`. All evidence keys are optional.
  Counts are integers 0-100. Intent is empty or `web_requested`; basis is empty,
  `knowledge`, `web`, `mixed`, `agent_general`, or `provider_fallback`.
  Completion flags are booleans. Timing accepts only `elapsed_ms` and
  `queue_wait_ms`, finite numbers 0-86400000. Process accepts up to 100 objects
  with only required nonempty `kind` (40 characters) and `text` (4000).

Limits: 16 MiB file, 10000 conversations, 1000 turns per conversation, 50000 total
turns. File reads are bounded; malformed JSON/UTF-8, inaccessible files, invalid
schema or exceeding limits fail startup before listening. Errors do not print
archive contents. There is no automatic reload or silent fallback to empty history.
Metadata may not carry upstream bindings, account IDs, credentials or extra fields.
Free-text redaction remains the exporter's responsibility.

## Identity and Read-only API

Only `GET /api/qa/archive/conversations` and
`GET /api/qa/archive/conversations/archive%3A<id>` are supported. Other methods
return 405 in the BFF and are not allowed through either preview allowlist.
Responses use `Cache-Control: no-store`, exclude owner and mode, and use
`conversationId: "archive:<id>"`, `archived: true`, `readOnly: true`.
Disabled list responses explicitly contain `enabled: false`; missing, expired
and other-owner details all return 404.

Identity is obtained only through the unchanged `getClientId` signature/cookie
policy, including its existing legacy-cookie behavior. Query parameters, request
bodies and `X-IMA-Client-Id` headers cannot select the owner. A custom cookie name
or prefix preserves the existing namespace policy. Do not rotate signing keys,
rename cookies or transplant runtime files as part of enabling this view.

The recent list labels archive rows **迁移前记录，只读** and omits deletion.
Opening a row uses the normal answer renderer and copy controls. It clears the
active native conversation and queue view without writing a Provider session or
persisting an archive ID as a native ID. Submitting a new question creates a fresh
ordinary conversation before streaming. Colons are invalid in native IDs, so a
colliding original ID cannot make an archive ID enqueue, continue or delete a
native session. Archive failures are shown as history-load errors, not no-history.

## Controlled Air Host Access

The default allowlist remains loopback `http://127.0.0.1:<port>` and private
Compose `http://provider-a:3000`. Only explicit server configuration
`PROVIDER_A_ALLOW_HOST_GATEWAY=true` additionally permits the exact base URL
`http://host.docker.internal:3117`. Other values do not opt in. No alternate port,
scheme, path, query, fragment, userinfo or arbitrary host is accepted.
All Provider readiness and ordinary/streaming requests reject redirects.
Neither setting can be supplied through browser requests.

Docker Desktop host resolution/network reachability and Linux host-gateway mapping
remain operator responsibilities in a separate approved window. This change does
not modify Compose, networking or the running Air Provider. Keep internal/admin
routes private; only the two archive GET routes were added to preview allowlists.

## Agent Verification and Handoff

### Operational Gates: Archive Before Upstream Cutover

The following are separate operator-approved gates, not actions performed by this
website change. Parent-reported maintenance/enrollment/admin integration does not
by itself prove that the running 3117 process implements those contracts.

1. Record the current website build, upstream address and rollback configuration.
   Preserve the existing cookie name/path/signing secret and native runtime in
   place. Do not import Provider runtime or change browser identities.
2. Parent performs the separately authorized private export using its offline
   stopped-port and file-lock guards. Both guards must succeed; never bypass a
   held lock or an active port. Verify the source/export snapshot and redact
   sensitive metadata. This website does not implement or attest those guards.
3. Validate the archive against this schema before changing the upstream. Enable
   its read-only mount/path on the approved candidate while retaining the old
   upstream setting. Require successful startup, retained-owner list/detail and
   copy checks, different-owner denial, and no archive enqueue/continuation.
   If signing identity is unavailable, rows are malformed/orphaned, or validation
   fails, stop. Do not skip history validation and switch first.
4. Separately audit the actual target 3117 process: ordinary ownership behavior,
   native streaming/capacity contracts, and the parent's maintenance/enrollment/
   additional-Bot admin requirements. Require private reachability from the
   candidate container and blocked public internal/admin routes. A health result
   or source merge is insufficient. Any real question requires its own approval.
5. Only after archive acceptance AND target-contract acceptance, obtain explicit
   approval for the service window and change the upstream to the exact approved
   address. Enable the host-gateway flag only when that topology is selected.
   Preserve the accepted archive, cookies, signing and native runtime. Verify a
   fresh normal session and keep archived sessions read-only.

On failure, halt progression. Roll back only the website/upstream configuration
within the approved window; do not rewrite owners, rehydrate archived sessions,
or restore old Provider accounts. This candidate performed no real migration.

Use synthetic data only for candidate checks: `npm test` and `npm run build`.
Do not call live ask/enrollment/export endpoints or copy private runtime files to
make tests pass. The build copies the archive loader, never an archive file.
Actual owner recovery, redacted export, private mounting and Air compatibility
are separate parent-audited steps, not evidence supplied by these tests.

Rollback: disable the archive setting to remove historical visibility, disable
host-gateway opt-in and restore the previous approved upstream, or revert this
candidate commit. Such configuration changes require a separate approved service
window. Do not overwrite cookies/signing/runtime or restore an older account DB.
