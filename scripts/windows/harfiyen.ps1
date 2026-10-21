# Harfiyen'i masaüstü penceresinde açar (electron/main.js, --dev). Geliştirme
# sunucusu pencerenin içinde çalışır, pencere kapanınca o da kapanır. Electron
# Node.js'i içinde getirir; PATH'te Node gerekmez.
#
# Masaüstü kısayolu: powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File scripts\windows\harfiyen.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $electron)) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "Electron bulunamadı.`n`n$root klasöründe 'npm install' çalıştır.", 'Harfiyen', 'OK', 'Error') | Out-Null
  exit 1
}

Start-Process -FilePath $electron -ArgumentList '.', '--dev' -WorkingDirectory $root
