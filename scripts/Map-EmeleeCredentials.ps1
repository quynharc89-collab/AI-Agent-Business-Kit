<#
.SYNOPSIS
    Map 18 hard-coded credentials/IDs cua he AIKING → gia tri Emelee theo config.json.

.DESCRIPTION
    Doc config.json (copy tu config.template.json va dien gia tri 'to'),
    loop qua tat ca file workflow JSON va replace literal cac gia tri tu 'from' → 'to'.

    Workflow:
      1. Setup FB/IG/Telegram/Drive/Sheet → dien vao config.json
      2. Chay script lan 1 → ra file output
      3. Import 4 sub-workflows vao N8N → copy ID moi
      4. Cap nhat config.json voi N8N workflow IDs
      5. Chay script lan 2 → cap nhat Marketing Team Agent
      6. Import Marketing Team Agent

    Field nao 'to' bo trong se duoc SKIP (khong replace) → an toan chay nhieu lan.

.PARAMETER ConfigFile
    Path den config.json. Default: cung folder script.

.PARAMETER InputFolder
    Folder chua workflow JSON da chuyen LinkedIn → TikTok.
    Default: scripts/n8n-workflows-emelee/

.PARAMETER OutputFolder
    Folder dich. Default: scripts/n8n-workflows-emelee-final/

.EXAMPLE
    .\Map-EmeleeCredentials.ps1
    # Chay voi default folders + ./config.json

.EXAMPLE
    .\Map-EmeleeCredentials.ps1 -ConfigFile .\my-config.json
#>

