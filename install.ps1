param(
  [string]$Mode,
  [string]$Runtime,
  [string]$Action = 'preflight',
  [string]$WslRoot,
  [string]$Distribution,
  [string]$GatewayUrl,
  [string]$TokenFile,
  [string]$Project = 'explorer-shared',
  [string]$WebPort = '4417',
  [string]$Image
)
$ErrorActionPreference = 'Stop'
function Block([string]$Code, [string]$Next) {
  @{ stage = 'blocked'; code = $Code; next = $Next } | ConvertTo-Json -Compress | Write-Output
  exit 1
}
if (-not $Mode) {
  if ([Console]::IsInputRedirected) { Block 'mode_required' 'Choose online, shared or independent before installing software.' }
  Write-Host '1) Online (no installation)'
  Write-Host '2) Shared (invited endpoint/token, website only)'
  Write-Host '3) Independent (own Provider/accounts)'
  switch (Read-Host 'Choice') {
    '1' { $Mode = 'online' }
    '2' { $Mode = 'shared' }
    '3' { $Mode = 'independent' }
    default { Block 'mode_required' 'No valid choice; nothing installed.' }
  }
}
switch ($Mode) {
  'online' { Write-Output 'https://explorer-ai-qa-demo.vercel.app/'; exit 0 }
  'independent' {
    Write-Output 'Independent selected. Read docs/AGENT_DEPLOYMENT.md, then explicitly run onboard.ps1 doctor/init. Pinned Provider v0.4.2 parameters are unchanged.'
    exit 0
  }
  'shared' { }
  default { Block 'invalid_mode' 'Choose online, shared or independent.' }
}
if ($Runtime -notin @('node', 'docker')) { Block 'runtime_required' 'Choose Node or Docker for the approved WSL2 installation.' }
if ($Action -notin @('preflight', 'init', 'start', 'readiness')) { Block 'invalid_action' 'Choose preflight, init, start or readiness.' }
if ($env:PROCESSOR_ARCHITECTURE -notin @('AMD64', 'ARM64')) { Block 'unsupported_architecture' 'Use Windows x64/arm64 with an approved WSL2 Linux environment.' }
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  Block 'wsl_missing' 'Obtain consent for official WSL2 setup https://learn.microsoft.com/windows/wsl/install ; no system changes made.'
}
if (-not $Distribution -or $WslRoot -notmatch '^/home/[^\r\n]+$') {
  Block 'wsl_configuration_required' 'Supply an approved WSL2 distribution and reviewed checkout under /home, not /mnt. Node/Docker run in WSL; no Windows host Node is required.'
}
# No private file is read here. The POSIX entry validates WSL runtime and permissions.
# Explicit distribution avoids silently changing the default distro or Docker context.
$arguments = @('--distribution', $Distribution, '--exec', 'sh', "$WslRoot/install.sh",
  '--mode', 'shared', '--runtime', $Runtime, '--action', $Action,
  '--project', $Project, '--web-port', $WebPort)
if ($GatewayUrl) { $arguments += @('--gateway-url', $GatewayUrl) }
if ($TokenFile) { $arguments += @('--token-file', $TokenFile) }
if ($Image) { $arguments += @('--image', $Image) }
& wsl.exe @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
exit 0
