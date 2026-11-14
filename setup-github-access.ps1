<#
  Даёт Claude доступ к GitHub без ввода токена в чат.

  Скрипт работает на вашем компьютере и делает две вещи:

    1. Пытается достать уже сохранённый токен из Windows Credential Manager
       (если вы раньше делали `gh auth login` или пушили через git —
       токен там и лежит). Если нашёлся — сразу пишет его в
       .git-credentials-local и всё, больше ничего делать не нужно.

    2. Если токен в менеджере не найден — спросит его у вас (ввод скрытый,
       в чат он не попадёт) и сохранит так же.

  Файл .git-credentials-local добавлен в .gitignore, в репозиторий он не
  уедет. Когда работа закончится, его можно удалить — скрипт спросит.

  Как запустить: правый клик по файлу → «Run with PowerShell»
#>

$ErrorActionPreference = 'Continue'

$repo = 'C:\tmp\st-phone-astral'
$credFile = Join-Path $repo '.git-credentials-local'

Write-Host ''
Write-Host '  Astral Phone — доступ к GitHub' -ForegroundColor Magenta
Write-Host '  --------------------------------' -ForegroundColor DarkGray
Write-Host ''

if (-not (Test-Path (Join-Path $repo '.git'))) {
    Write-Host '  Не найден git-репозиторий в ' + $repo -ForegroundColor Red
    exit 1
}

# ── 1. Пробуем достать токен из Credential Manager ───────────────────
$token = $null

Write-Host '  Ищу сохранённый токен в Windows Credential Manager...' -ForegroundColor Cyan

$input = "protocol=https`nhost=github.com`n`n"
try {
    $filled = $input | git credential fill 2>$null
    if ($filled) {
        foreach ($line in $filled) {
            if ($line -like 'password=*') {
                $token = $line.Substring(9)
                break
            }
        }
    }
} catch {
    # credential helper может отсутствовать — не страшно
}

if ($token) {
    Write-Host '  Нашёл сохранённый токен.' -ForegroundColor Green
} else {
    Write-Host '  Сохранённого токена не нашлось.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  Нужен Personal Access Token с правом "Contents: read and write"' -ForegroundColor Yellow
    Write-Host '  для репозитория alloetoxrebet. Создать:' -ForegroundColor Yellow
    Write-Host '  https://github.com/settings/tokens/new' -ForegroundColor DarkGray
    Write-Host ''

    $secure = Read-Host '  Вставьте токен (ввод скрыт)' -AsSecureString
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

# ── 2. Пишем файл credentials ───────────────────────────────────────
Set-Content -Path $credFile -Value ("https://diox3xin:" + $token + "@github.com") -Encoding UTF8 -NoNewline
Write-Host '  Токен записан в .git-credentials-local (в репозиторий не попадёт).' -ForegroundColor DarkGray

# ── 3. Проверяем, что доступ действительно работает ─────────────────
Write-Host ''
Write-Host '  Проверяю доступ...' -ForegroundColor Cyan
Push-Location $repo
$probe = & git ls-remote origin 2>&1
$ok = ($LASTEXITCODE -eq 0)
Pop-Location

if (-not $ok) {
    Write-Host '  Доступ не подтверждён:' -ForegroundColor Red
    Write-Host ($probe | Out-String) -ForegroundColor DarkRed
    Write-Host '  Проверьте, что у токена есть право Contents: read and write.' -ForegroundColor Yellow
    Write-Host ''
    $keep = Read-Host '  Оставить файл с токеном? (Y/N)' -Default 'N'
    if ($keep -notmatch '^[YyДд]') { Remove-Item $credFile -Force -ErrorAction SilentlyContinue }
    exit 1
}

Write-Host '  Доступ есть. Теперь осталось отправить коммит.' -ForegroundColor Green
Write-Host '  Скажите Claude: «пушь» — и я залью изменения.' -ForegroundColor Green
Write-Host ''
Write-Host '  Файл с токеном лежит в ' + $credFile -ForegroundColor DarkGray
Write-Host '  После публикации его можно удалить вручную.' -ForegroundColor DarkGray
Write-Host ''
