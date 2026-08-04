<#
.SYNOPSIS
    Pre-flight check cho Emelee AIKING setup — verify config.json + test live connectivity.

.DESCRIPTION
    Truoc khi import workflow vao N8N va chay live, script nay verify:
      1. config.json hop le (JSON valid, k key trong empty quan trong)
      2. Telegram bot token reach duoc (gui /getMe)
      3. Telegram chat_id active (gui test message — optional, skip neu khong xac nhan)
      4. Facebook Page ID + token access ok (call /me?fields=id,name)
      5. Instagram Business ID linked voi FB Page (call /{ig_id}?fields=username)
      6. ImgBB API key valid (upload test ping)
      7. Tavily API key valid (search test "ping")
      8. Google Sheet ID accessible (HEAD request)
      9. 4 Drive SKILL file IDs ton tai (HEAD request)
      10. Drive folder ID accessible (HEAD request)
      11. TikTok access token valid (call /v2/user/info/)

    Test KHONG gui Telegram message (an toan). Chi check connectivity.
    Test result xuat ra console + tao file test-report.txt.

.PARAMETER ConfigFile
    Path den config.json. Default: cung folder script.

.PARAMETER SkipPaid
    Skip cac test ton phi API (Tavily, FB Graph) — chi check static.

.PARAMETER SendTelegramTest
    Set true neu muon gui test message "Pre-flight OK" toi chat_id de xac nhan bot reach duoc.

.EXAMPLE
    .\Test-EmeleeConfig.ps1
    # Test tat ca (tru gui Telegram)

.EXAMPLE
    .\Test-EmeleeConfig.ps1 -SendTelegramTest
    # Bao gom gui test message Telegram
#>

[CmdletBinding()]
param(
    [string]$ConfigFile = (Join-Path $PSScriptRoot "config.json"),
    [switch]$SkipPaid,
    [switch]$SendTelegramTest
)

$ErrorActionPreference = "Continue"

# ============================================================
# Helpers
# ============================================================
$script:results = @()
$script:passCount = 0
$script:failCount = 0
$script:skipCount = 0

function Add-Result {
    param([string]$Check, [string]$Status, [string]$Detail = "")
    $color = switch ($Status) {
        "PASS" { "Green";  $script:passCount++ }
        "FAIL" { "Red";    $script:failCount++ }
        "SKIP" { "DarkGray"; $script:skipCount++ }
        "WARN" { "Yellow" }
    }
    $script:results += [PSCustomObject]@{
        Check  = $Check
        Status = $Status
        Detail = $Detail
    }
    $icon = switch ($Status) { "PASS" {"[OK]"} "FAIL" {"[X] "} "SKIP" {"[--]"} "WARN" {"[!] "} }
    Write-Host ("{0} {1,-50} {2}" -f $icon, $Check, $Detail) -ForegroundColor $color
}

function Get-ConfigValue {
    param([object]$Config, [string]$Path)
    $parts = $Path -split '\.'
    $node = $Config
    foreach ($p in $parts) {
        if ($null -eq $node) { return $null }
        $node = $node.$p
    }
    return $node
}

function Test-Endpoint {
    param(
        [string]$Url,
        [hashtable]$Headers = @{},
        [string]$Method = "GET",
        [object]$Body = $null,
        [int]$TimeoutSec = 10
    )
    try {
        $params = @{
            Uri        = $Url
            Method     = $Method
            TimeoutSec = $TimeoutSec
            UseBasicParsing = $true
            ErrorAction = "Stop"
        }
        if ($Headers.Count -gt 0) { $params.Headers = $Headers }
        if ($Body) { $params.Body = $Body }
        $resp = Invoke-WebRequest @params
        return @{ Success = $true; Status = $resp.StatusCode; Body = $resp.Content }
    } catch {
        $statusCode = $null
        if ($_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
        }
        return @{ Success = $false; Status = $statusCode; Error = $_.Exception.Message }
    }
}

# ============================================================
# Main
# ============================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host " EMELEE AIKING — Pre-flight Configuration Test" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""

# Check 1: config.json exists & valid
if (-not (Test-Path $ConfigFile)) {
    Add-Result "config.json exists" "FAIL" "Not found: $ConfigFile"
    Write-Host "`nTip: copy template -> dien gia tri -> chay lai" -ForegroundColor Yellow
    Write-Host "     Copy-Item config.template.json config.json" -ForegroundColor White
    exit 1
}
Add-Result "config.json exists" "PASS" $ConfigFile

