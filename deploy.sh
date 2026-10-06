#!/bin/sh
set -eu
umask 077
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
. "$ROOT/deploy/bundle.sh"

compose() (
  test -f .docker-lab/release.env || { echo 'Initialize a new installation first; existing legacy installations use their recorded procedure.' >&2; exit 1; }
  # Validate data without sourcing it. This path deliberately needs no host Node.
  project=$(awk -F= '
    function hex(value, size) { return length(value) == size && value ~ /^[a-f0-9]+$/ }
    function image(value) {
      sub(/^ghcr[.]io\/19chris19\/[a-z0-9-]+@/, "", value)
      return substr(value, 1, 7) == "sha256:" && hex(substr(value, 8), 64)
    }
    NF != 2 || seen[$1]++ { bad=1 }
    $1 == "COMPOSE_PROJECT_NAME" { project=$2; if ($2 !~ /^[a-z0-9][a-z0-9_-]*$/ || length($2)>49) bad=1; next }
    $1 == "PROVIDER_IMAGE" || $1 == "EXPLORER_IMAGE" { if (!image($2)) bad=1; next }
    $1 == "EXPLORER_REVISION" { if (!hex($2, 40)) bad=1; next }
    $1 == "WEB_HOST_PORT" || $1 == "PROVIDER_HOST_PORT" { ports[$1]=$2; if ($2 !~ /^[1-9][0-9]*$/ || $2>65535) bad=1; next }
    { bad=1 }
    END {
      if (bad || NR!=6 || !seen["COMPOSE_PROJECT_NAME"] || !seen["PROVIDER_IMAGE"] || !seen["EXPLORER_IMAGE"] || !seen["EXPLORER_REVISION"] || !seen["WEB_HOST_PORT"] || !seen["PROVIDER_HOST_PORT"] || ports["WEB_HOST_PORT"]==ports["PROVIDER_HOST_PORT"]) exit 1
      print project
    }' .docker-lab/release.env) || { echo 'invalid_release_lock' >&2; exit 1; }
  # Retain Docker transport/auth settings, but never ambient Compose overrides.
  for key in $(env | sed -n 's/^\(COMPOSE_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$key"; done
  unset PROVIDER_IMAGE EXPLORER_IMAGE EXPLORER_REVISION WEB_HOST_PORT PROVIDER_HOST_PORT DEMO_ASSET_PREFIX
  docker compose -p "$project" --env-file .docker-lab/release.env -f compose.linux.yaml "$@"
)

command=${1:-help}
if [ "$#" -gt 0 ]; then shift; fi
case "$command" in
  init)
    if [ "$BUNDLE_STATUS" = candidate ] && { [ -z "${PROVIDER_IMAGE:-}" ] || [ -z "${EXPLORER_IMAGE:-}" ]; }; then
      echo 'Unpublished candidate: explicit reviewed image pair required.' >&2; exit 1
    fi
    provider=${PROVIDER_IMAGE:-ghcr.io/19chris19/ima-qa-web-agent:$PROVIDER_TAG}
    website=${EXPLORER_IMAGE:-ghcr.io/19chris19/explorer-ai-qa-demo:v$WEBSITE_VERSION}
    echo 'Advanced numeric-ID initialization does not prepare QR tooling. New installations should use onboard.sh/onboard.ps1.' >&2
    project=zhitianxia-qa
    next_project=0
    for argument in "$@"; do
      if [ "$next_project" = 1 ]; then project=$argument; next_project=0; fi
      if [ "$argument" = --project ]; then next_project=1; fi
      case "$argument" in --project=*) project=${argument#--project=} ;; esac
    done
    printf '%s\n' "$project" | LC_ALL=C grep -Eq '^[a-z0-9][a-z0-9_-]{0,48}$' || { echo 'invalid_compose_project' >&2; exit 1; }
    for file in provider.env explorer.env deployment.json release.env; do
      test ! -e ".docker-lab/$file" || { echo 'Existing installation protected; initialization refused.' >&2; exit 1; }
    done
    resources=$(docker ps -aq --filter "label=com.docker.compose.project=$project") || exit 1
    test -z "$resources" || { echo 'existing_compose_project_protected' >&2; exit 1; }
    for kind in volume network; do
      resources=$(docker "$kind" ls -q --filter "label=com.docker.compose.project=$project") || exit 1
      test -z "$resources" || { echo 'existing_compose_project_protected' >&2; exit 1; }
      resources=$(docker "$kind" ls --format '{{.Name}}') || exit 1
      collision=$(printf '%s\n' "$resources" | awk -v project="$project" -v kind="$kind" '
        kind == "volume" && ($0 == project "_provider-state" || $0 == project "_explorer-state") { print "collision" }
        kind == "network" && $0 == project "_backend" { print "collision" }')
      test -z "$collision" || { echo 'existing_compose_project_protected' >&2; exit 1; }
    done
    mkdir -p .docker-lab
    docker image inspect "$provider" >/dev/null 2>&1 || docker pull "$provider"
    docker image inspect "$website" >/dev/null 2>&1 || docker pull "$website"
    docker image inspect "$provider" "$website" | docker run --rm -i \
      --user "$(id -u):$(id -g)" --network none \
      -v "$PWD/.docker-lab:/workspace/.docker-lab" -w /workspace \
      "$website" node /app/deploy/release-config.mjs init "$@"
    ;;
  up)
    compose up -d --no-build --no-recreate --pull never --wait --wait-timeout 180
    compose exec -T explorer-qa node deploy/release-config.mjs check
    ;;
  check) compose exec -T explorer-qa node deploy/release-config.mjs check ;;
  stop) compose stop ;;
  backup)
    compose exec -T explorer-qa node deploy/release-config.mjs idle
    directory=".docker-lab/backups/$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$directory"
    cp .docker-lab/release.env .docker-lab/deployment.json .docker-lab/explorer.env "$directory/"
    compose stop gateway
    trap 'compose start gateway >/dev/null 2>&1 || true' EXIT HUP INT TERM
    compose exec -T explorer-qa node deploy/release-config.mjs idle
    compose stop explorer-qa
    trap 'compose start explorer-qa gateway >/dev/null 2>&1 || true' EXIT HUP INT TERM
    compose run --rm --no-deps --entrypoint tar explorer-qa -C /var/lib/explorer-qa -cf - . > "$directory/website-runtime.tar"
    echo 'Private website backup created; Provider account volume not modified.'
    ;;
  upgrade)
    image=${1:-}
    case "$image" in
      ghcr.io/19chris19/explorer-ai-qa-demo@sha256:*) ;;
      *) echo 'Upgrade requires the reviewed website image digest, not a floating tag.' >&2; exit 1 ;;
    esac
    digest=${image##*@sha256:}
    test "${#digest}" -eq 64 || exit 1
    case "$digest" in *[!a-f0-9]*) exit 1 ;; esac
    docker pull "$image"
    sh "$0" backup
    revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
    test "${#revision}" -eq 40 || exit 1
    case "$revision" in *[!a-f0-9]*) exit 1 ;; esac
    cp .docker-lab/release.env .docker-lab/release.previous.env
    compose stop gateway
    trap 'compose start gateway >/dev/null 2>&1 || true' EXIT HUP INT TERM
    compose exec -T explorer-qa node deploy/release-config.mjs idle
    sed -e "s|^EXPLORER_IMAGE=.*|EXPLORER_IMAGE=$image|" -e "s|^EXPLORER_REVISION=.*|EXPLORER_REVISION=$revision|" \
      .docker-lab/release.previous.env > .docker-lab/release.env
    if compose up -d --no-deps --no-build --wait --wait-timeout 180 explorer-qa && \
       compose exec -T explorer-qa node deploy/release-config.mjs check; then
      compose up -d --no-deps --force-recreate gateway
    else
      cp .docker-lab/release.previous.env .docker-lab/release.env
      compose up -d --no-deps --no-build --wait --wait-timeout 180 explorer-qa
      compose up -d --no-deps --force-recreate gateway
      echo 'New code failed acceptance; previous code restored against CURRENT data.' >&2
      exit 1
    fi
    ;;
  rollback)
    test -f .docker-lab/release.previous.env || { echo 'No reviewed previous code record.' >&2; exit 1; }
    compose stop gateway
    trap 'compose start gateway >/dev/null 2>&1 || true' EXIT HUP INT TERM
    compose exec -T explorer-qa node deploy/release-config.mjs idle
    cp .docker-lab/release.previous.env .docker-lab/release.env
    compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 explorer-qa
    compose exec -T explorer-qa node deploy/release-config.mjs check
    compose up -d --no-deps --force-recreate gateway
    ;;
  *) echo 'Usage: sh deploy.sh init --kb NUMERIC_ID [--project NAME --web-port PORT --provider-port PORT]';
     echo 'Then: sh deploy.sh up | check | backup | stop | upgrade REVIEWED_IMAGE_DIGEST | rollback' ;;
esac
