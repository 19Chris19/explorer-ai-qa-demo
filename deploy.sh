#!/bin/sh
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

compose() {
  test -f .docker-lab/release.env || { echo 'Initialize a new installation first; existing legacy installations use their recorded procedure.' >&2; exit 1; }
  docker compose --env-file .docker-lab/release.env -f compose.linux.yaml "$@"
}

command=${1:-help}
if [ "$#" -gt 0 ]; then shift; fi
case "$command" in
  init)
    provider=${PROVIDER_IMAGE:-ghcr.io/19chris19/ima-qa-web-agent:v0.4.2}
    website=${EXPLORER_IMAGE:-ghcr.io/19chris19/explorer-ai-qa-demo:v0.2.1}
    echo 'Advanced numeric-ID initialization does not prepare QR tooling. New installations should use onboard.sh/onboard.ps1.' >&2
    project=zhitianxia-qa
    next_project=0
    for argument in "$@"; do
      if [ "$next_project" = 1 ]; then project=$argument; next_project=0; fi
      if [ "$argument" = --project ]; then next_project=1; fi
      case "$argument" in --project=*) project=${argument#--project=} ;; esac
    done
    test -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" || {
      echo 'Compose project already exists; initialize a different project or use its reviewed upgrade procedure.' >&2; exit 1;
    }
    for file in provider.env explorer.env deployment.json release.env; do
      test ! -e ".docker-lab/$file" || { echo 'Existing installation protected; initialization refused.' >&2; exit 1; }
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
