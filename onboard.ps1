$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bundle = @{}
foreach ($line in Get-Content (Join-Path $root 'deploy/bundle.env')) {
  if ($line -eq '' -or $line.StartsWith('#')) { continue }
  if ($line -notmatch '^(STATUS|WEBSITE_VERSION|PROVIDER_TAG)=([a-z0-9.]+)$') { throw 'Invalid deployment bundle' }
  if ($bundle.ContainsKey($Matches[1])) { throw 'Duplicate deployment bundle field' }
  $bundle[$Matches[1]] = $Matches[2]
}
if ($bundle.STATUS -notin @('candidate', 'released') -or $bundle.PROVIDER_TAG -notmatch '^v\d+\.\d+\.\d+$' -or $bundle.WEBSITE_VERSION -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid deployment bundle' }
if ($bundle.STATUS -eq 'candidate' -and -not $env:PROVIDER_SOURCE_DIR) { throw 'Unpublished candidate requires reviewed PROVIDER_SOURCE_DIR' }
$source = if ($env:PROVIDER_SOURCE_DIR) { $env:PROVIDER_SOURCE_DIR } else { Join-Path $root ('.maintenance/provider-' + $bundle.PROVIDER_TAG) }
if ($bundle.STATUS -eq 'candidate' -and -not (Test-Path $source -PathType Container)) { throw 'Reviewed candidate source directory does not exist' }
if (-not (Test-Path $source)) {
  New-Item -ItemType Directory -Force (Join-Path $root '.maintenance') | Out-Null
  & git clone --depth 1 --branch $bundle.PROVIDER_TAG https://github.com/19Chris19/ima-qa-web-agent.git $source
  if ($LASTEXITCODE -ne 0) { throw 'Provider source unavailable; do not fabricate configuration' }
}
if ($bundle.STATUS -eq 'released') {
  $origin = & git -C $source remote get-url origin
  if ($LASTEXITCODE -ne 0 -or $origin -ne 'https://github.com/19Chris19/ima-qa-web-agent.git') { throw 'Provider source must use the fixed public origin' }
  $head = & git -C $source rev-parse HEAD
  if ($LASTEXITCODE -ne 0) { throw 'Provider source revision unavailable' }
  $tag = & git -C $source rev-parse ("refs/tags/" + $bundle.PROVIDER_TAG + "^{commit}")
  if ($LASTEXITCODE -ne 0 -or $head -ne $tag) { throw 'Provider source must match the fixed public tag' }
  $dirty = & git -C $source status --porcelain
  if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Provider source must be clean; review without deleting existing data' }
}
if (-not (Test-Path (Join-Path $source 'onboard.ps1'))) { throw 'Matching Provider tooling is required' }
if (Test-Path (Join-Path $source 'scripts/deployment-choice.ps1')) {
  $node = (& (Join-Path $source 'onboard.ps1') runtime --deployment-mode independent --allow-bootstrap | Select-Object -Last 1)
} else {
  $node = (& (Join-Path $source 'onboard.ps1') runtime | Select-Object -Last 1)
}
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $node)) { throw 'Maintenance runtime unavailable' }
$env:PROVIDER_SOURCE_DIR = $source
& $node (Join-Path $root 'deploy/onboard.mjs') @args
exit $LASTEXITCODE
