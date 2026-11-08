# 星语塔罗 · 一键分享到公网（Cloudflare 临时隧道，无需注册）
# 用法：双击 share.bat，或在 PowerShell 中运行：
#   .\share.ps1                 # 自动生成 6 位访问口令
#   .\share.ps1 -Code 1234      # 指定口令
#   .\share.ps1 -PerIp 5 -Daily 50
# 按 Ctrl+C 结束分享（服务器和隧道会一起关闭）。

param(
    [string]$Code = "",
    [int]$Port = 8000,
    [int]$PerIp = 10,
    [int]$Daily = 100,
    [string]$Cloudflared = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Python：优先用项目自己的 .venv，其次是当前激活的虚拟环境，最后是 PATH 里的 python
$py = @("$root\.venv\Scripts\python.exe", "$env:VIRTUAL_ENV\Scripts\python.exe") |
    Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $py) { $py = "python" }

# cloudflared：参数 / 环境变量 CLOUDFLARED / PATH / 项目目录 / 常见安装位置
$cfCandidates = @($Cloudflared, $env:CLOUDFLARED, (Get-Command cloudflared -ErrorAction SilentlyContinue).Source,
    "$root\cloudflared.exe", "D:\tools\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe")
$cf = $cfCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $cf) {
    Write-Host "找不到 cloudflared.exe。请从 https://github.com/cloudflare/cloudflared/releases 下载 cloudflared-windows-amd64.exe，" -ForegroundColor Red
    Write-Host "改名为 cloudflared.exe 放到本项目目录，或用 -Cloudflared 参数指定路径。" -ForegroundColor Red
    exit 1
}

if (-not $Code) { $Code = -join (1..6 | ForEach-Object { Get-Random -Minimum 0 -Maximum 10 }) }

# 端口被占用（比如你自己已经开着一个 server.py）就自动换下一个，避免把别的程序暴露到公网
$start = $Port
while (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $Port++ }
if ($Port -ne $start) { Write-Host "端口 $start 已被占用，改用 $Port" -ForegroundColor DarkYellow }

$logDir = Join-Path $env:TEMP "tarot-share"
New-Item -ItemType Directory -Force $logDir | Out-Null
$srvOut = Join-Path $logDir "server.log"
$srvErr = Join-Path $logDir "server.err.log"
$cfErr = Join-Path $logDir "cloudflared.log"
Remove-Item $srvOut, $srvErr, $cfErr -ErrorAction SilentlyContinue

Write-Host "🔮 正在启动星语塔罗服务器…" -ForegroundColor Yellow
$env:PYTHONIOENCODING = "utf-8"
$server = Start-Process -FilePath $py -WorkingDirectory $root -PassThru -WindowStyle Hidden `
    -ArgumentList "server.py", "--port", $Port, "--code", $Code, "--per-ip", $PerIp, "--daily", $Daily `
    -RedirectStandardOutput $srvOut -RedirectStandardError $srvErr

$tunnel = $null
try {
    # 等服务器就绪
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        if ($server.HasExited) { break }
        try {
            # 必须是我们刚启动的、带口令的服务器在响应
            $cfg = Invoke-RestMethod "http://127.0.0.1:$Port/api/config" -TimeoutSec 2
            if ($cfg.need_code) { $ok = $true; break }
        } catch {}
    }
    if (-not $ok) {
        Write-Host "服务器启动失败（端口 $Port 是否已被占用？）：" -ForegroundColor Red
        Get-Content $srvErr -ErrorAction SilentlyContinue | Select-Object -Last 15
        exit 1
    }

    Write-Host "🌐 正在创建 Cloudflare 公网隧道…" -ForegroundColor Yellow
    $tunnel = Start-Process -FilePath $cf -PassThru -WindowStyle Hidden `
        -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$Port" `
        -RedirectStandardError $cfErr -RedirectStandardOutput (Join-Path $logDir "cloudflared.out.log")

    $url = $null
    for ($i = 0; $i -lt 60 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 500
        if ($tunnel.HasExited) { break }
        $m = Select-String -Path $cfErr -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value }
    }
    if (-not $url) {
        Write-Host "隧道创建失败：" -ForegroundColor Red
        Get-Content $cfErr -ErrorAction SilentlyContinue | Select-Object -Last 15
        exit 1
    }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor DarkYellow
    Write-Host "  ✨ 分享成功！把下面两样发给朋友：" -ForegroundColor Green
    Write-Host ""
    Write-Host "     网址：$url" -ForegroundColor Cyan
    Write-Host "     口令：$Code" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  每人每天 $PerIp 次，所有人每天共 $Daily 次（费用算在你的 OpenAI 账户）"
    Write-Host "  网址刚生成时可能要等十几秒才能打开；每次运行网址都会变"
    Write-Host "  按 Ctrl+C 结束分享"
    Write-Host "==================================================" -ForegroundColor DarkYellow
    Write-Host ""

    while (-not $server.HasExited -and -not $tunnel.HasExited) { Start-Sleep -Seconds 1 }
    if ($server.HasExited) { Write-Host "服务器已退出：" -ForegroundColor Red; Get-Content $srvErr -ErrorAction SilentlyContinue | Select-Object -Last 15 }
    if ($tunnel.HasExited) { Write-Host "隧道已断开：" -ForegroundColor Red; Get-Content $cfErr -ErrorAction SilentlyContinue | Select-Object -Last 15 }
}
finally {
    foreach ($p in @($tunnel, $server)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
    Write-Host "分享已结束。" -ForegroundColor Yellow
}
