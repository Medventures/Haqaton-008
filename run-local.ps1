# Запуск без Docker: backend :8000, mis-mock :8001, frontend :5173
# Использование: powershell -ExecutionPolicy Bypass -File .\run-local.ps1
$root = $PSScriptRoot

# Подхватить переменные из .env (если есть), дочерние окна их унаследуют
if (Test-Path "$root\.env") {
    Get-Content "$root\.env" | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] }
    }
}

foreach ($svc in @(@{dir="backend"; port=8000}, @{dir="mis-mock"; port=8001})) {
    $dir = Join-Path $root $svc.dir
    if (-not (Test-Path "$dir\.venv")) {
        python -m venv "$dir\.venv"
        & "$dir\.venv\Scripts\pip" install -q -r "$dir\requirements.txt"
    }
    Start-Process powershell -WorkingDirectory $dir -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\python -m uvicorn app.main:app --port $($svc.port)"
}

$fe = Join-Path $root "frontend"
if (-not (Test-Path "$fe\node_modules")) { Push-Location $fe; npm install; Pop-Location }
Start-Process powershell -WorkingDirectory $fe -ArgumentList "-NoExit", "-Command", "npm run dev"

Write-Host "frontend: http://localhost:5173  backend: http://localhost:8000/health  mis-mock: http://localhost:8001/health"
