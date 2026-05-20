<#
.SYNOPSIS
    Replace LinkedIn → TikTok trong các file workflow N8N của Emelee AIKING.

.DESCRIPTION
    Script thay thế an toàn các pattern liên quan LinkedIn trong workflow JSON N8N
    sang TikTok, giữ JSON valid và backup file gốc.

    KHÔNG tự động thay:
      - Credential name "LinkedIn OAuth2 API" (anh phải đổi tay sang TikTok credential)
      - URL endpoint api.linkedin.com (TikTok có Open API riêng — phải build node mới)
      - Post URL format linkedin.com/feed/update (TikTok không có dạng URL này)
    Script sẽ in WARNING cho các trường hợp này để anh xử lý tay sau.

.PARAMETER InputFolder
    Folder chứa các file workflow JSON gốc.
    Default: folder cùng cấp script tên "n8n-workflows-original"

.PARAMETER OutputFolder
    Folder đích để ghi file đã chuyển đổi.
    Default: folder cùng cấp script tên "n8n-workflows-emelee"

.PARAMETER BackupFolder
    Folder backup file gốc trước khi xử lý.
    Default: "$OutputFolder\_backup_YYYYMMDD_HHMMSS"

.EXAMPLE
    .\Replace-LinkedinToTikTok.ps1
    # Chạy mặc định với folder cùng cấp

.EXAMPLE
    .\Replace-LinkedinToTikTok.ps1 -InputFolder "C:\Users\ACER\Downloads\Workflow AI AIGent" -OutputFolder ".\out"
    # Chỉ định folder cụ thể
#>

