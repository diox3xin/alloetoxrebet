<#
  Astral Phone — публикация в GitHub (всё в один запуск).

  Что делает:
    1. Находит токен: сначала через GitHub CLI (`gh auth token`), затем в
       Windows Credential Manager, и только потом спрашивает вручную.
       Ввод скрытый — токен не попадает в чат.
    2. Записывает токен в .git-credentials-local (файл в .gitignore, в
       репозиторий не уедет).
    3. Делает git push — то есть ИЗАЛИВАЕТ ваши исправления в репозиторий.
    4. Проверяет, что коммит на сервере.
    5. Спрашивает, удалить ли файл с токеном.

  Как запустить: правый клик по файлу → «Run with PowerShell».
  Либо одной строкой в PowerShell:
      powershell -ExecutionPolicy Bypass -File C:\tmp\st-phone-astral\setup-github-access.ps1
#>

$ErrorActionPreference = 'Continue'

$repo = 'C:\tmp\st-phone-astral'
$credFile = Join-Path $repo '.git-credentials-local'

Write-Host ''
Write-Host '  Astral Phone — публикация исправлений в GitHub' -ForegroundColor Magenta
Write-Host '  --------------------------------------------' -ForegroundColor DarkGray
Write-Host ''

if (-not (Test-Path (Join-Path $repo '.git'))) {
    Write-Host '  Не найден git-репозиторий в ' + $repo -ForegroundColor Red
    exit 1
}

# ── 1. Ищем токен ────────────────────────────────────────────────────
$token = $null

Write-Host '  1/4  Ищу токен...' -ForegroundColor Cyan

# Способ 1: GitHub CLI. После `gh auth login` токен лежит именно там.
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    try {
        $out = & gh auth token 2>$null
        if ($out -and $out.Trim()) {
            $token = $out.Trim()
            Write-Host '        нашёл через GitHub CLI' -ForegroundColor DarkGray
        }
    } catch {
        # gh есть, но не авторизован
    }
}

# Способ 2: Windows Credential Manager (если gh не помог).
if (-not $token) {
    foreach ($h in @('manager', 'manager-core', 'wincred')) {
        if ($token) { break }
        try {
            $filled = "protocol=https`nhost=github.com`n`n" | git -c "credential.helper=$h" credential fill 2>$null
            if ($filled) {
                foreach ($line in $filled) {
                    if ($line -like 'password=*') {
                        $token = $line.Substring(9)
                        break
                    }
                }
            }
        } catch {
            # этого помощника на машине нет
        }
    }
    if ($token) {
        Write-Host '        нашёл в Credential Manager' -ForegroundColor DarkGray
    }
}

# Способ 3: спрашиваем вручную.
if (-not $token) {
    Write-Host '        сохранённого токена не нашлось' -ForegroundColor DarkYellow
    Write-Host ''
    Write-Host '        Нужен Personal Access Token с правом' -ForegroundColor Yellow
    Write-Host '        "Contents: read and write" для репозитория alloetoxrebet.' -ForegroundColor Yellow
    Write-Host '        Создать: https://github.com/settings/tokens/new' -ForegroundColor DarkGray
    Write-Host ''

    $secure = Read-Host '        Вставьте токен (ввод скрыт)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host '  Токен пустой — выходим.' -ForegroundColor Red
    exit 1
}

Set-Content -Path $credFile -Value ("https://diox3xin:" + $token + "@github.com") -Encoding UTF8 -NoNewline
$token = $null   # из памяти убираем

# ── 2. Проверяем доступ ──────────────────────────────────────────────
Write-Host '  2/4  Проверяю доступ к репозиторию...' -ForegroundColor Cyan

Push-Location $repo
$probe = & git ls-remote origin 2>&1
$accessOk = ($LASTEXITCODE -eq 0)
Pop-Location

if (-not $accessOk) {
    Write-Host '        доступ не подтверждён:' -ForegroundColor Red
    Write-Host ($probe | Out-String) -ForegroundColor DarkRed
    Write-Host '        Проверьте, что у токена есть право Contents: read and write' -ForegroundColor Yellow
    Write-Host '        и что репозиторий alloetoxrebet вам доступен.' -ForegroundColor Yellow
    Write-Host ''
    $keep = Read-Host '  Оставить файл с токеном? (Y/N)' -Default 'N'
    if ($keep -notmatch '^[YyДд]') { Remove-Item $credFile -Force -ErrorAction SilentlyContinue }
    exit 1
}
Write-Host '        доступ есть' -ForegroundColor DarkGray

# ── 3. Пуш ───────────────────────────────────────────────────────────
Write-Host '  3/4  Отправляю изменения...' -ForegroundColor Cyan

Push-Location $repo
$before = (& git rev-parse HEAD 2>$null)
$pushOutput = & git push origin main 2>&1
$pushCode = $LASTEXITCODE
Pop-Location

$pushOutput | ForEach-Object { Write-Host ('        ' + $_) -ForegroundColor DarkGray }

if ($pushCode -ne 0) {
    Write-Host '        push не прошёл' -ForegroundColor Red
    Write-Host ''
    $keep = Read-Host '  Оставить файл с токеном? (Y/N)' -Default 'N'
    if ($keep -notmatch '^[YyДд]') { Remove-Item $credFile -Force -ErrorAction SilentlyContinue }
    exit 1
}

# ── 4. Проверяем на сервере ──────────────────────────────────────────
Write-Host '  4/4  Проверяю, что коммит на сервере...' -ForegroundColor Cyan

Push-Location $repo
$remote = (& git ls-remote origin refs/heads/main 2>$null) -split '\s+' | Select-Object -First 1
$local = (& git rev-parse HEAD 2>$null)
Pop-Location

if ($remote -and $remote -eq $local) {
    Write-Host '        сервер и локальная копия совпадают' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  Опубликовано: ' + $local.Substring(0, 7) -ForegroundColor Green
} else {
    Write-Host '        сервер: ' + $remote -ForegroundColor Yellow
    Write-Host '        локально: ' + $local -ForegroundColor Yellow
}

# ── Уборка ───────────────────────────────────────────────────────────
Write-Host ''
$keep = Read-Host '  Удалить файл с токеном? (Y/N)' -Default 'Y'
if ($keep -match '^[YyДд]') {
    Remove-Item $credFile -Force -ErrorAction SilentlyContinue
    Write-Host '  Файл с токеном удалён.' -ForegroundColor DarkGray
} else {
    Write-Host '  Файл с токеном оставлен: ' + $credFile -ForegroundColor DarkGray
    Write-Host '  Удалите его вручную, когда закончите.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  Дальше в SillyTavern:' -ForegroundColor Cyan
Write-Host '    1. Extensions → Update' -ForegroundColor DarkGray
Write-Host '    2. Полная перезагрузка страницы: Ctrl+F5' -ForegroundColor DarkGray
Write-Host '    3. Включите Function Calling в настройках API' -ForegroundColor DarkGray
Write-Host '    4. Откройте консоль (F12) — должна быть строка [Astral Phone] ready' -ForegroundColor DarkGray
Write-Host ''
