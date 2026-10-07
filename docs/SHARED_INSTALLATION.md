# Invited Shared Installation

## Choose Before Installing

Ask online/shared/independent using native Agent choices or three plain text
options and wait. No answer is not consent. `sh install.sh` offers a menu;
unattended input without `--mode` stops. Online means only
https://explorer-ai-qa-demo.vercel.app/ with no installation. Existing independent
onboard commands remain compatible, but new guides must obtain a choice first.

Shared requires invitation, approval, network/Tailscale access and an operator-
supplied fixed `https://host.tailnet.ts.net` origin plus a site token. No port,
path, trailing slash, query, userinfo or fragment is accepted. Confirm the intended
host with the operator, never discover it from the preview or copy Air config.
The BFF adds `/v1` and must reject redirects without forwarding secrets. The
selection/preflight/init do not contact the endpoint. Only explicit readiness does.
Shared users share capacity and outages.

The private contract is `PROVIDER_A_MODE=shared`, `PROVIDER_A_GATEWAY_URL` and
`PROVIDER_A_GATEWAY_TOKEN`. There are no raw Provider credentials/scope, admin
configuration, QR helper or account volumes. A separate random 64-character
`DEMO_COOKIE_SECRET` is generated; never derive it from a Provider token. The
BFF adapter requires at least 32 characters and rejects legacy signatures.

v0.2.1 is the released source baseline, not a shared-capable image. This candidate
includes the adapter. Docker defaults to building the current reviewed
checkout and locking its image ID. Never supply the old release digest as shared.
An explicit immutable image must contain the reviewed integrated adapter.

## Permissions and Software

Source and GHCR images are private. Obtain source and package read permissions
separately using secure GitHub/Docker login. On 401/403 stop, do not substitute
unknown images. Online requires neither. Have the user/secret manager place the
site token in an owner-only file outside the repo (0600 on POSIX); pass only its
absolute path. Never put values in CLI args, chat, screenshots, shell tracing or
Git. Tokens must be 24-512 printable nonspace ASCII characters, matching the
gateway. Recommend operator-generated base64url tokens of at least 32 characters.
Inputs are validated before building or writing config. Do not print Compose
configuration or container environments.

