# Main-site and Linux handoff

## Repository boundary

The main site owns navigation, login and its AI QA route. This repository owns
the QA experience and same-origin BFF. Provider A remains a separate service,
pinned for this handoff to [v0.4.0](https://github.com/19Chris19/ima-qa-web-agent/releases/tag/v0.4.0)
or a later release declaring `knowledge_agent_keyed_sse_v1` in the protected
capacity contract. A process that responds to `/healthz` but lacks that
contract is not ready for this website.

`src/vue/ExplorerQaModule.vue` is a thin Vue 3 route adapter around the same
QA UI used by the standalone demo. Place it inside the main site's content
region; it renders no second header or sidebar. On the AI QA route, the host
header should show `AI 问答 / 交流群` and one More menu; the host sidebar adds
one `AI 问答` entry. Wire host actions through the adapter's exposed
`newConversation`, `openHistory` and `openOptions` methods. The BFF must be
available on the same public origin under `/api/qa/` and the listed static
assets. This iframe-backed adapter intentionally preserves the current
tested UI while the main-site source is unavailable; it is not a claim that
the website's 961-line UI controller has been rewritten in native Vue.

## Linux server

1. Install Provider A v0.4.0 (or a verified compatible patch) separately.
   Its account library, encrypted key and conversations must live in its own
   private persistent volume. The website never receives those files.
2. Manually authorize dedicated IMA accounts and the target knowledge base.
   Use Provider A's documented remote CLI scan workflow from a maintenance
   computer if the server has no desktop. Do not copy Air cookies, refresh
   tokens, account database or encryption key. Reusing the same IMA accounts
   on two hosts may invalidate sessions, so use separate accounts where
   possible.
3. Create a private website `.env.local` with distinct ordinary and internal
   service tokens, the knowledge-scope digest and an independent cookie
   secret. Keep it outside Git with mode 0600. `/admin` is not used by the
   website and must not be reverse-proxied.
4. Follow [the bridge-network Docker rehearsal](./DOCKER_REHEARSAL.md) first.
   `compose.linux.yaml` now runs Provider A, the website and Nginx on a private
   container network, with independent named volumes; it does not require
   host networking. The website image initializes its volume for UID 1000.
   Replace synthetic configuration with server-specific private settings only
   when real-account deployment is explicitly scheduled. Never use the lab
   generator to overwrite an existing installation. This replaces the older
   `EXPLORER_QA_CONFIG` / `EXPLORER_QA_RUNTIME` host-network recipe.
5. Have the host reverse proxy publish only the AI QA route's assets and
   `/qa-app/` to `127.0.0.1:4317` with the prefix stripped. Use
   [nginx-qa-snippet.conf](./nginx-qa-snippet.conf) as a starting point.
   Preserve SSE streaming, forward cookies,
   disable response buffering and caching, and set a read timeout above 190s.
   Exclude `/admin` and all Provider A `/internal/` paths. Keep HTTPS at the
   edge; add the main site's user identity integration before treating
   anonymous histories as cross-device user accounts.
6. Run `npm run check:integration` (read-only, no IMA question), then one
   explicit first question and follow-up with non-private content. Confirm
   source evidence, one successful terminal event and history restoration.

Back up the website runtime and private config separately from Provider A's
encrypted volume. On rollback, stop the BFF, restore only its versioned code
without replacing current runtime data, then restart. Test incompatible schema
recovery separately into fresh volumes. Never use a website rollback
to overwrite Provider A account data. A 24/7 production promise requires a
server with monitoring, backups, patching and independent real-question
acceptance; this Air-backed preview does not provide that guarantee.