[CmdletBinding()]
param(
    [string]$InputFolder  = (Join-Path $PSScriptRoot "n8n-workflows-original"),
    [string]$OutputFolder = (Join-Path $PSScriptRoot "n8n-workflows-emelee"),
    [string]$BackupFolder = ""
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
if ([string]::IsNullOrWhiteSpace($BackupFolder)) {
    $BackupFolder = Join-Path $OutputFolder "_backup_$stamp"
}

# ============================================================
# 1. Replacement map (THỨ TỰ QUAN TRỌNG — longest first để tránh nested replace)
# ============================================================
$replacements = @(
    # JSON keys (snake_case variable names — replace TRƯỚC vì có underscore)
    @{ From = 'content_linkedin'; To = 'content_tiktok'; Note = 'snake_case key' }
    @{ From = 'img_linkedin';     To = 'img_tiktok';     Note = 'snake_case key' }

    # JSON keys (space-separated, double-quote — trong schema definition)
    @{ From = '"content linkedin"'; To = '"content tiktok"'; Note = 'JSON key (double-quote)' }
    @{ From = '"img linkedin"';     To = '"img tiktok"';     Note = 'JSON key (double-quote)' }

    # JSON keys (single-quote — trong N8N expression $json['content linkedin'])
    @{ From = "'content linkedin'"; To = "'content tiktok'"; Note = 'JSON key (single-quote)' }
    @{ From = "'img linkedin'";     To = "'img tiktok'";     Note = 'JSON key (single-quote)' }

    # Google Sheet column names (double-quote — schema)
    @{ From = '"Content Linkedin"'; To = '"Content Tiktok"'; Note = 'Sheet column (double-quote)' }

    # Google Sheet column names (single-quote — $json['Content Linkedin'])
    @{ From = "'Content Linkedin'"; To = "'Content Tiktok'"; Note = 'Sheet column (single-quote)' }

    # Sheet column "Linkedin" — đặt sau Content Linkedin để không bị nuốt
    @{ From = '"Linkedin"';         To = '"TikTok"';         Note = 'Sheet column' }
    @{ From = "'Linkedin'";         To = "'TikTok'";         Note = 'Sheet column (single-quote)' }

    # JSON keys with ESCAPED quotes (xuất hiện trong prompt JSON-in-string)
    @{ From = '\"content linkedin\"'; To = '\"content tiktok\"'; Note = 'JSON key (escaped quote)' }
    @{ From = '\"img linkedin\"';     To = '\"img tiktok\"';     Note = 'JSON key (escaped quote)' }
    @{ From = '\"Content Linkedin\"'; To = '\"Content Tiktok\"'; Note = 'Sheet column (escaped quote)' }
    @{ From = '\"json linkedin\"';    To = '\"json tiktok\"';    Note = 'Creative JSON key (escaped)' }
    @{ From = '\"Linkedin\"';         To = '\"TikTok\"';         Note = 'Sheet column (escaped quote)' }

    # Creative agent: json keys
    @{ From = '"json linkedin"';    To = '"json tiktok"';    Note = 'Creative JSON key' }
    @{ From = "'json linkedin'";    To = "'json tiktok'";    Note = 'Creative JSON key (single-quote in code)' }

    # AI Agent prompt text — case-sensitive trong description
    # "LinkedIn" trong text mô tả
    @{ From = 'cho LinkedIn';        To = 'cho TikTok';        Note = 'Description text' }
    @{ From = 'cho Linkedin';        To = 'cho TikTok';        Note = 'Description text' }
    @{ From = 'phien ban Linkedin';  To = 'phien ban TikTok';  Note = 'Description text (no diacritics)' }
    @{ From = 'phiên bản Linkedin';  To = 'phiên bản TikTok';  Note = 'Description text (Vietnamese)' }
    @{ From = 'content Linkedin';    To = 'content TikTok';    Note = 'Description text' }
    @{ From = 'đăng Linkedin';      To = 'đăng TikTok';      Note = 'Telegram message' }
    @{ From = 'đăng LinkedIn';      To = 'đăng TikTok';      Note = 'Telegram message' }

    # Field name trong Set node (Edit Fields)
    @{ From = '"name": "Linkedin"'; To = '"name": "TikTok"'; Note = 'Set node field name' }
    @{ From = '$json.Linkedin';     To = '$json.TikTok';     Note = 'Field reference' }

    # Pinned text/labels
    @{ From = 'Linkedin:';          To = 'TikTok:';          Note = 'Label in text' }
)

# Regex-based fallback — chạy SAU literal replacements
# Bắt mọi "Linkedin" (Pascal-case, lowercase n) còn sót, NHƯNG KHÔNG match:
#   - linkedIn  (camelCase, dùng cho linkedInOAuth2Api node type)
#   - LinkedIn  (correct case, dùng cho credential name UI label)
#   - linkedin.com (URL)
$regexReplacements = @(
    @{ Pattern = '\bLinkedin\b';           To = 'TikTok';   Note = 'Standalone Linkedin (Pascal-case)' }
)

# Các pattern KHÔNG được tự replace — chỉ WARN
$warnPatterns = @(
    @{ Pattern = 'LinkedIn OAuth2 API';                  Reason = 'Credential name — cần đổi credential thật sang TikTok Open API trong N8N (Settings → Credentials)' }
    @{ Pattern = 'linkedInOAuth2Api';                    Reason = 'Credential TYPE name — N8N không có TikTok native credential type, dùng HTTP Header Auth thay thế' }
    @{ Pattern = 'n8n-nodes-base\.linkedIn';             Reason = 'Node type LinkedIn — cần thay node bằng HTTP Request gọi TikTok Open API' }
    @{ Pattern = 'api\.linkedin\.com';                   Reason = 'API endpoint — TikTok Open API có URL khác (open.tiktokapis.com), phải build lại HTTP Request node' }
    @{ Pattern = 'https://www\.linkedin\.com/feed';      Reason = 'Post URL format LinkedIn — TikTok video URL format khác (https://www.tiktok.com/@user/video/{id})' }
    @{ Pattern = 'urn:li:';                              Reason = 'LinkedIn URN — TikTok không dùng URN' }
    @{ Pattern = 'ugcPosts';                             Reason = 'LinkedIn UGC API — TikTok dùng /v2/post/publish/video/init/' }
)

# ============================================================
# 2. Helper functions
# ============================================================
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $color = switch ($Level) {
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "INFO"  { "Cyan" }
        default { "White" }
    }
    Write-Host "[$Level] $Message" -ForegroundColor $color
}

