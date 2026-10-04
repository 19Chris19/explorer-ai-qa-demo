#!/bin/sh
set -eu
umask 077
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE=${PROVIDER_SOURCE_DIR:-$ROOT/.maintenance/provider-v0.4.2}
if [ ! -d "$SOURCE" ]; then
  mkdir -p "$ROOT/.maintenance"
  git clone --depth 1 --branch v0.4.2 https://github.com/19Chris19/ima-qa-web-agent.git "$SOURCE"
fi
test -f "$SOURCE/onboard.sh" || { echo 'Provider v0.4.2 tooling is required; do not fabricate configuration.' >&2; exit 1; }
NODE=$(sh "$SOURCE/onboard.sh" runtime)
PROVIDER_SOURCE_DIR=$SOURCE
export PROVIDER_SOURCE_DIR
exec "$NODE" "$ROOT/deploy/onboard.mjs" "$@"
