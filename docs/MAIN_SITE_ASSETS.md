# Main-site reference, 2026-10-04

The independent demo copies only the public navigation shell. The AI header
keeps AI Q&A, Community and More; gallery filters and search are not QA controls.
The QA Hero, composer, answers and interactions are unchanged.

## Provenance

- Visible logo: https://3d.explorerglobal.cn/assets/logo3-DXzhn6YT.png,
  downloaded unchanged. Brand asset retained for the owner's private integration;
  this is not a grant to redistribute the brand to unrelated products.
- Eight existing navigation icons: SVG masks extracted from the public main-site
  computed CSS on the date above. Additional QA chat icon from
  https://github.com/Remix-Design/RemixIcon/blob/master/icons/Communication/chat-3-line.svg.
  Functional UI icons remain under Remix Icon License v1.0;
  see [license](licenses/REMIX-ICON.txt). They are not used as a brand mark.
- Main-site Latin font: DM Sans, unchanged WOFF2 from
  https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxRSW32RmYJp8I5.woff2.
  See [SIL Open Font License](licenses/DM-SANS-OFL.txt). Chinese text uses the
  system fallback, as on the main site. Only the navigation shell uses this font.

## Fidelity and boundaries

Desktop: 256px sidebar, padding 16px 16px 24px, logo width 120px, 82px header,
40px header inset, 224px by 48px items, 6px gap, 16px text, 12px corners.
The AI entry adds one row. Main-site authentication remains on the main site;
the demo does not impersonate its login or copy user state. Auth-only entries
link to the verified official routes. The login link opens the official home,
where the user can use the real login control.

At 390px, the current public site's sidebar still occupies 256px. Repeating
that on the demo would leave only 134px for QA. The demo deliberately retains
its compact mobile header, without claiming mobile pixel identity. Final native
main-site integration must use the main site's own responsive shell.

Embedded mode hides both demo navigation regions. Do not place this shell
inside the main site's shell. No public app bundles, signed gallery URLs,
authentication code, cookies or user information are included.