function Test-JsonValid {
    param([string]$Content)
    try {
        $null = $Content | ConvertFrom-Json
        return $true
    } catch {
        return $false
    }
}

function Convert-OneFile {
    param(
        [string]$InputFile,
        [string]$OutputFile,
        [string]$BackupFile
    )

    Write-Log "──────────────────────────────────────────"
    Write-Log "Processing: $(Split-Path $InputFile -Leaf)" "INFO"

    # Backup
    Copy-Item -Path $InputFile -Destination $BackupFile -Force
    Write-Log "  Backup → $(Split-Path $BackupFile -Leaf)" "OK"

    # Read raw text (preserve encoding)
    $content = Get-Content -Path $InputFile -Raw -Encoding UTF8

    # Validate JSON gốc trước
    if (-not (Test-JsonValid $content)) {
        Write-Log "  File JSON gốc không valid — bỏ qua" "ERROR"
        return $null
    }

    $stats = @{}
    $original = $content

    # Apply each literal replacement
    foreach ($r in $replacements) {
        # Count occurrences before replace (case-sensitive)
        $count = ([regex]::Matches($content, [regex]::Escape($r.From), 'None')).Count
        if ($count -gt 0) {
            $content = $content.Replace($r.From, $r.To)
            $stats[$r.From] = $count
            Write-Log ("  Replaced {0,3}× : {1,-35} → {2}" -f $count, $r.From, $r.To) "OK"
        }
    }

    # Apply regex fallback replacements (sau literal vì literal cụ thể hơn)
    foreach ($r in $regexReplacements) {
        $matches = [regex]::Matches($content, $r.Pattern)
        if ($matches.Count -gt 0) {
            $content = [regex]::Replace($content, $r.Pattern, $r.To)
            $stats["[regex] $($r.Pattern)"] = $matches.Count
            Write-Log ("  Regex    {0,3}× : {1,-35} → {2}" -f $matches.Count, $r.Pattern, $r.To) "OK"
        }
    }

    # Validate JSON sau khi replace
    if (-not (Test-JsonValid $content)) {
        Write-Log "  JSON BROKEN sau khi replace — restore original" "ERROR"
        return $null
    }

    # Check warnings
    foreach ($w in $warnPatterns) {
        $matches = [regex]::Matches($content, $w.Pattern, 'IgnoreCase')
        if ($matches.Count -gt 0) {
            Write-Log "  WARNING: tìm thấy $($matches.Count)× pattern '$($w.Pattern)'" "WARN"
            Write-Log "           → $($w.Reason)" "WARN"
        }
    }

    # Write output WITHOUT BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($OutputFile, $content, $utf8NoBom)
    Write-Log "  Wrote → $(Split-Path $OutputFile -Leaf)" "OK"

    return $stats
}

# ============================================================
# 3. Main
# ============================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host " EMELEE AIKING — LinkedIn → TikTok JSON Converter" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""

# Verify input folder
if (-not (Test-Path $InputFolder)) {
    Write-Log "Input folder không tồn tại: $InputFolder" "ERROR"
    Write-Log "Tip: đặt 4 file JSON gốc (Marketing Team / Content / Creative / Publisher) vào folder này rồi chạy lại." "INFO"
    exit 1
}

# Get JSON files
$jsonFiles = Get-ChildItem -Path $InputFolder -Filter "*.json" -File
if ($jsonFiles.Count -eq 0) {
    Write-Log "Không tìm thấy file .json nào trong: $InputFolder" "ERROR"
    exit 1
}

