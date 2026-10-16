# README asset provenance

Updated 2026-10-16 for website v0.4.1 / Provider v0.6.1.
Frontend source revision: `478e46d3d081cced90cedf1f2f1e3d392d8525a8`.

## Sources

- `hero-aperture.gif`: approved single-play logo-to-interface transition, captured
  deterministically in Ego from `source/aperture-journey.template.html`. The real
  stacked logo is unchanged; six procedural blades animate its aperture motif.
  The final frame crops the welcome screenshot to the hero and composer only.
- `hero-aperture-static.png`: the same export's opening frame, provided as an
  explicit static alternative. The GIF stops on its final interface frame.

- `hero.png`: deterministic HTML composition of the existing, unmodified real
  Zhitianxia logo `public/site/logo.png`; source is `source/hero.html`.
- Logo SHA-256: `39993deeecabd8a0e0f568a7ec02f13b4a7dbdbd83e66d4f24a170afa3217102`.
- `workflow.svg`: editable diagram of the default independent installation.
- `screenshots/welcome-desktop.png` and `screenshots/answer-desktop.png`: current
  frontend with **Synthetic HTTP** fixtures in `source/synthetic-http.json`.
- Fixture answer, source link, capacity and elapsed time are fictional. These
  images are UI demonstrations, not live account status or IMA acceptance.

No credentials, real conversations or browser profile are included. No generated
replacement logo, ImageGen artwork or Gemini design approval is claimed.
The installed README skill matches upstream `d6562a5`; Gemini direction failed
with HTTP 503 and provided no recommendation.

## Reproduce

1. Run `npm ci` and `npm run build` in a clean fixed checkout.
2. Run `node assets/readme/source/preview.mjs 4982`.
3. Open `http://readme.localhost:4982/` in a disposable browser at 1366 x 900 CSS pixels
   with empty local/session storage for the welcome view. Select the fictional
   recent conversation to capture the answer, after welcome-exit animation ends.
   The `.localhost` name resolves to loopback and keeps development-only admin
   links hidden through the application's normal hostname check. Never use real history here.
4. Capture `/assets/readme/source/hero.html` at 1200 x 350 for `hero.png`.
5. Check `/readme-preview` at 900 and 360 CSS pixels in light and dark themes.
   This is a local trusted-content preview, not a deployable public service.
6. Stop the server afterwards. It only serves local files and synthetic GET/HEAD
   responses; writes and unknown API routes are refused, and no upstream is called.

PNG and GIF images are budgeted below 1.5 MB each. Preserve adjacent Markdown for mobile
readability and accessibility even when diagrams or screenshots change.

## Reproduce the animated hero

This is a README asset, not a website loading animation. It does not call APIs.
GitHub does not reliably play scripted SVG; the published asset is a GIF.

1. Build a self-contained preview outside the checkout:
   `node assets/readme/source/build-aperture.mjs /tmp/ztx-hero`.
2. In the authorized Ego task space, open `/tmp/ztx-hero/aperture-journey.html`.
   Use that existing space for all subsequent capture commands.
3. Execute `source/capture-aperture.mjs` through `ego-browser nodejs`, setting
   `globalThis.readmeCapture = { spaceId: YOUR_SPACE_ID, directory: '/tmp/ztx-hero' }`
   before evaluating the script. The script samples 144 frames at 24 FPS, 900 x 593,
   with a settled final hold. It only reads the local preview canvas.
4. Run `sh assets/readme/source/encode-aperture.sh /tmp/ztx-hero assets/readme`.
   This requires FFmpeg/ffprobe and sets no repeat loop. No runtime dependency is added.
5. Inspect the encoded GIF, not just the HTML: opening, aperture closure, reveal,
   final hold, desktop/mobile readability and file size. Keep the static link.

The HTML preview honors reduced motion. The GIF itself cannot react to that OS
preference; it plays once and has an adjacent static alternative.
