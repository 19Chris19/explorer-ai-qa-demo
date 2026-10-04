# Main-site candidate acceptance, 2026-10-04

This is a local v0.2.0 preview checkpoint, not a main-site production launch.
Code under test is `b6bb34f8`, based on released Explorer v0.1.0. This report
contains only synthetic results and deployment metadata, not real answers.

## Completed deployment releases

| Repository | Released source | Version | Image manifest |
| --- | --- | --- | --- |
| Provider A | `48fcedc9a635e0cca44d05aba3e31ed6d1713ce2` | [v0.4.1](https://github.com/19Chris19/ima-qa-web-agent/releases/tag/v0.4.1) | `sha256:c2a90ecabbe96f091c651f54bbeba88ceb683d2d10aed5f34143f938d68c51c7` |
| Explorer | `3e85a16629a3fc309b5cf5e670a23565d32755db` | [v0.1.0](https://github.com/19Chris19/explorer-ai-qa-demo/releases/tag/v0.1.0) | `sha256:9994c34092e7e2faee97681d7089f89193c4dc7e167ba582095c179427178b75` |

Both manifests include AMD64 and ARM64. Provider A is public and its tagged
image was pulled anonymously. Explorer is private: unauthenticated registry
access is denied, while authorized CI pulled and started both architectures.
The first Provider native image gate failed; a separately reviewed workflow
fix in PR 11 passed without moving the v0.4.1 source tag.

Air is not yet authorized to pull the private Explorer GHCR image. Do not make
that package public or broaden a CLI token as a workaround. Interactive private
registry authorization is required before a registry-image upgrade on Air;
this local preview instead uses a fixed, verified source artifact. Existing
Docker services were not replaced by publishing these releases.

## Independent candidate changes

| Branch | Commit | Scope |
| --- | --- | --- |
| `codex/FEAT-20261004-EXPLORER-HOST-ADAPTER` | `722f62c` | Same-origin module prefix, Cookie/storage isolation, Vue bridge and configuration examples |
| `codex/UI-20261004-EXPLORER-MAIN-SHELL` | `222c892` (includes `1952486`) | Verified public desktop shell, named assets and licenses |
| `codex/FIX-20261004-EXPLORER-EMBED-OVERLAYS` | `bd67098` | Embedded menus, focus return and reproducible synthetic host |
| `codex/INT-20261004-EXPLORER-V020-PREVIEW` | `b6bb34f8` | Reviewed integration of the above |

No candidate branch was pushed or merged remotely. Navigation changes do not
replace the QA Hero, composer, answer formatting or website queue contract.
Embedded mode hides both internal navigation regions so the host owns the shell.

## Automated and browser results

- Full application suite: 83 passed, zero failures. Build and release-file scan
  passed. Root governance: zero failures, three existing warnings.
- Isolated synthetic hosts at `/` and `/qa-app` passed ready handshake, new
  conversation, history, More, Escape focus return, language and theme changes.
- Synthetic SSE rendered a table; copying and history reload retained it.
  Both internal navigation regions stayed hidden in embedded mode.
- Desktop matches the dated public reference: 256px sidebar, 120px logo,
  82px header, 224px by 48px navigation rows and 40px header insets. Asset
  origins, verified routes and licenses are in `MAIN_SITE_ASSETS.md`.
- Checked 360x800, 390x844, 768x1024, 1366x768 and 1920x1080: no horizontal
  page overflow; compact composer remains visible at 56px height.
- At 844x390 landscape the welcome content needs a short content-area scroll
  before the composer is fully visible. Scrolling made the whole composer
  visible without horizontal overflow. It is not claimed initially visible.
- Mobile deliberately keeps a compact header. The public site's 256px sidebar
  at 390px would leave only 134px for QA, so mobile pixel identity is not claimed.

Synthetic servers and this task's synthetic containers were stopped after
verification. They never used private credentials, account data or IMA access.

## Preview switch and rollback

4318 now runs `main-shell-b6bb34f8` from an immutable release directory. Its
website and upstream queues were empty before switching. Private configuration
and runtime were backed up outside Git; the same current runtime is retained.
The launch command now contains only the selected website server, not obsolete
server paths. The local admin and internal paths remain blocked.

Prior website artifact: `selection-copy-793caf4a`. On rollback, stop the new
writer, restore only the old compatible code pointer and start it against the
current runtime. Never overwrite newly created conversations with a snapshot.

4317 and the public Vercel preview still use `stable-05a1cce4`. Provider A,
3317, 3117, Bot and the existing Docker website were not restarted or upgraded.
The current v0.2.0 preview has not passed user review or been released.

## Remaining gates

- User review of 4318, then a separate v0.2.0 PR, CI, release and authorized
  stable website/Docker promotion. Publishing a source release alone does not
  update these running services.
- Actual main-site source integration and real Test/production deployment;
  no Test domain or authentication integration has been invented.
- Real-device soft keyboard/safe-area checks and Linux long-running operation.
- Real IMA one-question/one-follow-up verification in a separately authorized
  window; this checkpoint sent no real question.
- Provider A v0.5.0 generic UI work has not started. It must exclude brand shell,
  question bank, brand animation and the website's persistent queue.
- Release Skill v1.1.0 is a tested, reviewed local candidate pending installation
  approval; the installed v1.0.0 was not silently overwritten.