[CmdletBinding()]
param(
    [string]$ConfigFile   = (Join-Path $PSScriptRoot "config.json"),
    [string]$InputFolder  = (Join-Path $PSScriptRoot "n8n-workflows-emelee"),
    [string]$OutputFolder = (Join-Path $PSScriptRoot "n8n-workflows-emelee-final"),
    [string]$BackupFolder = ""
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
if ([string]::IsNullOrWhiteSpace($BackupFolder)) {
    $BackupFolder = Join-Path $OutputFolder "_backup_$stamp"
}

# ============================================================
# Helper functions
# ============================================================
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $color = switch ($Level) {
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "INFO"  { "Cyan" }
        "SKIP"  { "DarkGray" }
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

# Recursive: extract tat ca cap (from, to, key path) tu config object
function Get-MappingPairs {
    param(
        [object]$Node,
        [string]$Path = ""
    )
    $result = @()
    foreach ($prop in $Node.PSObject.Properties) {
        if ($prop.Name.StartsWith("_")) { continue }  # skip _comment, _workflow
        $childPath = if ($Path) { "$Path.$($prop.Name)" } else { $prop.Name }
        $val = $prop.Value
        if ($val -is [PSCustomObject]) {
            if ($val.PSObject.Properties.Name -contains "from" -and $val.PSObject.Properties.Name -contains "to") {
                $result += [PSCustomObject]@{
                    Key   = $childPath
                    From  = $val.from
                    To    = $val.to
                    Desc  = if ($val.PSObject.Properties.Name -contains "description") { $val.description } else { "" }
                }
            } else {
                $result += Get-MappingPairs -Node $val -Path $childPath
            }
        }
    }
    return $result
}

function Convert-OneFile {
    param(
        [string]$InputFile,
        [string]$OutputFile,
        [string]$BackupFile,
        [object[]]$Mappings
    )

    Write-Log "------------------------------------------"
    Write-Log "Processing: $(Split-Path $InputFile -Leaf)" "INFO"

    Copy-Item -Path $InputFile -Destination $BackupFile -Force

    $content = Get-Content -Path $InputFile -Raw -Encoding UTF8

    if (-not (Test-JsonValid $content)) {
        Write-Log "  JSON goc khong valid — bo qua" "ERROR"
        return $null
    }

    $stats = @{}
    $totalReplaced = 0

    foreach ($m in $Mappings) {
        if ([string]::IsNullOrWhiteSpace($m.To)) {
            continue  # skip empty 'to'
        }
        if ($m.From -eq $m.To) {
            continue  # skip identical
        }
        $count = ([regex]::Matches($content, [regex]::Escape($m.From), 'None')).Count
        if ($count -gt 0) {
            $content = $content.Replace($m.From, $m.To)
            $stats[$m.Key] = $count
            $totalReplaced += $count
            $fromShort = if ($m.From.Length -gt 30) { $m.From.Substring(0, 30) + "..." } else { $m.From }
            $toShort = if ($m.To.Length -gt 30) { $m.To.Substring(0, 30) + "..." } else { $m.To }
            Write-Log ("  {0,3}x {1,-40} {2} -> {3}" -f $count, $m.Key, $fromShort, $toShort) "OK"
        }
    }

    if ($totalReplaced -eq 0) {
        Write-Log "  No changes" "SKIP"
    }

    if (-not (Test-JsonValid $content)) {
        Write-Log "  JSON BROKEN sau khi replace — restore original" "ERROR"
        return $null
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($OutputFile, $content, $utf8NoBom)

    return $stats
}

# ============================================================
# Main
# ============================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host " EMELEE AIKING — Credential & ID Mapper" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""

if (-not (Test-Path $ConfigFile)) {
    Write-Log "Config file khong ton tai: $ConfigFile" "ERROR"
    $template = Join-Path $PSScriptRoot "config.template.json"
    if (Test-Path $template) {
        Write-Log "Tip: copy template va dien gia tri:" "INFO"
        Write-Log "     Copy-Item '$template' '$ConfigFile'" "INFO"
    }
    exit 1
}

if (-not (Test-Path $InputFolder)) {
    Write-Log "Input folder khong ton tai: $InputFolder" "ERROR"
    Write-Log "Tip: chay Replace-LinkedinToTikTok.ps1 truoc de tao folder nay." "INFO"
    exit 1
}

# Load config
$config = Get-Content -Path $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
$mappings = Get-MappingPairs -Node $config

# Show summary truoc khi chay
$filled = @($mappings | Where-Object { -not [string]::IsNullOrWhiteSpace($_.To) })
$empty  = @($mappings | Where-Object { [string]::IsNullOrWhiteSpace($_.To) })

Write-Log "Total mappings:        $($mappings.Count)" "INFO"
Write-Log "Filled (will replace): $($filled.Count)" "OK"
Write-Log "Empty (will skip):     $($empty.Count)" "SKIP"
Write-Host ""

if ($empty.Count -gt 0) {
    Write-Log "Empty mappings (SE BO QUA):" "WARN"
    foreach ($e in $empty) {
        Write-Log "  - $($e.Key)" "SKIP"
    }
    Write-Host ""
}

if ($filled.Count -eq 0) {
    Write-Log "Khong co mapping nao co gia tri 'to' — khong co gi de lam" "ERROR"
    Write-Log "Tip: mo $ConfigFile va dien gia tri vao truong 'to'" "INFO"
    exit 1
}

# Create folders
$jsonFiles = Get-ChildItem -Path $InputFolder -Filter "*.json" -File
if ($jsonFiles.Count -eq 0) {
    Write-Log "Khong tim thay file JSON trong: $InputFolder" "ERROR"
    exit 1
}
if (-not (Test-Path $OutputFolder)) { New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null }
if (-not (Test-Path $BackupFolder)) { New-Item -ItemType Directory -Path $BackupFolder -Force | Out-Null }

Write-Log "Input  -> $InputFolder" "INFO"
Write-Log "Output -> $OutputFolder" "INFO"
Write-Log "Backup -> $BackupFolder" "INFO"

# Process
$totalStats = @{}
$processedCount = 0
$failedCount = 0

foreach ($file in $jsonFiles) {
    $outputFile = Join-Path $OutputFolder $file.Name
    $backupFile = Join-Path $BackupFolder $file.Name

    $stats = Convert-OneFile -InputFile $file.FullName -OutputFile $outputFile -BackupFile $backupFile -Mappings $mappings
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

# Summary
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host " SUMMARY" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Log "Processed: $processedCount file(s)" "OK"
if ($failedCount -gt 0) { Write-Log "Failed:    $failedCount file(s)" "ERROR" }
Write-Host ""

if ($totalStats.Count -gt 0) {
    Write-Log "Replacement counts by mapping key:" "INFO"
    $totalStats.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
        Write-Host ("    {0,4}x  {1}" -f $_.Value, $_.Key) -ForegroundColor White
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host " NEXT STEPS" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

if ($empty.Count -gt 0) {
    $emptyN8N = @($empty | Where-Object { $_.Key -match '^n8n_workflow_ids' })
    if ($emptyN8N.Count -gt 0) {
        Write-Host ""
        Write-Host "N8N WORKFLOW IDS chua co — chay lai sau khi import:" -ForegroundColor Yellow
        foreach ($e in $emptyN8N) {
            Write-Host "  - $($e.Key)" -ForegroundColor DarkYellow
        }
        Write-Host @"

  Workflow:
    1. Import 4 sub-workflow JSON vao N8N (Research/Content/Creative/Publisher)
    2. Vao moi workflow → copy ID tu URL (dang sau /workflow/)
    3. Dien vao config.json (n8n_workflow_ids.*.to)
    4. Chay lai script
    5. Import Marketing Team Agent
"@ -ForegroundColor White
    }
}

Write-Host ""
if ($failedCount -eq 0) {
    Write-Log "Hoan thanh. File output o: $OutputFolder" "OK"
} else {
    Write-Log "Mot so file bi loi" "WARN"
    exit 1
}
