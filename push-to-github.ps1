<#
  Публикация исправленного расширения в GitHub.

  Что делает:
    1. спрашивает Personal Access Token (ввод скрытый, токен не попадёт в чат);
    2. записывает его в .git-credentials-local (файл в .gitignore, в репозиторий не уедет);
    3. отправляет коммит в https://github.com/diox3xin/alloetoxrebet;
    4. по желанию удаляет файл с токеном.

  Как запустить: правый клик по файлу → «Run with PowerShell»
  (или в PowerShell: powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1)
#>

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$repo = 'C:\tmp\st-phone-astral'
$credFile = Join-Path $repo '.git-credentials-local'

Write-Host ''
Write-Host '  Astral Phone — публикация в GitHub' -ForegroundColor Magenta
Write-Host '  ---------------------------------' -ForegroundColor DarkGray
Write-Host ''

if (-not (Test-Path (Join-Path $repo '.git'))) {
    Write-Host '  Не найден git-репозиторий в ' + $repo -ForegroundColor Red
    exit 1
}

# ── 1. Токен ───────────────────────────────────────────────────────────
Write-Host '  Нужен Personal Access Token от github.com с правом' -ForegroundColor Yellow
Write-Host '  "Contents: read and write" для репозитория alloetoxrebet.' -ForegroundColor Yellow
Write-Host '  Создать: github.com/settings/tokens/new' -ForegroundColor DarkGray
Write-Host ''

$secure = Read-Host '  Вставьте токен (ввод скрыт)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host '  Токен пустой — выходим.' -ForegroundColor Red
    exit 1
}

# ── 2. Файл credentials ───────────────────────────────────────────────
Set-Content -Path $credFile -Value ("https://diox3xin:" + $token + "@github.com") -Encoding UTF8 -NoNewline
Write-Host '  Токен сохранён локально (в репозиторий не попадёт).' -ForegroundColor DarkGray

# ── 3. Push ────────────────────────────────────────────────────────────
Set-Location $repo
Write-Host ''
Write-Host '  Отправляю коммит...' -ForegroundColor Cyan

$output = & git push origin main 2>&1
$code = $LASTEXITCODE
$output | ForEach-Object { Write-Host ('  ' + $_) }

# ── 4. Уборка ──────────────────────────────────────────────────────────
$keep = Read-Host '  Удалить файл с токеном? (Y/N)' -Default 'Y'
if ($keep -match '^[YyДд]') {
    Remove-Item $credFile -Force -ErrorAction SilentlyContinue
    Write-Host '  Файл с токеном удалён.' -ForegroundColor DarkGray
}

Write-Host ''
if ($code -eq 0) {
    Write-Host '  Готово. Обновите расширение в SillyTavern:' -ForegroundColor Green
    Write-Host '  Extensions → Update, затем полный перезагруз страницы (Ctrl+F5).' -ForegroundColor Green
} else {
    Write-Host '  Push не прошёл — проверьте токен и права репозитория.' -ForegroundColor Red
}
Write-Host ''
