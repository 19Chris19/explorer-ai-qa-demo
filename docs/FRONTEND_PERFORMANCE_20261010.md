# Frontend performance assessment, 2026-10-10

## Scope and conclusion

Website v0.3.0 preparation, compared with origin/main f933a2d (v0.3.0-rc.1
feature set). Provider promotion starts at 2984a59. The chat frontend is small;
the measured bottleneck is not a large framework download. Scoped improvements
are useful before stable publication; a frontend rewrite is not justified.
This is a reproducible resource audit and browser lab exercise, not a Lighthouse
score, user-concurrency capacity test or production availability certificate.

No real IMA question, private account/history access or running-service restart
was used. The browser fixture serves synthetic tasks only, never IMA. Air is
shared with active applications, so these timings are not controlled benchmarks.

## Resource budget

Run Node 22 `npm ci`, `npm run build`, `npm run check:performance`.
CI runs the same budget check. Count all public QA assets, including optional
icons, Markdown parser and sanitizer; exclude the separate admin surface.

| Measurement | Candidate | Gate |
|---|---:|---:|
| Uncompressed assets | 343,867 bytes (335.8 KiB) | 600 KiB |
| gzip estimate | 148,204 bytes (144.7 KiB) | 200 KiB |
| JavaScript uncompressed | 203,848 bytes (199.1 KiB) | 300 KiB |
| Largest file, app.js | 71,842 bytes | 100 KiB |
| Logo PNG | 44,779 bytes | Included above |

The gzip total is an estimate, not bytes guaranteed on every proxy route; the BFF
keeps HTML no-store and bypasses static compression for HTML. The isolated browser
fixture also compresses its fixed HTML, unlike the dynamic BFF; its load timings
are therefore not an exact production-path benchmark. One browser
navigation recorded 143,353 encoded resource bytes (28 entries, including small
API responses). Resource Timing totals exclude navigation/HTTP headers and are
not a complete wire-traffic measurement. Node/Docker dependencies and image size
are not browser download size. Browser libraries remain Marked and DOMPurify;
jsdom is test-only. No framework, font or animation dependency was added.

For comparison, Provider's built-in QA dependency set is 198,132 raw bytes and
54,023 estimated gzip bytes (index, styles, parser, sanitizer and QA scripts;
admin/embed alternative excluded). This promotion does not change that frontend.
Do not assume gzip is enabled on Provider just because the estimate is small.

## Changes made

1. Preserve every task event/replay cursor but paint the latest accumulated view
   once per animation frame. Flush terminal/failure updates explicitly, including
   background tabs; cancel detached callbacks. No text or source event is dropped.
2. Refresh whole-second elapsed status once per second instead of four times;
   skip unchanged details text. Final status still updates immediately.
3. Cache the finite allowlisted static files in server memory, compress eligible
   files once, and support variant ETags, 304 and HEAD. HTML, API and SSE stay
   no-store; streaming is not compressed/buffered by this helper. Fixed deployment
   artifacts are immutable during a process lifetime; restart on code upgrade.
4. Fix clean-source Node vendor paths using exactly two installed dependency
   files if bundled files are absent. This is not an arbitrary filesystem route.

Vercel/gateway policy still strips cache validators and uses no-store. Therefore
local ETag savings are not claimed for that public route. Frontend batching works
there after the website runtime is upgraded; publication alone does not do that.

## Browser lab observations

Ego Chromium on Air, isolated synthetic fixture. Mobile experiment requested
390 x 844, 4x CPU slowdown, 150 ms latency, 200,000 bytes/s download and 93,750
bytes/s upload. These are emulation settings, not a physical phone. Later tooling
reported a 195 x 422 layout, so exact mobile visual/screenshot acceptance is not
claimed from this experiment. No real-device keyboard test was performed.

| Observed measurement | Result |
|---|---:|
| Candidate largest contentful paint (LCP) | 976 ms |
| Candidate cumulative layout shift (CLS) | 0.000983 |
| Candidate HTML TTFB | 208.9 ms |
| Candidate DOMContentLoaded / load | 1,851.8 / 3,546.1 ms |
| Candidate observed JS heap | 2,558,408 bytes |
| Candidate initial element count | 166 |
| Observed long tasks | 107, 127, 107, 152 ms |
| Three-second foreground idle task time | 24.35 ms; no layouts |

Initial desktop baseline: LCP 884 ms, CLS 0.000970, TTFB 51 ms, load 1,158 ms,
166 elements. These desktop timings cannot be compared directly to the throttled
mobile run. The uncompressed mobile baseline recorded 332,090 encoded resource
bytes, but its LCP observer was installed late and host contention was substantial;
do not derive a percentage speedup from those timings. A later candidate resource
sample was 143,353 bytes; the inventory is the repeatable gate, not timing ratios.

Current good Core Web Vitals thresholds are LCP <=2.5 s, INP <=200 ms and CLS
<=0.1 at the 75th percentile of real visits. One lab sample cannot establish
field compliance. INP was not reliably measured. See [web.dev definitions](https://web.dev/articles/vitals)
and [thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds).
[Lighthouse](https://developer.chrome.com/docs/lighthouse/overview) was not run;
no fabricated performance/accessibility/SEO score is provided.

## Rendering and regression evidence

- Unit burst of 100 viewer updates produces one render of the exact final view;
  terminal flush and dispose are separately tested. All replay events remain.
- Single warmed browser render: 3,760 characters / 80 small tables, 67.1 ms,
  all 80 tables present. This remains a main-thread long task, not a 60 fps proof.
- Small five-update lab burst coalesced to one render with identical canonical
  HTML and five tables. Cold/direct vs warm/batched timings are not a fair
  speedup benchmark and are deliberately not advertised.
- An old-style 40-reparse stress trial and an async instrumentation trial hit
  browser-tool timeouts. Later isolated parser calls completed; screenshot and
  mouse CDP commands also timed out. Do not call this fresh visual acceptance or
  infer that parser, network and host delays have been conclusively separated.
- Final local full website suite: 284 pass, 2 optional skip, 0 fail. Initial full
  run exposed the clean-source vendor path failure; it was fixed before this run.
- Provider local full suite: 822 pass, 6 optional skip, 0 fail. Clean installs
  in both repositories reported zero npm audit findings. Build, packaging, private
  path checks and resource budget passed; CI and native image gates are separate.

## Remaining work and operational boundary

Dense, very long answers still reparse accumulated Markdown. Existing stable
block DOM reuse and frame batching reduce work but do not solve all parse cost;
worker/incremental parsing should be evaluated with realistic long-answer traces
before introducing complexity. Task replay still scans accumulated events; it
needs a separate large-log benchmark, not an unreviewed release-time rewrite.
Real-user INP, low-end Android, public cold-cache timings and sustained concurrency
are not verified. UI animation and video-visible frame cadence need a later
controlled browser session because this session's capture/input tooling failed.

Air readiness 503s, ngrok/Vercel outages and IMA upstream latency are separate
from initial webpage weight. A stable Release does not fix those operational
conditions. No local/public runtime was cut over by this assessment.
