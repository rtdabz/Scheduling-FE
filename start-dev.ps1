$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
# Backend location: $env:WICARS_BACKEND overrides, else the first sibling folder that has artisan.
$backendRoot = $null
$backendCandidates = @($env:WICARS_BACKEND, '..\backend', '..\Scheduling-BE') | Where-Object { $_ }
foreach ($candidate in $backendCandidates) {
    $resolved = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $candidate))
    if (Test-Path -LiteralPath (Join-Path $resolved 'artisan')) { $backendRoot = $resolved; break }
}
if (-not $backendRoot) {
    $backendRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '..\backend'))
}

# PHP 8.5 location: $env:WICARS_PHP overrides, then Herd, then C:\php-8.5*, then php on PATH.
$phpCandidates = @(
    $env:WICARS_PHP,
    (Join-Path $env:USERPROFILE '.config\herd\bin\php85\php.exe')
)
$phpCandidates += Get-ChildItem -Path 'C:\' -Directory -Filter 'php-8.5*' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'php.exe' }
$pathPhp = Get-Command php -ErrorAction SilentlyContinue
if ($pathPhp) { $phpCandidates += $pathPhp.Source }

$php = $null
foreach ($candidate in ($phpCandidates | Where-Object { $_ })) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $version = & $candidate -r 'echo PHP_VERSION;'
    if ("$version" -like '8.5.*') { $php = $candidate; break }
}

if (-not $php) {
    throw "PHP 8.5 executable not found. Checked: $($phpCandidates -join ', '). Set `$env:WICARS_PHP to its path."
}
Write-Host "Using PHP: $php"
Write-Host "Using backend: $backendRoot"

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
# Stop the worker supervisor loops first, or they would restart the workers below.
$staleSupervisors = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine.Contains($backendRoot) -and
        $_.CommandLine.Contains('queue:work')
    }
foreach ($process in $staleSupervisors) {
    Write-Host "Stopping earlier WICARS worker supervisor $($process.ProcessId)"
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
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
    -ArgumentList @('-NoProfile', '-NoExit', '-Command', $backendCommand) `
    -WorkingDirectory $backendRoot

# The scheduling worker runs under a restart loop. queue:work exits on its own after
# a job that leaves it above --memory, and a job that hits its time limit kills the
# process (Windows PHP has no pcntl). Without the loop, either one left generation
# runs queued forever. --memory stays below PHP's 512M memory_limit so the worker
# exits cleanly between jobs instead of dying mid-run. Output goes to
# storage/logs/queue-worker.log because the window is hidden.
$workerLog = Join-Path $backendRoot 'storage\logs\queue-worker.log'
$workerCommand = @"
while (`$true) {
    "[`$(Get-Date -Format s)] Starting scheduling worker" | Out-File -Append -Encoding utf8 '$workerLog'
    & '$php' '$(Join-Path $backendRoot 'artisan')' queue:work database --queue=scheduling,default --tries=1 --timeout=180 --sleep=1 --memory=384 2>&1 |
        ForEach-Object { "`$_" } | Out-File -Append -Encoding utf8 '$workerLog'
    "[`$(Get-Date -Format s)] Scheduling worker exited with code `$LASTEXITCODE; restarting" | Out-File -Append -Encoding utf8 '$workerLog'
    Start-Sleep -Seconds 2
}
"@
$queueWorker = Start-WicarsProcess `
    -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-EncodedCommand', [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($workerCommand))) `
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
Write-Host "Scheduling worker supervisor PID: $($queueWorker.Id) (log: $workerLog)"
Write-Host "Live updates (Reverb) PID: $($reverb.Id)"
Write-Host "Vite server PID: $($vite.Id)"
Write-Host "Keep this window open while developing."
