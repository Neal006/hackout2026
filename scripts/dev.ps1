# Start the backend and both front-ends in three windows. Ctrl+C each window to stop.
#   powershell -File scripts/dev.ps1            (from the repo root)
#   SIM_SPEED: sim-seconds per real second; 60 = one sim-minute per second, easy to narrate.
param([int]$SimSpeed = 60)

$root = Split-Path -Parent $PSScriptRoot
$py = if (Test-Path "$root\.venv\Scripts\python.exe") { "$root\.venv\Scripts\python.exe" } else { "python" }

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; `$env:SIM_SPEED='$SimSpeed'; & '$py' -m uvicorn noonshift.api:app --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; if (-not (Test-Path node_modules)) { npm install }; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\wattwise'; if (-not (Test-Path node_modules)) { npm install }; npm run dev"

Write-Host "API      http://localhost:8000/health"
Write-Host "Ops      http://localhost:5173/ops/overview"
Write-Host "Driver   http://localhost:5174"
Write-Host "Check    $py scripts/smoke.py"
