# RTL for Google Antigravity - Installation Script
# This script automates the installation of RTL support for Google Antigravity

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RTL for Google Antigravity - Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Find Antigravity installation
Write-Host "Step 1: Locating Google Antigravity..." -ForegroundColor Yellow
$AntigravityPath = "$env:LOCALAPPDATA\Programs\Antigravity"

if (Test-Path $AntigravityPath) {
    $ChatJsPath = Join-Path $AntigravityPath "resources\app\extensions\antigravity\out\media\chat.js"

    Write-Host "   Found: $AntigravityPath" -ForegroundColor Green

    if (Test-Path $ChatJsPath) {
        Write-Host "   Found chat.js" -ForegroundColor Green

        # Ask user if they want to inject
        $InjectAntigravity = Read-Host "`nDo you want to inject RTL support into Antigravity? (y/n)"

        if ($InjectAntigravity -eq 'y' -or $InjectAntigravity -eq 'Y') {
            # Backup
            $BackupPath = "$ChatJsPath.backup"
            if (-not (Test-Path $BackupPath)) {
                Copy-Item $ChatJsPath $BackupPath
                Write-Host "   Backup created: chat.js.backup" -ForegroundColor Green
            } else {
                Write-Host "   Backup already exists" -ForegroundColor Yellow
            }

            # Read the JS file
            $JsContent = Get-Content $ChatJsPath -Raw

            # Read RTL script (use the simple version for direct injection)
            $RtlScript = Get-Content (Join-Path $ScriptDir "rtl-antigravity-simple.js") -Raw

            # Check if already injected
            if ($JsContent -match "RTL Support for Google Antigravity") {
                Write-Host "   RTL script already injected!" -ForegroundColor Yellow
            } else {
                # Append the script to the end of chat.js
                $JsContent += "`n`n// RTL Support for Google Antigravity`n"
                $JsContent += $RtlScript

                # Write back to file
                Set-Content -Path $ChatJsPath -Value $JsContent -NoNewline
                Write-Host "   RTL script injected successfully!" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "   Error: chat.js not found at expected location" -ForegroundColor Red
        Write-Host "   Expected: $ChatJsPath" -ForegroundColor Gray
    }
} else {
    Write-Host "   Google Antigravity not found at $AntigravityPath" -ForegroundColor Yellow
    Write-Host "   Please install Antigravity or check the installation path" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart Google Antigravity" -ForegroundColor White
Write-Host "2. RTL support will be active in the agent chat!" -ForegroundColor White
Write-Host ""

# Ask if user wants to restart Antigravity
$RestartAntigravity = Read-Host "Do you want to restart Antigravity now? (y/n)"
if ($RestartAntigravity -eq 'y' -or $RestartAntigravity -eq 'Y') {
    Write-Host "Restarting Antigravity..." -ForegroundColor Cyan
    # Close Antigravity if running
    Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    # Start Antigravity
    $AntigravityExe = Join-Path $AntigravityPath "Antigravity.exe"
    if (Test-Path $AntigravityExe) {
        Start-Process $AntigravityExe
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
