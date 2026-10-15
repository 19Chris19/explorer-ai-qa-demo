# DOCS-20261015-EXPLORER-README

## User Goal
Rewrite the private Zhitianxia homepage with the authentic existing logo, current
website experience, clear Provider relationship and an understandable first use.

## Scope
README, current Agent version references, logo-based static hero, synthetic UI
screenshots, architecture diagram and documentation regressions. Base: main 478e46d.
Use installed beautify-github-readme, identical to upstream d6562a5. Gemini call
returned HTTP 503/model_not_found; no Gemini recommendation or approval is claimed.

## Boundaries
Base-SHA: 478e46d3d081cced90cedf1f2f1e3d392d8525a8.
No application, runtime, account, Release, container-image or Vercel configuration change.
No real IMA call or live history screenshot. Existing public/site/logo.png stays
unchanged. Screenshots show real committed frontend with clearly synthetic data.
No claim of main-site deployment, open shared accounts or all-platform acceptance.

2026-10-15: local preview approved for commit, feature-branch push and a Draft PR.
Merge, Release, production-branch movement and runtime deployment remain excluded.

## Verification
Red-first story/version/assets/link checks, skill audit, actual desktop/mobile
rendered previews, frontend build/performance checks and governance. Record final
evidence before handoff. GitHub publication is separate from service rollout.

## Verification Results

- Full npm suite: 335 passed, 2 existing skips, 0 failures (337 tests).
- Added preview-server regression separately: 1 passed, including blocked writes,
  unknown APIs and encoded traversal. README story/assets/link checks: 2 passed.
- Build, public resource budget and check:release passed. Public assets remain
  388927 raw / 161188 gzip bytes; README images are not runtime resources.
- README skill audit passed. Ego space 37 used exclusively: current synthetic
  welcome/answer screenshots, real-logo hero, 980/360px light/dark README checks,
  no page horizontal overflow and no missing embedded images.
- Hero 33 KiB; welcome 87 KiB; answer 130 KiB. Logo unchanged, SHA in ASSETS.md.
- Root governance: 0 failures / 3 existing warnings. Repo governance has a
  pre-existing hard finding on DOCS-20261009-EXPLORER-DURABLE-CLOSE.md: the
  checker mistakes its “no production state” sentence for a deployment without
  a SHA. Verified unchanged in origin/main; do not rewrite historical evidence.
- Gemini returned 503; no Gemini approval or ImageGen artwork claimed.
- Read-only public health reported website v0.4.1 / Provider v0.6.1 and ready;
  no new IMA question, rollout or account operation performed.

## Rollout and Rollback
Docs-only codex branch. Preview first; no production branch movement, service
restart or old tag changes. Revert the documentation commit for rollback.
