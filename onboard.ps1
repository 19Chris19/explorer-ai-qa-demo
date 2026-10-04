$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$source = if ($env:PROVIDER_SOURCE_DIR) { $env:PROVIDER_SOURCE_DIR } else { Join-Path $root '.maintenance/provider-v0.4.2' }
if (-not (Test-Path $source)) {
  New-Item -ItemType Directory -Force (Join-Path $root '.maintenance') | Out-Null
  & git clone --depth 1 --branch v0.4.2 https://github.com/19Chris19/ima-qa-web-agent.git $source
  if ($LASTEXITCODE -ne 0) { throw 'Provider source unavailable; do not fabricate configuration' }
}
if (-not (Test-Path (Join-Path $source 'onboard.ps1'))) { throw 'Provider v0.4.2 tooling is required' }
$node = (& (Join-Path $source 'onboard.ps1') runtime | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $node)) { throw 'Maintenance runtime unavailable' }
$env:PROVIDER_SOURCE_DIR = $source
& $node (Join-Path $root 'deploy/onboard.mjs') @args
exit $LASTEXITCODE
