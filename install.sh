#!/bin/sh
# Selection must happen before looking for or installing a software runtime.
set -eu
# Clear Node execution overrides before any runtime probe or helper dispatch.
unset NODE_OPTIONS NODE_PATH NODE_TLS_REJECT_UNAUTHORIZED
umask 077
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
block() { printf '{"stage":"blocked","code":"%s","next":"%s"}\n' "$1" "$2" >&2; exit 1; }
mode= runtime= action=init project=explorer-shared gateway= token_file= image= port=4417
while [ "$#" -gt 0 ]; do
  [ "$#" -ge 2 ] || { echo 'Expected option and value; see docs/SHARED_INSTALLATION.md' >&2; exit 1; }
  case "$1" in
    --mode) mode=$2;; --runtime) runtime=$2;; --action) action=$2;;
    --project) project=$2;; --gateway-url) gateway=$2;; --token-file) token_file=$2;;
    --image) image=$2;; --web-port) port=$2;;
    *) echo 'Unknown option; token values are never accepted as arguments.' >&2; exit 1;;
  esac
  shift 2
done
if [ -z "$mode" ]; then
  [ -t 0 ] || block mode_required 'Select --mode online|shared|independent; no software installed.'
  printf '1) Online (no installation)\n2) Shared (invitation required)\n3) Independent (own Provider/accounts)\nChoice: '
  read -r choice
  case "$choice" in 1) mode=online;; 2) mode=shared;; 3) mode=independent;; *) echo 'No valid choice; stopped.' >&2; exit 1;; esac
fi
case "$mode" in
  online) printf '%s\n' 'https://explorer-ai-qa-demo.vercel.app/'; exit 0;;
  independent)
    echo 'Independent selected. Read docs/AGENT_DEPLOYMENT.md; then explicitly run onboard.sh doctor/init. No software installed.'
    exit 0;;
  shared) :;;
  *) echo 'Invalid mode; no software installed.' >&2; exit 1;;
esac
case "$runtime" in node|docker) :;; *) block runtime_required 'Shared requires --runtime node|docker.';; esac
case "$action" in preflight|init|start|readiness) :;; *) block invalid_action 'Use --action preflight|init|start|readiness.';; esac
os=$(uname -s); arch=$(uname -m)
case "$os/$arch" in Darwin/arm64|Darwin/x86_64|Linux/aarch64|Linux/arm64|Linux/x86_64) :;;
  *) block unsupported_platform 'Use supported macOS/Linux x64 or arm64, or install.ps1 on Windows.';; esac
if [ "$action" = init ]; then
  for path in .docker-lab .env.local runtime .maintenance/shared; do
    [ ! -e "$ROOT/$path" ] && [ ! -L "$ROOT/$path" ] || { echo 'Existing installation protected; use its recorded maintenance flow.' >&2; exit 1; }
  done
fi
if [ "$runtime" = node ]; then
  command -v node >/dev/null 2>&1 || block node_missing 'Obtain consent before official Node 22 installation: https://nodejs.org/en/download'
  node -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)' || block node_version 'Node 20+ required; request consent for Node 22.'
else
  command -v docker >/dev/null 2>&1 || block docker_missing 'Obtain consent for official installation: https://docs.docker.com/get-started/get-docker/'
  docker info >/dev/null 2>&1 || block docker_daemon_unavailable 'Docker daemon stopped or inaccessible. Ask user to start Docker/check permissions; no automatic system changes.'
  engine=$(docker info --format '{{.OSType}}/{{.Architecture}}') || block docker_engine_unavailable 'Review Docker engine access without changing context.'
  case "$engine" in linux/x86_64|linux/amd64|linux/aarch64|linux/arm64) :;; *) block docker_platform_unsupported 'Use an approved Linux-container x64/arm64 engine; do not switch automatically.';; esac
  docker compose version >/dev/null 2>&1 || block docker_compose_missing 'Docker Compose plugin missing. Obtain consent: https://docs.docker.com/compose/install/'
  version=$(docker compose version --short) || block docker_compose_missing 'Check the official Compose plugin.'
  version=${version#v}; major=${version%%.*}; rest=${version#*.}; minor=${rest%%.*}
  case "$major:$minor" in *[!0-9:]*|:*) block docker_compose_version 'Compose 2.30+ required for literal site tokens.';; esac
  [ "$major" -gt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -ge 30 ]; } || block docker_compose_version 'Obtain consent to update Compose to 2.30+ for literal site tokens.'
fi
if [ "$action" = preflight ] || [ "$action" = init ]; then
  command -v tailscale >/dev/null 2>&1 || command -v tailscale.exe >/dev/null 2>&1 || [ -d /Applications/Tailscale.app ] || block tailscale_missing 'Ask operator to approve and configure private Tailscale access; do not install or open ports automatically.'
  if command -v tailscale >/dev/null 2>&1; then
    tailscale status >/dev/null 2>&1 || block tailscale_configuration_unavailable 'Ask user/operator to finish approved Tailscale login and network configuration; no automatic changes.'
  elif command -v tailscale.exe >/dev/null 2>&1; then
    tailscale.exe status >/dev/null 2>&1 || block tailscale_configuration_unavailable 'Ask user/operator to finish approved Windows Tailscale configuration.'
  else
    block tailscale_status_unverified 'Tailscale app found but CLI status unavailable. Ask operator to provide the approved CLI/status verification path.'
  fi
