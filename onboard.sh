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
if [ "$BUNDLE_STATUS" = released ]; then
  origin=$(git -C "$SOURCE" remote get-url origin) &&
  head=$(git -C "$SOURCE" rev-parse HEAD) &&
  tag=$(git -C "$SOURCE" rev-parse "refs/tags/$PROVIDER_TAG^{commit}") &&
  dirty=$(git -C "$SOURCE" status --porcelain) &&
  test "$origin" = https://github.com/19Chris19/ima-qa-web-agent.git &&
  test "$head" = "$tag" && test -z "$dirty" || {
    echo 'Provider source must be a clean checkout of the fixed public tag; review the cache without deleting existing data.' >&2
    exit 1
  }
fi
test -f "$SOURCE/onboard.sh" || { echo 'Matching Provider tooling is required; do not fabricate configuration.' >&2; exit 1; }
NODE=$(sh "$SOURCE/onboard.sh" runtime)
PROVIDER_SOURCE_DIR=$SOURCE
export PROVIDER_SOURCE_DIR
exec "$NODE" "$ROOT/deploy/onboard.mjs" "$@"