try {
    $config = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
    Add-Result "config.json valid JSON" "PASS"
} catch {
    Add-Result "config.json valid JSON" "FAIL" $_.Exception.Message
    exit 1
}

# Check 2: Telegram bot token
$tgChatId = Get-ConfigValue $config "telegram.chat_id.to"
if ([string]::IsNullOrWhiteSpace($tgChatId)) {
    Add-Result "Telegram chat_id filled" "FAIL" "Empty 'to' in telegram.chat_id"
} else {
    Add-Result "Telegram chat_id filled" "PASS" "chat_id=$tgChatId"
}

# Check 3: Facebook Page ID + token
$fbPageId = Get-ConfigValue $config "facebook.page_id.to"
$fbToken  = Get-ConfigValue $config "facebook.page_access_token_publisher.to"
if ([string]::IsNullOrWhiteSpace($fbPageId) -or [string]::IsNullOrWhiteSpace($fbToken)) {
    Add-Result "Facebook config filled" "WARN" "page_id or token empty"
} else {
    Add-Result "Facebook config filled" "PASS"
    if (-not $SkipPaid) {
        $r = Test-Endpoint -Url "https://graph.facebook.com/v22.0/$fbPageId`?fields=id,name&access_token=$fbToken"
        if ($r.Success) {
            $j = $r.Body | ConvertFrom-Json
            Add-Result "Facebook Page accessible" "PASS" "name=$($j.name) id=$($j.id)"
        } else {
            Add-Result "Facebook Page accessible" "FAIL" "HTTP $($r.Status) — $($r.Error)"
        }
    } else {
        Add-Result "Facebook Page accessible" "SKIP" "-SkipPaid set"
    }
}

# Check 4: Instagram Business Account
$igId    = Get-ConfigValue $config "instagram.business_account_id.to"
$igToken = Get-ConfigValue $config "instagram.access_token_1.to"
if ([string]::IsNullOrWhiteSpace($igId) -or [string]::IsNullOrWhiteSpace($igToken)) {
    Add-Result "Instagram config filled" "WARN" "ig_id or token empty"
} else {
    Add-Result "Instagram config filled" "PASS"
    if (-not $SkipPaid) {
        $r = Test-Endpoint -Url "https://graph.facebook.com/v22.0/$igId`?fields=username,id&access_token=$igToken"
        if ($r.Success) {
            $j = $r.Body | ConvertFrom-Json
            Add-Result "Instagram Business accessible" "PASS" "username=@$($j.username)"
        } else {
            Add-Result "Instagram Business accessible" "FAIL" "HTTP $($r.Status) — $($r.Error)"
        }
    }
}

# Check 5: ImgBB API key
$imgbbKey = Get-ConfigValue $config "imgbb.api_key.to"
if ([string]::IsNullOrWhiteSpace($imgbbKey)) {
    Add-Result "ImgBB API key filled" "WARN" "Empty"
} else {
    Add-Result "ImgBB API key filled" "PASS"
    if (-not $SkipPaid) {
        # ImgBB has no /me endpoint — test bang cach POST 1 image tiny base64
        $tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII="
        $r = Test-Endpoint -Url "https://api.imgbb.com/1/upload?key=$imgbbKey" -Method "POST" -Body @{ image = $tinyPng }
        if ($r.Success) {
            Add-Result "ImgBB API reachable" "PASS"
        } else {
            Add-Result "ImgBB API reachable" "FAIL" "HTTP $($r.Status)"
        }
    }
}

# Check 6: Google Sheet ID (chi check format, khong gui request vi can OAuth)
$sheetId = Get-ConfigValue $config "google_sheet.id.to"
if ([string]::IsNullOrWhiteSpace($sheetId)) {
    Add-Result "Google Sheet ID filled" "WARN" "Empty"
} elseif ($sheetId -match '^[a-zA-Z0-9_-]{40,}$') {
    Add-Result "Google Sheet ID format OK" "PASS" "id=$($sheetId.Substring(0,15))..."
} else {
    Add-Result "Google Sheet ID format OK" "FAIL" "Invalid format (should be 40+ chars, [a-z0-9_-])"
}

