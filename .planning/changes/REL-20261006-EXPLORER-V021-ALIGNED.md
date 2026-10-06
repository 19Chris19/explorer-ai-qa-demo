# Explorer v0.2.1 aligned release

## Goal
Provide one installation entry that prepares the private Explorer website and
the fixed public Provider A release, with separate state and credentials. Keep
Node and Docker deployment paths accurate and reproducible for users and agents.

## Baselines and boundaries
Candidate 19c199c; published baseline v0.2.0 / e99aff24.
Target Provider v0.4.2 must be published and verified before declaring this bundle
released. No copied Provider implementation, Air credentials or runtime. Existing
Air services and the robot remain outside this release operation.

## Work and acceptance
- [x] Audit installer delegation, repeat install protection and version matching.
- [x] Reconcile installation docs, compatibility and Agent instructions.
- [ ] Verify exact final pair through tests and isolated installation.
- [ ] Record platform/real-login gaps without conflating synthetic evidence.
- [ ] After Provider publication, freeze image digests and release metadata.
- [ ] Review private PR/CI, publish source/image and verify published install path.

## Verification progress
Installer fixes cef3952/f4992da verify cached Provider source identity, explicit
image versions and resumed-installation bundle identity. The public archive
exporter gap was reproduced without weakening the website parser, then repaired
in the Provider candidate. Integrated pair: Explorer f808602 / Provider 2cd17fb.
Full Explorer suite: 158 passed, zero failed/skipped, with
PROVIDER_A_TRANSFER_TEST_MODULE pointing at that public candidate. Build passed.
This is synthetic evidence, not account login or live IMA acceptance. Bundle
remains candidate until the exact Provider release and images are available.

## Rollout
No Air process, public preview, account or runtime directory changed.

## Rollback
Select the previous compatible website code/image, preserve new conversation
data, and never reinitialize an existing installation or replace account volumes.