fi
if [ "$action" = preflight ]; then
  for path in .docker-lab .env.local runtime .maintenance/shared; do
    [ ! -e "$ROOT/$path" ] && [ ! -L "$ROOT/$path" ] || block existing_installation_present 'Configuration detected without reading it. Use its recorded recovery flow; do not reinitialize.'
  done
  [ -n "$gateway" ] && [ -f "$token_file" ] && [ ! -L "$token_file" ] || block shared_inputs_missing 'Securely supply the approved origin and private token file; preflight does not read token contents.'
  printf '{"stage":"preflight_ready","runtime":"%s","os":"%s","arch":"%s","next":"Review invitation and network access, then run init; no secret read or connectivity proven."}\n' "$runtime" "$os" "$arch"
  exit 0
fi
if [ "$runtime" = node ]; then
  if [ "$action" = init ]; then
    node "$ROOT/deploy/shared-install.mjs" --runtime node --action validate-input --project "$project" --gateway-url "$gateway" --token-file "$token_file" --web-port "$port"
  fi
  if [ "$action" != readiness ]; then node "$ROOT/deploy/check-shared-capability.mjs" "$ROOT"; fi
  exec node "$ROOT/deploy/shared-install.mjs" --runtime node --action "$action" --project "$project" --gateway-url "$gateway" --token-file "$token_file" --web-port "$port"
fi
if [ "$action" = readiness ]; then
  exec docker run --rm --read-only --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$ROOT,dst=/workspace,readonly" -w /workspace \
    node:22-bookworm-slim node deploy/shared-install.mjs --runtime docker --action readiness
fi
if [ "$action" = init ]; then
  case "$project" in ''|*[!a-z0-9_-]*|[-_]*) echo 'Invalid project.' >&2; exit 1;; esac
  [ "${#project}" -le 49 ] || exit 1
  # Check both labeled orphan resources and unlabeled names before pulling anything.
  label="label=com.docker.compose.project=$project"
  containers=$(docker ps -aq --filter "$label")
  labeled_volumes=$(docker volume ls -q --filter "$label")
  labeled_networks=$(docker network ls -q --filter "$label")
  [ -z "$containers$labeled_volumes$labeled_networks" ] || { echo 'Existing Compose project protected.' >&2; exit 1; }
  volumes=$(docker volume ls --format '{{.Name}}')
  networks=$(docker network ls --format '{{.Name}}')
  for name in ${project}_provider-state ${project}_explorer-state; do
    if printf '%s\n' "$volumes" | grep -Fx "$name" >/dev/null; then echo 'Existing volume protected.' >&2; exit 1; fi
  done
  if printf '%s\n' "$networks" | grep -Fx "${project}_backend" >/dev/null; then echo 'Existing network protected.' >&2; exit 1; fi
  case "$token_file" in /*) :;; *) echo 'Use an absolute private token-file path.' >&2; exit 1;; esac
  [ -f "$token_file" ] && [ ! -L "$token_file" ] || { echo 'Private token file required.' >&2; exit 1; }
  input_dir=$(CDPATH= cd -- "${token_file%/*}" && pwd -P)
  case "$input_dir/" in "$ROOT/"*) block token_file_inside_source 'Move the private token outside the source/build context using a secure workflow.';; esac
  docker run --rm --network none --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$ROOT,dst=/workspace,readonly" \
    --mount "type=bind,src=$token_file,dst=/run/site-token,readonly" \
    -w /workspace node:22-bookworm-slim node deploy/shared-install.mjs \
    --runtime docker --action validate-input --project "$project" --gateway-url "$gateway" \
    --token-file /run/site-token --web-port "$port" --image "$image"
  if [ -z "$image" ]; then
    # Candidate shared support exists in the reviewed checkout, not the v0.2.1 image.
    image=$(docker build --quiet -f "$ROOT/Dockerfile" "$ROOT")
  fi
  # Inspect and pin the actual local image; a digest string alone is not feature evidence.
  if ! docker image inspect "$image" >/dev/null 2>&1; then docker pull "$image" >/dev/null; fi
  image=$(docker image inspect --format '{{.Id}}' "$image")
  docker run --rm --network none --read-only --entrypoint node \
    --mount "type=bind,src=$ROOT/deploy/check-shared-capability.mjs,dst=/tmp/check-shared-capability.mjs,readonly" \
    "$image" /tmp/check-shared-capability.mjs /app
  # No Docker socket, credentials environment, or network is exposed to the generator.
  docker run --rm --network none --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$ROOT,dst=/workspace" \
    --mount "type=bind,src=$token_file,dst=/run/site-token,readonly" \
    -w /workspace node:22-bookworm-slim node deploy/shared-install.mjs \
    --runtime docker --action init --project "$project" --gateway-url "$gateway" \
    --token-file /run/site-token --image "$image" --web-port "$port"
else
  # Read/validate the lock in an isolated Node container; only public invocation data exits.
  invocation=$(docker run --rm --network none --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$ROOT,dst=/workspace,readonly" -w /workspace \
    node:22-bookworm-slim node deploy/shared-install.mjs --runtime docker --action compose-lock)
  set -- $invocation
  [ "$#" = 3 ] || { echo 'Invalid shared lock.' >&2; exit 1; }
  # Export validated values over any inherited interpolation variables; disable .env loading.
  COMPOSE_DISABLE_ENV_FILE=1 COMPOSE_FILE= COMPOSE_PROFILES= \
    SHARED_PROJECT=$1 SHARED_IMAGE=$2 SHARED_PORT=$3 \
    docker compose -p "$1" --env-file /dev/null -f "$ROOT/compose.shared.yaml" \
    up -d --no-build --no-recreate --wait --wait-timeout 180
fi