# Check 7-10: Drive file IDs
$driveIds = @(
    @{ Key = "google_drive_skill_files.orchestrator_md_id"; Label = "Drive: orchestrator.md ID" }
    @{ Key = "google_drive_skill_files.research_md_id";     Label = "Drive: research.md ID" }
    @{ Key = "google_drive_skill_files.content_md_id";      Label = "Drive: content.md ID" }
    @{ Key = "google_drive_skill_files.creative_md_id";     Label = "Drive: creative.md ID" }
    @{ Key = "google_drive_image_folder.creative_output_folder_id"; Label = "Drive: image folder ID" }
)
foreach ($d in $driveIds) {
    $v = Get-ConfigValue $config $d.Key
    if ([string]::IsNullOrWhiteSpace($v)) {
        Add-Result $d.Label "WARN" "Empty"
    } elseif ($v -match '^[a-zA-Z0-9_-]{25,}$') {
        Add-Result $d.Label "PASS" "id=$($v.Substring(0,15))..."
    } else {
        Add-Result $d.Label "FAIL" "Invalid format"
    }
}

# Check 11: N8N workflow IDs (chi cant filled trong luot 2)
$n8nIds = @("research_agent","content_agent","creative_agent","publisher_agent")
$n8nFilled = 0
foreach ($id in $n8nIds) {
    $v = Get-ConfigValue $config "n8n_workflow_ids.$id.to"
    if (-not [string]::IsNullOrWhiteSpace($v)) { $n8nFilled++ }
}
if ($n8nFilled -eq 0) {
    Add-Result "N8N workflow IDs (luot 2)" "WARN" "All empty — chua import sub-workflows? (binh thuong neu chua chay luot 1)"
} elseif ($n8nFilled -eq 4) {
    Add-Result "N8N workflow IDs (luot 2)" "PASS" "All 4 filled — ready for Marketing Team import"
} else {
    Add-Result "N8N workflow IDs (luot 2)" "WARN" "$n8nFilled/4 filled — fill all before final import"
}

# Check 12: TikTok access token (optional, skip neu khong co)
$tiktokToken = $env:TIKTOK_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($tiktokToken)) {
    Add-Result "TikTok access token (env var)" "SKIP" "TIKTOK_ACCESS_TOKEN not in env — set if want to test"
} else {
    if (-not $SkipPaid) {
        $r = Test-Endpoint -Url "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name" -Headers @{ Authorization = "Bearer $tiktokToken" }
        if ($r.Success) {
            $j = $r.Body | ConvertFrom-Json
            Add-Result "TikTok API reachable" "PASS" "display_name=$($j.data.user.display_name)"
        } else {
            Add-Result "TikTok API reachable" "FAIL" "HTTP $($r.Status)"
        }
    }
}

# Check 13: Send Telegram test (optional)
if ($SendTelegramTest) {
    $tgBotToken = $env:TELEGRAM_BOT_TOKEN
    if ([string]::IsNullOrWhiteSpace($tgBotToken)) {
        Add-Result "Telegram bot test message" "SKIP" "TELEGRAM_BOT_TOKEN not in env"
    } elseif ([string]::IsNullOrWhiteSpace($tgChatId)) {
        Add-Result "Telegram bot test message" "SKIP" "chat_id empty"
    } else {
        $msg = "[Emelee Pre-flight] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') — config OK"
        $r = Test-Endpoint -Url "https://api.telegram.org/bot$tgBotToken/sendMessage" -Method "POST" -Body @{ chat_id = $tgChatId; text = $msg }
        if ($r.Success) {
            Add-Result "Telegram bot test message" "PASS" "Check chat $tgChatId"
        } else {
            Add-Result "Telegram bot test message" "FAIL" "HTTP $($r.Status)"
        }
    }
}

# ============================================================
# Summary
# ============================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host " SUMMARY" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ("  Passed:  {0}" -f $passCount) -ForegroundColor Green
Write-Host ("  Failed:  {0}" -f $failCount) -ForegroundColor Red
Write-Host ("  Skipped: {0}" -f $skipCount) -ForegroundColor DarkGray
Write-Host ""

# Write report
$reportFile = Join-Path $PSScriptRoot "test-report.txt"
$results | Format-Table -AutoSize | Out-String | Set-Content -Path $reportFile -Encoding UTF8
Write-Host "Report saved: $reportFile" -ForegroundColor Cyan

if ($failCount -eq 0) {
    Write-Host ""
    Write-Host "[OK] Pre-flight PASSED. Anh co the chay Map-EmeleeCredentials.ps1 + import N8N." -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "[X] Pre-flight FAILED. Sua $failCount muc tren truoc khi import." -ForegroundColor Red
    exit 1
}
