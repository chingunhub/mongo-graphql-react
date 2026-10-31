# Run via the desktop shortcut (launch.vbs keeps this console hidden). The launcher itself is app.mjs.
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path (Split-Path -Parent $root) 'runtime\node\node.exe' # an installed copy's own Node
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $node) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show('Node.js was not found on PATH. Install Node 24+ and try again.', 'Forge Academy') | Out-Null
  exit 1
}
& $node (Join-Path $root 'scripts\app.mjs') @args
