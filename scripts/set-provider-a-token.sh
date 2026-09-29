#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
provider_url=${PROVIDER_A_BASE_URL:-http://127.0.0.1:3117}
case "$provider_url" in
  http://127.0.0.1:*)
    provider_port=${provider_url##*:}
    case "$provider_port" in
      ''|*[!0-9]*) printf 'Provider A URL must end with a numeric port.\n' >&2; exit 1 ;;
    esac
    ;;
  *) printf 'Provider A URL must be a localhost HTTP address.\n' >&2; exit 1 ;;
esac
if [ ! -t 0 ]; then
  printf 'Please run this script in your own interactive Terminal.\n' >&2
  exit 1
fi
old_stty=$(stty -g)
restore() { stty "$old_stty"; }
trap restore EXIT HUP INT TERM
printf 'Paste the ordinary Provider A API token (input hidden), then press Enter: ' >&2
stty -echo
IFS= read -r qa_token
restore
trap - EXIT HUP INT TERM
printf '\n' >&2
case "$qa_token" in
  ''|*' '*|*'	'*) printf 'Empty or invalid token. No file was changed.\n' >&2; exit 1 ;;
esac
umask 077
{
  printf 'PROVIDER_A_BASE_URL=%s\n' "$provider_url"
  printf 'PROVIDER_A_API_TOKEN=%s\n' "$qa_token"
  printf 'PORT=4317\n'
} > "$root_dir/.env.local"
chmod 600 "$root_dir/.env.local"
unset qa_token
printf 'Saved to %s/.env.local (mode 0600).\n' "$root_dir" >&2
