# Touch references and mobile composer

Adjacent web references previously enlarged their hit areas with absolutely
positioned 44px pseudo-elements. Those invisible areas overlapped: tapping the
visible `1` could activate `2`. The reference map itself was correct.

The shared Provider/website component now reserves at least 44 × 44 CSS pixels
for each interactive reference on coarse-pointer devices. Small blue numbers
remain inside these nonoverlapping targets, which wrap naturally. Green
knowledge references remain static, with no preview or link. Desktop markers
remain compact. A first touch opens only that reference's bottom sheet; the
source card inside it opens the website.

The mobile conversation composer now has at least 32 CSS pixels of bottom
spacing, or 8 pixels above `env(safe-area-inset-bottom)` if that requires more
room. This avoids duplicating a large home-indicator inset. A mobile-only gradient
uses the page theme color to mask answer text below the floating composer.
Its ResizeObserver includes
this spacing in the chat's bottom clearance, so the last answer line can still
scroll above the input. The desktop and empty welcome-page placement stay the
same. The viewport meta tag enables `viewport-fit=cover` and requests
`interactive-widget=resizes-content` where supported.

## Regression checks

```sh
npm test
npm run test:mobile-ui
npm run build
npm run check:performance
npm run check:release
```

The native browser check requires Node 22 and Chromium (`google-chrome`, or
`CHROME_PATH`). CI runs it separately from unit tests. Its isolated loopback
fixture uses the real HTML/CSS/Markdown renderer without importing the API
client, loading credentials, connecting to Provider or fetching external pages.

`test-support/mobile-ui-checks.mjs` is shared with Provider and can also run on
an existing Ego Lite Page. Native CDP touches cover every visible label and
target edge, adjacent/wrapped/table references, exact key-to-source association,
multiple destinations, static knowledge references and draft retention. It
also checks desktop hover/native link behavior and mobile composer/end-of-answer
clearance, including a short layout viewport, landscape and a tablet.

Chromium emulation is not physical-device acceptance. A short layout viewport
does not emulate iOS keyboard panning; real safe-area insets, browser chrome and
software keyboards still need iOS Safari/Android Chrome acceptance before
release. None of these commands updates or restarts the running service.
