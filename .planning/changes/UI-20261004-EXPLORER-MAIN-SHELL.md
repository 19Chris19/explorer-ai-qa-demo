# UI-20261004-EXPLORER-MAIN-SHELL

## User goal

Reproduce the current public main-site navigation shell, not a similar-looking
replacement. Independent v0.1.0 baseline; combine with the separate host adapter
only on a preview integration branch. Keep branded QA content and controls.

## Dated reference

Read-only observation of https://3d.explorerglobal.cn/ on 2026-10-04:
256px sidebar, padding 16px 16px 24px, logo 120 x 66.664px at (68,16),
224 x 48px navigation items, 6px gap, 16px type and 12px corners.
The public main-site icon masks are the actual Remix icons. Header is 82px with
40px horizontal insets. Do not copy gallery filters, search, authentication
logic, public application bundles, signed media URLs or user information.

## Scope and acceptance

Download only the visible brand asset, font and eight navigation icon assets;
keep their source/attribution records. Add AI Q&A to the existing navigation.
Embed mode still hides both internal navigation regions. Synthetic UI tests,
same-viewport measurements and desktop/mobile screenshots precede 4318 preview.
No Provider or stable service deployment. Actual main-site source integration,
Test/production acceptance and native phone keyboard remain separate gates.

## Verification

79 application tests pass; focused shell and proxy tests also pass. At 1366x768,
measured logo (68,16), sidebar 256px, header 82px and first nav item 224x48px
match the dated reference. 390x844 has no horizontal document overflow and a
360x56px composer. All shell assets are explicitly allowed through BFF, Nginx,
preview gateway and Vercel; unknown assets remain blocked. No IMA request made.
The current public mobile shell is not reproduced literally (see asset notes).
The upstream OFL notice had CRLF and trailing whitespace; normalize formatting
only, retaining the notice text, and re-run the staged release scan.

## Rollback

Revert this shell change without reverting the independent host adapter or
replacing runtime state. Do not roll it into v0.1.0 or retag that release.
