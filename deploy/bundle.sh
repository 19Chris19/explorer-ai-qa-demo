# Read data without evaluating it as shell code. ROOT is set by the caller.
awk -F= '
  /^#/ || /^$/ { next }
  NF != 2 || $1 !~ /^(STATUS|WEBSITE_VERSION|PROVIDER_TAG)$/ || $2 !~ /^[a-z0-9.-]+$/ { bad=1 }
  { if (++seen[$1] > 1) bad=1 }
  END { exit bad }
' "$ROOT/deploy/bundle.env" || exit 1
bundle_value() {
  awk -F= -v key="$1" '
    /^#/ || /^$/ { next }
    $1 == key { count++; value=$2; if (NF != 2 || value !~ /^[a-z0-9.-]+$/) bad=1 }
    END { if (count != 1 || bad) exit 1; print value }
  ' "$ROOT/deploy/bundle.env"
}
BUNDLE_STATUS=$(bundle_value STATUS)
PROVIDER_TAG=$(bundle_value PROVIDER_TAG)
WEBSITE_VERSION=$(bundle_value WEBSITE_VERSION)
case "$BUNDLE_STATUS" in candidate|released) ;; *) exit 1 ;; esac
printf '%s\n' "$PROVIDER_TAG" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.[1-9][0-9]*)?$' || exit 1
printf '%s\n' "$WEBSITE_VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.[1-9][0-9]*)?$' || exit 1
case "$WEBSITE_VERSION:$PROVIDER_TAG" in *-rc.*:*) ;; *:*-rc.*) exit 1 ;; esac
