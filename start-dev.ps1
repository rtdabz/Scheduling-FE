$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '..\Scheduling-BE'))
$php = Join-Path $env:USERPROFILE '.config\herd\bin\php85\php.exe'

if (-not (Test-Path -LiteralPath $php)) {
    throw "PHP 8.5 executable not found at $php"
}

# Keep child processes and Composer on the same PHP runtime.
$env:Path = "$(Split-Path -Parent $php);$env:Path"

if (-not (Test-Path -LiteralPath (Join-Path $backendRoot 'artisan'))) {
    throw "Laravel backend was not found at $backendRoot"
}

function Start-WicarsProcess {
    param(
        [string] $FilePath,
        [string[]] $ArgumentList,
        [string] $WorkingDirectory,
        [switch] $Hidden
    )

    $options = @{
        FilePath = $FilePath
        ArgumentList = $ArgumentList
        WorkingDirectory = $WorkingDirectory
        PassThru = $true
    }
    if ($Hidden) {
        $options.WindowStyle = 'Hidden'
    }

    return Start-Process @options
}

# The queue worker and Reverb start hidden, so closing this window leaves them
# running. A worker left from an earlier start keeps the PHP code it loaded and
# still takes generation jobs, so backend changes would silently not apply.
# Stop every WICARS backend process from earlier starts before starting fresh.
$staleProcesses = Get-CimInstance Win32_Process -Filter "Name = 'php.exe'" |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine.Contains($backendRoot) -and
        $_.CommandLine -match 'queue:work|reverb:start|artisan"?\s+serve|server\.php'
    }
foreach ($process in $staleProcesses) {
    Write-Host "Stopping earlier WICARS process $($process.ProcessId)"
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$backendCommand = "& '$php' '$(Join-Path $backendRoot 'artisan')' serve --host=127.0.0.1 --port=8000 --no-reload"
$backendServer = Start-WicarsProcess `
    -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-Command', $backendCommand) `
    -WorkingDirectory $backendRoot

$queueWorker = Start-WicarsProcess `
    -FilePath $php `
    -ArgumentList @((Join-Path $backendRoot 'artisan'), 'queue:work', 'database', '--queue=scheduling,default', '--tries=1', '--timeout=180', '--sleep=1') `
    -WorkingDirectory $backendRoot `
    -Hidden

# Live updates: the WebSocket server browsers subscribe to. The app keeps
# working without it, but pages then only refresh on navigation.
$reverb = Start-WicarsProcess `
    -FilePath $php `
    -ArgumentList @((Join-Path $backendRoot 'artisan'), 'reverb:start') `
    -WorkingDirectory $backendRoot `
    -Hidden

$vite = Start-WicarsProcess `
    -FilePath 'npm.cmd' `
    -ArgumentList @('run', 'dev') `
    -WorkingDirectory $projectRoot

Write-Host "WICARS development services started."
Write-Host "Laravel server PID: $($backendServer.Id)"
Write-Host "Scheduling worker PID: $($queueWorker.Id)"
Write-Host "Live updates (Reverb) PID: $($reverb.Id)"
Write-Host "Vite server PID: $($vite.Id)"
Write-Host "Keep this window open while developing."
