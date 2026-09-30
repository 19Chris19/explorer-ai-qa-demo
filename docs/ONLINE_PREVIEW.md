# Air-backed online preview

This is a public URL to a real shared account pool, not a production hosting
or access-control service. GitHub repository privacy does not restrict URL
visitors. Air sleep, network loss, tunnel quota or a stopped process will make
the preview unavailable. No daily user quota is promised; technical controls
allow at most one in-flight public ask, eight waiting turns and ten new
submissions per visitor per minute. A determined unauthenticated visitor can
still consume IMA capacity. Do not publish the URL without accepting that risk.

## Topology

```text
browser -> Vercel Node function -> fixed HTTPS ngrok domain
        -> Air preview gateway (loopback) -> website BFF :4317
        -> Provider A :3117 -> IMA
```

Only the gateway key and ngrok address belong in Vercel environment variables.
Do not put Provider A ordinary, internal or admin tokens there. No Vercel
external rewrite directly to Air is permitted: the 190-second ask can exceed
the external proxy duration limit. The Node Function is configured for 300
seconds and streams the response body without buffering or caching.

## Private setup

1. Keep Provider A and the website BFF on the Air, with separate persisted
   directories. Run `npm run check:integration` on the Air before opening a
   tunnel. A healthy HTTP process alone is not a real answer acceptance.
2. Generate one random gateway key of at least 32 characters in a private
   secret store. Set `PREVIEW_GATEWAY_KEY` only in the local gateway's private
   launch environment. Start `node preview-gateway.mjs` on loopback port 4327.
3. Reserve a fixed HTTPS ngrok domain and tunnel only to `127.0.0.1:4327`.
   Never tunnel directly to 4317 or 3117. Verify `/admin` and `/internal/`
   return 404 through the gateway even with a valid key.
4. In the private GitHub repository's Vercel project, set Root Directory to
   `preview`. Enable Node Functions with Fluid compute. Set `PREVIEW_ORIGIN_URL`
   to the fixed HTTPS ngrok origin with trailing slash and
   `PREVIEW_ORIGIN_KEY` to the same gateway key. Use production deployment for
   one stable Vercel URL. Do not enable an external-origin rewrite.
5. Verify the first SSE chunk and exactly one `done` for one non-private test
   question and one follow-up. Check history on refresh, cancellation, and
   that unavailable Air returns 503. Record only status and timing, never
   question, answer, source, token or session ID.

## Revoke and recover

Stop the tunnel first; this immediately disables public access while local
4317/3117 remain available. Rotate the gateway key in both locations if it is
exposed. A rollback of website or Provider A must select the prior code
snapshot without overwriting persistent account or conversation state.

The preview route allowlist is intentionally narrow. `/admin`, `/admin.js`,
`/internal/` and unknown paths are never forwarded. The local admin prototype
is also disabled in the Linux container. The visitor cookie is HttpOnly,
SameSite=Lax and Secure on public preview requests.
