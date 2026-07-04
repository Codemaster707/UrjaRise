# UrjaRise Card Repair Script
# Idempotent - safe to run multiple times

param(
    [string]$CardFolder = "."
)

# Rarity configuration
$RarityConfig = @{
    "common"   = @{ Range = 1..30;  Image = "common.jpg";   BgColor = "#071106" }
    "rare"     = @{ Range = 31..50; Image = "rare.jpg";     BgColor = "#2b0a4d" }
    "uncommon" = @{ Range = 51..60; Image = "uncommon.jpg"; BgColor = "#0a1f4d" }
    "epic"     = @{ Range = 61..70; Image = "Epic.jpg";     BgColor = "#b86b00" }
    "legend"   = @{ Range = 71..80; Image = "Epic.jpg";     BgColor = "#b86b00" }
    "mythical" = @{ Range = 81..90; Image = "Mythical.jpg"; BgColor = "#2b0a4d" }
}

function Get-CardRarity {
    param([int]$CardNum)
    foreach ($tier in $RarityConfig.GetEnumerator()) {
        if ($tier.Value.Range -contains $CardNum) {
            return $tier.Value
        }
    }
    throw "Card number $CardNum out of range (1-90)"
}

$htmlFiles = Get-ChildItem -Path $CardFolder -Filter "card*.html" |
    Where-Object { $_.Name -match '^card(\d+)\.html$' } |
    Sort-Object { [int]($_.Name -replace '[^\d]','') }

if ($htmlFiles.Count -eq 0) {
    Write-Host "No card HTML files found in: $CardFolder" -ForegroundColor Red
    exit 1
}

Write-Host "Found $($htmlFiles.Count) card files. Starting repair..." -ForegroundColor Cyan
Write-Host ""

$fixed = 0
$skipped = 0
$errors = 0

foreach ($file in $htmlFiles) {
    $file.Name -match '^card(\d+)\.html$' | Out-Null
    $cardNum = [int]$Matches[1]

    try {
        $rarity = Get-CardRarity -CardNum $cardNum
        $content = Get-Content $file.FullName -Raw -Encoding UTF8

        $original = $content

        # --- 1. Fix front image ---
        # Matches any src="card...A.jpg" or src="card...A" variant (with or without space, with or without .jpg)
        $content = $content -replace 'src="card\s*\d*\s*A(?:\.jpg)?"', "src=""card ${cardNum}A.jpg"""

        # --- 2. Fix rarity (back) image ---
        # Matches common/rare/uncommon/Epic/Legendary/Mythical etc. with or without .jpg
        $content = $content -replace 'src="(?:common|rare|uncommon|Epic|Legendary|Mythical|legend)(?:\.jpg)?"', "src=""$($rarity.Image)"""

        # --- 3. Fix background color ---
        # Matches background:#xxxxxx with any 6-char hex (with or without spaces around colon)
        $content = $content -replace 'background\s*:\s*#[0-9a-fA-F]{6}', "background:$($rarity.BgColor)"

        if ($content -ne $original) {
            Set-Content $file.FullName -Value $content -Encoding UTF8 -NoNewline
            Write-Host "  FIXED  card$cardNum.html  →  front: card ${cardNum}A.jpg  |  rarity: $($rarity.Image)  |  bg: $($rarity.BgColor)" -ForegroundColor Green
            $fixed++
        } else {
            Write-Host "  OK     card$cardNum.html  (no changes needed)" -ForegroundColor DarkGray
            $skipped++
        }

    } catch {
        Write-Host "  ERROR  $($file.Name): $_" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Repair complete." -ForegroundColor Cyan
Write-Host "  Fixed:   $fixed files" -ForegroundColor Green
Write-Host "  OK:      $skipped files (already correct)" -ForegroundColor DarkGray
if ($errors -gt 0) {
    Write-Host "  Errors:  $errors files" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan