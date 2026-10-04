#!/bin/sh
set -eu
umask 077
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$ROOT/deploy/bundle.sh"
if [ "$BUNDLE_STATUS" = candidate ] && [ -z "${PROVIDER_SOURCE_DIR:-}" ]; then
  echo 'Unpublished candidate: set reviewed PROVIDER_SOURCE_DIR; do not fetch an unreleased tag.' >&2
  exit 1
fi
SOURCE=${PROVIDER_SOURCE_DIR:-$ROOT/.maintenance/provider-$PROVIDER_TAG}
if [ "$BUNDLE_STATUS" = candidate ] && [ ! -d "$SOURCE" ]; then
  echo 'Reviewed candidate source directory does not exist.' >&2; exit 1
fi
if [ ! -d "$SOURCE" ]; then
  mkdir -p "$ROOT/.maintenance"
  git clone --depth 1 --branch "$PROVIDER_TAG" https://github.com/19Chris19/ima-qa-web-agent.git "$SOURCE"
fi
test -f "$SOURCE/onboard.sh" || { echo 'Matching Provider tooling is required; do not fabricate configuration.' >&2; exit 1; }
NODE=$(sh "$SOURCE/onboard.sh" runtime)
PROVIDER_SOURCE_DIR=$SOURCE
export PROVIDER_SOURCE_DIR
exec "$NODE" "$ROOT/deploy/onboard.mjs" "$@"
