# Harfiyen'i kendi penceresinde açar (adres çubuğu ve sekme olmadan). Geliştirme
# sunucusu çalışmıyorsa gizli olarak başlatır; pencere kapanınca onu da kapatır.
# Sunucu zaten açıksa (başka bir pencere ya da terminal) ona dokunmaz.
#
# Masaüstü kısayolu: powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File scripts\windows\harfiyen.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$port = 5173
$url = "http://localhost:$port"
# Ayrı bir tarayıcı profili: normal tarayıcıyla karışmaz ve pencerenin kapandığı anlaşılır.
$data = Join-Path $env:LOCALAPPDATA 'Harfiyen'
$profileDir = Join-Path $data 'browser-profile'
New-Item -ItemType Directory -Force $profileDir | Out-Null

function Show-Error([string]$message) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($message, 'Harfiyen', 'OK', 'Error') | Out-Null
}

function Test-Up {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $url).StatusCode -eq 200 } catch { $false }
}

$server = $null
if (-not (Test-Up)) {
  # Node.js: on PATH, or where installers and bundling tools usually put it
  # (a shortcut does not see PATH additions made only inside a terminal).
  $node = @(
    (Get-Command node -ErrorAction SilentlyContinue).Source,
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    "$env:LOCALAPPDATA\hermes\node\node.exe",
    "$env:NVM_SYMLINK\node.exe",
    "$env:APPDATA\nvm\current\node.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  $vite = Join-Path $root 'node_modules\vite\bin\vite.js'
  if (-not $node) {
    Show-Error "Node.js bulunamadı. https://nodejs.org adresinden kurup tekrar dene."
    exit 1
  }
  if (-not (Test-Path $vite)) {
    Show-Error "Proje bağımlılıkları bulunamadı.`n`n$root klasöründe 'npm install' çalıştır."
    exit 1
  }
  $log = Join-Path $data 'server.log'
  $server = Start-Process -FilePath $node -ArgumentList "`"$vite`"", '--port', $port, '--strictPort' `
    -WorkingDirectory $root -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-Up)) {
    if ($server.HasExited -or (Get-Date) -gt $deadline) {
      if (-not $server.HasExited) { & taskkill.exe /PID $server.Id /T /F | Out-Null }
      Show-Error "Sunucu başlatılamadı. Ayrıntılar:`n$log.err"
      exit 1
    }
    Start-Sleep -Milliseconds 300
  }
}

$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  if ($server) { & taskkill.exe /PID $server.Id /T /F | Out-Null }
  Show-Error 'Chrome ya da Edge bulunamadı.'
  exit 1
}

$app = Start-Process -FilePath $browser -PassThru -ArgumentList @(
  "--app=$url",
  "--user-data-dir=`"$profileDir`"",
  '--no-first-run',
  '--no-default-browser-check'
)
try {
  # Bu profil zaten açıksa tarayıcı işi açık olana devreder ve hemen çıkar; o
  # durumda sunucuyu bu betik başlatmamıştır ve kapatmaz.
  $app.WaitForExit()
  # Pencere kapandıktan sonra profilin son işlemlerinin bitmesini bekle.
  while (Get-CimInstance Win32_Process -Filter "Name='$(Split-Path -Leaf $browser)'" |
      Where-Object { $_.CommandLine -like "*$profileDir*" }) {
    Start-Sleep -Milliseconds 500
  }
} finally {
  if ($server -and -not $server.HasExited) { & taskkill.exe /PID $server.Id /T /F | Out-Null }
}
