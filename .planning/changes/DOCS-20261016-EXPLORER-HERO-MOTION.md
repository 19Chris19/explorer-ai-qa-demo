# DOCS-20261016-EXPLORER-HERO-MOTION

## User Goal
Use the approved continuous logo-aperture transition as the website README hero.
Keep the original stacked logo and reveal only the actual welcome/composer module.

## Scope
Documentation assets only, on codex/DOCS-20261015-EXPLORER-README.
Base-SHA: c350b8215fa97a68e19ceb2abf664d903700e26b.
Export a single-play GIF, retain a static opening and reproducible motion source.
The source screenshot uses the existing synthetic preview; no account or IMA call.
The user approved embedding on 2026-10-16. Update existing Draft PR 21 only.

## Verification
Check opening, closing, reveal and final frames, GIF dimensions, duration and size,
README assets/links, Ego desktop/mobile preview, diff and governance checks.
Record measured results after export.

2026-10-16 results:
- Encoded GIF: 900 x 593, 144 frames at 24 FPS, 6 seconds, 1,410,468 bytes.
- Single play, settled final hold; static opening PNG and editable Canvas source retained.
- Encoded opening/closure/final frames inspected. Ego space 38 checked the actual
  README at desktop and 390px dark mode: no horizontal overflow or missing images.
- Focused README and preview-server tests: 3 passed; README asset audit passed.
- Root governance: 0 failures, 3 existing warnings (unrelated dirty tree, upstream,
  worktree count). No application tests rerun for this docs-only asset iteration.
- Local preview server additionally declares the image/gif content type.

## Rollout
Documentation feature branch and existing Draft PR; no service or Release update.

## Rollback
Revert this documentation commit; the prior hero.png remains available.
