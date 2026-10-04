# FIX-20261004-EXPLORER-EMBED-OVERLAYS

## Goal

Host More actions must open an actual visible menu when internal navigation is
hidden. Move the menu outside the hidden header, retain standalone positioning
and support the host's focus restoration. Let the host size its content region
without an arbitrary 520px iframe minimum. Depends on the v0.2 preview adapter.

## Verification and rollback

Add a regression asserting the overlay is not inside either hidden nav region.
Synthetic same-origin browser checks cover ready, preferences, More, history,
new conversation, close focus signal and root/subpath assets. No IMA access.
Revert this fix independently; do not restore data or modify Provider A.