Write-Log "Found $($jsonFiles.Count) file(s) in: $InputFolder" "INFO"
Write-Log "Output → $OutputFolder" "INFO"
Write-Log "Backup → $BackupFolder" "INFO"

# Create folders
if (-not (Test-Path $OutputFolder)) { New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null }
if (-not (Test-Path $BackupFolder)) { New-Item -ItemType Directory -Path $BackupFolder -Force | Out-Null }

# Process
$totalStats = @{}
$processedCount = 0
$failedCount = 0

foreach ($file in $jsonFiles) {
    $outputFile = Join-Path $OutputFolder $file.Name
    $backupFile = Join-Path $BackupFolder $file.Name

    $stats = Convert-OneFile -InputFile $file.FullName -OutputFile $outputFile -BackupFile $backupFile
    if ($null -ne $stats) {
        $processedCount++
        foreach ($k in $stats.Keys) {
            if ($totalStats.ContainsKey($k)) {
                $totalStats[$k] += $stats[$k]
            } else {
                $totalStats[$k] = $stats[$k]
            }
        }
    } else {
        $failedCount++
    }
}

# ============================================================
# 4. Summary
# ============================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host " SUMMARY" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Log "Processed: $processedCount file(s)" "OK"
if ($failedCount -gt 0) { Write-Log "Failed:    $failedCount file(s)" "ERROR" }

if ($totalStats.Count -gt 0) {
    Write-Host ""
    Write-Log "Replacement counts:" "INFO"
    $totalStats.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
        $key = $_.Key
        $count = $_.Value
        $match = $replacements | Where-Object { $_.From -eq $key } | Select-Object -First 1
        $to = if ($match) { $match.To } else { '?' }
        Write-Host ("    {0,4}x {1,-35} -> {2}" -f $count, $key, $to) -ForegroundColor White
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host " VIỆC CÒN PHẢI LÀM TAY (script không làm được)" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host @"

1. CREDENTIAL trong N8N
   - Vào Settings → Credentials → xoá hoặc disable 'LinkedIn OAuth2 API'
   - Tạo mới: TikTok Open API credential (cần TikTok Developer App + access token)
   - Map credential mới vào node 'HTTP Request' đang gọi TikTok

2. API ENDPOINT trong Publisher Agent
   - Tìm node có URL: api.linkedin.com/v2/ugcPosts
   - Thay bằng TikTok API flow (3 bước):
       a. POST https://open.tiktokapis.com/v2/post/publish/video/init/
       b. PUT video binary lên upload_url
       c. POST https://open.tiktokapis.com/v2/post/publish/status/fetch/

3. POST URL FORMAT trong Sheet logging
   - LinkedIn: https://www.linkedin.com/feed/update/{urn}
   - TikTok:   https://www.tiktok.com/@USERNAME/video/{publish_id}
   - Cần parse publish_id từ TikTok API response

4. APPROVAL FLOW
   - Telegram approval cho TikTok đã có sẵn (replace text)
   - Nhưng nội dung approve thường có cả caption + thumbnail
   - Nên upload thumbnail riêng (TikTok cần thumbnail URL hoặc cover frame)

5. UPLOAD ẢNH/VIDEO
   - TikTok cần VIDEO file (mp4) — không nhận ảnh tĩnh như LinkedIn
   - Nếu muốn đăng ảnh tĩnh → dùng "TikTok Photo Mode" (image carousel)
   - Workflow Creative hiện chỉ tạo IMAGE — cần extend để dựng video hoặc dùng photo mode

6. RATE LIMIT
   - TikTok Open API giới hạn 6 post/ngày/user (sandbox), 100/ngày (production)
   - Thêm node "Wait" hoặc kiểm tra quota trước khi post

"@
Write-Host ""

if ($failedCount -eq 0) {
    Write-Log "Hoàn thành. File output ở: $OutputFolder" "OK"
} else {
    Write-Log "Một số file bị lỗi — xem log phía trên" "WARN"
    exit 1
}
