param()
# Starts both dev servers (API + SPA) with the portable Node from tools\ on PATH.
# Each server opens in its own console window so you can see logs and Ctrl+C either one.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$env:Path = "$root\tools\v24node;$env:Path"

Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', "Set-Location '$root\server'; `$env:Path = '$root\tools\v24node;' + `$env:Path; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', "Set-Location '$root\client'; `$env:Path = '$root\tools\v24node;' + `$env:Path; npm run dev"

Write-Host ""
Write-Host "DriveRight dev servers launching:"
Write-Host "  SPA  ->  http://localhost:5173"
Write-Host "  API  ->  http://localhost:4000/api/health"
Write-Host ""
Write-Host "Closing the windows stops the servers."
