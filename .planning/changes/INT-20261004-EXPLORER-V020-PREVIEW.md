# INT-20261004-EXPLORER-V020-PREVIEW

## Goal and scope

Integrate two independently reversible changes from released v0.1.0:
host adapter 722f62c and main-site shell 222c892 (including 1952486).
Merge allowlist conflicts by retaining BOTH the bridge and the named shell
assets; never permit arbitrary site files or management routes.

## Preview gate

Run the full suite, build and scans; check synthetic root/subpath embedding,
ready handshake, theme/language/header commands and hidden internal navigation.
Measure desktop geometry and review mobile screenshots. Before updating 4318,
verify its immutable artifact, configuration, provider compatibility and idle
queues, back up privately and retain its prior code pointer. No real IMA calls.

v0.2.0 is not yet released. User reviews 4318 before PR merge, release and stable
4317/Docker promotion. Provider A, Bot and existing Docker services are not
restarted by this candidate. Deployment releases v0.4.1/v0.1.0 already exist
and are separate from this shell preview.

## Rollback and dependencies

Revert shell merge independently from the adapter. On Air switch only the code
pointer to the prior artifact, after stopping its writer; retain all new runtime
data. No tag moves, history rewriting, stale volume restore or remote push.

## Verified checkpoint, 2026-10-04

- Integrated candidate: b6bb34f8; 83 application tests, build and release-file
  scan passed. Root governance: no failures, three existing warnings.
- Synthetic root and `/qa-app` host paths passed ready, header commands,
  theme/language, table rendering and history reload. No IMA question sent.
- 4318 now runs immutable `main-shell-b6bb34f8`, retaining its private runtime.
  Website and upstream queues were idle before the switch. Prior code anchor:
  `selection-copy-793caf4a`; rollback never restores stale runtime data.
- 4317, existing Docker services, Provider A, Bot and Vercel were not promoted.
- Browser and mobile boundaries are recorded in
  `docs/MAIN_SITE_ACCEPTANCE_20261004.md`.
- Next gate: user reviews 4318, then prepare the v0.2.0 PR/release and stable
  website/image promotion. Provider A v0.5.0 remains a separate future change;
  it is not implemented or released by this checkpoint.
