# Forge Academy installer for Windows. `npm run release` stamps the versions and hashes in below.
# Needs no admin rights and is safe to run twice. Running it again updates, after backing up progress.
# FORGE_RELEASE: where the release lives, a URL or a folder. FORGE_HOME: where to install.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $manifest = @'
__MANIFEST__
'@ | ConvertFrom-Json

  $home_ = if ($env:FORGE_HOME) { $env:FORGE_HOME } else { Join-Path $env:LOCALAPPDATA 'ForgeAcademy' }
  $release = if ($env:FORGE_RELEASE) { $env:FORGE_RELEASE } else { $manifest.releaseUrl }
  $runtime = Join-Path $home_ 'runtime'
  $app = Join-Path $home_ 'app'
  $data = Join-Path $home_ 'data'
  $downloads = Join-Path $home_ 'downloads'
  $node = Join-Path $runtime 'node\node.exe'
  $mongod = Join-Path $runtime 'mongodb\bin\mongod.exe'
  $tar = Join-Path $env:WINDIR 'System32\tar.exe'
  $curl = Join-Path $env:WINDIR 'System32\curl.exe'

  function Step($text) { Write-Host "==> $text" -ForegroundColor Yellow }

  # stderr from a program isn't an error here, only its exit code is.
  function Native($file, [string[]]$arguments, $failure) {
    $ErrorActionPreference = 'Continue'
    & $file @arguments
    if ($LASTEXITCODE -ne 0) { throw $failure }
  }

  function HashOf($path) { (Get-FileHash $path -Algorithm SHA256).Hash.ToLower() }

  # Keeps a partial download in a .part file, so a dropped connection resumes when the line is run again.
  function Fetch($source, $path, $sha256) {
    if ((Test-Path $path) -and (HashOf $path) -eq $sha256) { return }
    Remove-Item $path -ErrorAction SilentlyContinue
    $part = "$path.part"
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source $part -Force }
    else {
      try {
        Native $curl @('-#fL', '--retry', '3', '--retry-delay', '2', '-C', '-', '-o', $part, $source) "Couldn't download $source. Check your connection and run the line again."
      } catch {
        # 33: this server can't resume, so the next run has to start from nothing.
        if ($LASTEXITCODE -eq 33) { Remove-Item $part -ErrorAction SilentlyContinue }
        throw
      }
    }
    if ((HashOf $part) -ne $sha256) {
      Remove-Item $part
      throw "The download of $(Split-Path -Leaf $path) didn't match its checksum, so it was deleted. Run the line again."
    }
    Move-Item $part $path -Force
  }

  function FromRelease($file) { if ($release -match '^https?:') { "$release/$file" } else { Join-Path $release $file } }

  if (-not $release) { throw 'This installer has no release address. Set FORGE_RELEASE.' }
  if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw "Forge Academy needs 64-bit Intel or AMD Windows, and this is $env:PROCESSOR_ARCHITECTURE." }
  foreach ($tool in @($tar, $curl)) {
    if (-not (Test-Path $tool)) { throw "$tool is missing. Forge Academy needs Windows 10 version 1803 or newer." }
  }
  New-Item -ItemType Directory -Force $home_, $runtime, $data, $downloads | Out-Null
  $free = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot((Resolve-Path $home_).Path)).AvailableFreeSpace
  if ($free -lt 2GB) { throw "Forge Academy needs 2 GB of free space, and this drive has $([math]::Round($free / 1GB, 1)) GB." }

  if (Test-Path (Join-Path $app 'scripts\app.mjs')) {
    Step 'Closing the running copy'
    if (Test-Path $node) { & $node (Join-Path $app 'scripts\app.mjs') stop; Start-Sleep -Seconds 3 }
  }

  if (-not ((Test-Path $node) -and (& $node --version) -eq "v$($manifest.node.version)")) {
    Step "Downloading Node $($manifest.node.version)"
    $zip = Join-Path $downloads 'node.zip'
    Fetch $manifest.node.'win-x64'.url $zip $manifest.node.'win-x64'.sha256
    $unpacked = Join-Path $downloads 'node-unpacked'
    Remove-Item $unpacked -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory $unpacked | Out-Null
    Native $tar @('-xf', $zip, '-C', $unpacked) "Couldn't unpack Node."
    Remove-Item (Join-Path $runtime 'node') -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item (Get-ChildItem $unpacked -Directory | Select-Object -First 1).FullName (Join-Path $runtime 'node')
    Remove-Item $unpacked, $zip -Recurse -Force
  }

  $mongoMark = Join-Path $runtime 'mongodb\version.txt'
  if (-not ((Test-Path $mongoMark) -and (Get-Content $mongoMark) -eq $manifest.mongodb.version)) {
    Step "Downloading MongoDB $($manifest.mongodb.version), about 800 MB. Only the database server is kept"
    $zip = Join-Path $downloads 'mongodb.zip'
    Fetch $manifest.mongodb.'win-x64'.url $zip $manifest.mongodb.'win-x64'.sha256
    New-Item -ItemType Directory -Force (Split-Path $mongod) | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
    try {
      $entry = $archive.Entries | Where-Object { $_.FullName -like '*/bin/mongod.exe' } | Select-Object -First 1
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $mongod, $true)
    } finally { $archive.Dispose() }
    Native $mongod @('--version') 'MongoDB would not run. Install the Microsoft Visual C++ Redistributable from https://aka.ms/vs/17/release/vc_redist.x64.exe and run the line again.' | Out-Null
    Set-Content $mongoMark $manifest.mongodb.version
    Remove-Item $zip
  }

  Step "Downloading Forge Academy $($manifest.app.version)"
  $package = Join-Path $downloads $manifest.app.file
  Fetch (FromRelease $manifest.app.file) $package $manifest.app.sha256
  $stage = Join-Path $home_ 'app.new'
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory $stage | Out-Null
  Native $tar @('-xzf', $package, '-C', $stage, '--strip-components=1') "Couldn't unpack Forge Academy."
  # A failed release must never reach the student's working copy, so this all happens in the new folder.
  $env:PATH = (Split-Path $node) + ';' + $env:PATH
  Push-Location $stage
  try {
    Step 'Installing packages'
    Native (Join-Path $runtime 'node\npm.cmd') @('ci', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error') "Couldn't install packages. Check your connection and run the line again."
  } finally { Pop-Location }

  $progress = Join-Path $data 'progress.json'
  if (Test-Path $progress) {
    $backups = Join-Path $data 'backups'
    New-Item -ItemType Directory -Force $backups | Out-Null
    Copy-Item $progress (Join-Path $backups ('progress-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'))
  }

  $old = Join-Path $home_ 'app.old'
  Remove-Item $old -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $app) { Rename-Item $app 'app.old' }
  try { Rename-Item $stage 'app' }
  catch {
    if (Test-Path $old) { Rename-Item $old 'app' }
    throw 'Forge Academy is still in use. Close it and run the line again.'
  }
  Remove-Item $old -Recurse -Force -ErrorAction SilentlyContinue

  if (-not $env:FORGE_NO_ICON) {
    Step 'Adding the desktop icon'
    Native powershell.exe @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $app 'scripts\install-shortcut.ps1')) "Couldn't create the desktop icon." | Out-Null
  }

  Step 'Opening Forge Academy'
  $launcher = @(Join-Path $app 'scripts\app.mjs')
  if ($env:FORGE_NO_OPEN) { $launcher += '--no-open' }
  Native $node $launcher 'Forge Academy was installed but would not start.'
  Write-Host "Done. Forge Academy is on your desktop, and installed in $home_" -ForegroundColor Green
}
