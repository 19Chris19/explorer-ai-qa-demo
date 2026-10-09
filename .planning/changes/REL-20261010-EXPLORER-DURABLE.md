# Durable paired website release preparation

User requests two GitHub repositories, Air services and public online preview
to receive the verified long-answer/reconnect changes through the two project
release skills. Independent installation must retain its own data/Provider.

The deployment bundle and image workflow now accept strict numbered RC tags.
Stable website bundles cannot depend on prerelease Provider tags. A manifest
declares stable/prerelease channel and exact paired image evidence; it never
claims real IMA success from image startup. Node and Shell parser tests cover
fixed pairs, executable/floating versions and invalid prerelease numbers.

Recommended gray pair: website v0.3.0-rc.1 with Provider v0.5.0-rc.1. Version
selection, image acceptance, PR CI, Vercel preview and reviewed local skill
drift are checked before traffic switching. Provider and website are distinct
release owners. This record is preparation, not proof of publication.

Preserve private configuration, signing secrets, visitor data and pending work.
Use immutable website artifacts for 4317/4318 and a fixed image for Docker;
one writer per runtime. Do not restart the bot or dormant legacy Provider.
The public proxy merge is a release action. Rollback is compatible code only,
after draining; never overwrite new histories with a backup.

Review also found the legacy Docker CI fixture advertises only keyed SSE, not
durable tasks. Container CI now pulls the fixed paired published Provider image
and runs its real task implementation with a synthetic client in the egress-
blocked Compose network. BFF, Nginx, observer disconnect/replay, exact history,
explicit cancellation and dispatched-task restart are exercised. No account
directory or IMA client is constructed. Website CI must wait for its Provider
tag/image prerequisite; it may not silently substitute an older image.