After choosing shared, Node needs 20+ (22 recommended). Docker needs Linux
containers and Compose 2.30+ (`format: raw`), but NO host Node. The wrapper separately
checks missing Docker, daemon access, and missing Compose. Explain the appropriate
[official Docker](https://docs.docker.com/get-started/get-docker/),
[Compose](https://docs.docker.com/compose/install/) or
[Node](https://nodejs.org/en/download) installation and obtain consent before
system changes. Ask the user to start an inaccessible daemon/check permissions;
never auto-install, change groups/socket permissions, switch context or start services.
Missing Tailscale/access is also a stop pending an approved operator setup; never
open a public Provider port or change an existing 3117 listener.

## Commands

Run from a fresh reviewed integrated checkout, after selection and access approval.
First use `--action preflight` with the chosen runtime, origin and token-file path.
This is read-only: checks OS/architecture, Node or Docker/Compose, Tailscale software
availability/status and configuration existence, without reading a private file or token.
It never builds/pulls/runs a container or changes the system. Structured stage/code/
next output separates missing runtime, stopped daemon, old Compose, missing
Tailscale, missing inputs and existing installation. Software presence is not
proof of login, an invitation, route availability or gateway readiness.

```sh
sh install.sh --mode shared --runtime node --action init \
  --gateway-url https://host.tailnet.ts.net --token-file /absolute/private/site-token
npm ci
npm run build
sh install.sh --mode shared --runtime node --action start
```

Node starts only the BFF on loopback with its shared config and no inherited
Provider/IMA/demo settings. For approved external access, separately configure
HTTPS/nginx with `deploy/docker/nginx.conf` as the allowlist. Block admin/internal
and non-website paths. Anonymous demo cookies are not production user authentication.

```sh
sh install.sh --mode shared --runtime docker --action init \
  --gateway-url https://host.tailnet.ts.net --token-file /absolute/private/site-token \
  --project my-shared-site --web-port 4417
sh install.sh --mode shared --runtime docker --action start
# Separate opt-in authenticated read-only check; never sends a question:
sh install.sh --mode shared --runtime docker --action readiness
```

After explicit mode, Docker and fresh-project checks, Docker builds current source
and uses an isolated Node 22 container to generate config. No host Node, Docker
socket, Provider source/image or browser helper is needed. The generator has no
network, runs as host UID/GID, and mounts the token read-only. Optional `--image`
accepts only a reviewed integrated image's immutable GHCR digest or local image ID.
Init only configures; start is separate, locked to project/image/port, and never
rebuilds or recreates existing containers. Explicit images are pinned to their
actual local ID and must pass an offline shared-client `/v1`/no-redirect capability
probe; original v0.2.1 images fail. This probe is not an image signature or trust
check. `compose.shared.yaml` creates only BFF
and nginx plus website state. Default URL: `http://127.0.0.1:4417/`. Verify private
ts.net reachability from Docker separately; host connectivity is not proof.

Container health fetches only the local homepage; gateway outages do not prevent
nginx starting, so drafts/errors remain usable. `readiness` separately checks the
gateway even when local Tailscale is unavailable; start does not require Tailscale
status after initialization. Preflight/init still require approved local access.
The readiness request targets the
approved gateway's capabilities with a five-second timeout and no redirects.
Unavailable auth/contract/capacity is reported without upstream content or secrets.
Node supports the same explicit action; no real question is sent.

## Windows

Use `install.ps1` for the same three choices; missing noninteractive mode stops.
Shared Node and Docker are supported through an explicitly chosen WSL2 Linux
distribution, with checkout and private token in its Linux filesystem (not `/mnt`).
This preserves POSIX private file permissions and avoids silently trusting Windows
mounted-file ACLs. Native Windows Node shared installs are not claimed supported.
No Windows host Node is needed for Docker. Obtain consent for official WSL2,
Docker Desktop WSL integration or Node-in-WSL setup; the wrapper installs none.
Tailscale may be in WSL or available via the approved Windows `tailscale.exe` path.

```powershell
.\install.ps1 -Mode shared -Runtime docker -Action preflight `
  -Distribution Ubuntu -WslRoot /home/me/explorer `
  -GatewayUrl https://host.tailnet.ts.net -TokenFile /home/me/private/site-token
# After review, repeat with -Action init, then -Action start (and explicit readiness).
```

The same `-Runtime node` uses Node in WSL2. Existing independent `onboard.ps1`
continues using pinned Provider v0.4.2 parameters; no new deployment-mode flag is
passed to an old release. WSL2/native Windows execution remains NOT RUN here.

## Recovery and Verification

Config is Git-ignored `.maintenance/shared/`. Init refuses `.docker-lab`,
`.env.local`, legacy runtime, any existing/partial shared config, labeled Compose
resources or same-name orphan volumes/networks. Query failures stop. Do not delete
config/volumes or alter records to bypass checks. Start uses only recorded runtime,
without reinitialization or token rotation. Existing independent `deploy.sh`
backup/upgrade commands are NOT shared-install commands.

Back up private config, code/image references and current website data. Upgrades
need an idle/drain window coordinated with the operator and reviewed rollback.
Keep current data; never `down -v`, overwrite current conversations with stale
backups, or restart the shared Provider. Report configuration, start, gateway
auth/contract, capacity and authorized real question/follow-up separately. HTTP 200
is not readiness. Redirects/401/403 stop, without trying other origins or tokens.

Synthetic tests only here: no live gateway, real questions, Windows native or
remote Linux deployment tested. `install.ps1` is the Windows selection/WSL2 entry;
existing independent PowerShell commands stay unchanged.
