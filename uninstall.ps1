# RTL for VS Code Agents - Uninstall Script
# This script removes all RTL injections and restores original files

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RTL for VS Code Agents - Uninstaller" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$RestoredCount = 0
$ErrorCount = 0

# 1. Restore Claude Code
Write-Host "Step 1: Restoring Claude Code..." -ForegroundColor Yellow
$ExtensionsPath = "$env:USERPROFILE\.vscode\extensions"
$ClaudeExtension = Get-ChildItem -Path $ExtensionsPath -Filter "anthropic.claude-code-*" -Directory | Select-Object -First 1

if ($ClaudeExtension) {
    $WebviewPath = Join-Path $ClaudeExtension.FullName "webview"
    $IndexJs = Join-Path $WebviewPath "index.js"
    $BackupPath = "$IndexJs.backup"

    if (Test-Path $BackupPath) {
        try {
            Remove-Item $IndexJs -Force
            Move-Item $BackupPath $IndexJs
            Write-Host "   ✓ Restored index.js from backup" -ForegroundColor Green
            $RestoredCount++
        } catch {
            Write-Host "   ✗ Error restoring index.js: $_" -ForegroundColor Red
            $ErrorCount++
        }
    } else {
        Write-Host "   - No backup found (index.js.backup)" -ForegroundColor Gray
    }
} else {
    Write-Host "   - Claude Code extension not found" -ForegroundColor Gray
}

Write-Host ""

# 2. Restore Google Antigravity
Write-Host "Step 2: Restoring Google Antigravity..." -ForegroundColor Yellow
$AntigravityPath = "$env:LOCALAPPDATA\Programs\Antigravity"

if (Test-Path $AntigravityPath) {
    $ChatJsPath = Join-Path $AntigravityPath "resources\app\extensions\antigravity\out\media\chat.js"
    $BackupPath = "$ChatJsPath.backup"

    if (Test-Path $BackupPath) {
        try {
            Remove-Item $ChatJsPath -Force
            Move-Item $BackupPath $ChatJsPath
            Write-Host "   ✓ Restored chat.js from backup" -ForegroundColor Green
            $RestoredCount++
        } catch {
            Write-Host "   ✗ Error restoring chat.js: $_" -ForegroundColor Red
            $ErrorCount++
        }
    } else {
        Write-Host "   - No backup found (chat.js.backup)" -ForegroundColor Gray
    }
} else {
    Write-Host "   - Google Antigravity not found" -ForegroundColor Gray
}

Write-Host ""

# 3. Clean up settings.json (optional)
Write-Host "Step 3: Cleaning settings.json..." -ForegroundColor Yellow
$SettingsPath = "$env:APPDATA\Code\User\settings.json"

if (Test-Path $SettingsPath) {
    $RemoveFromSettings = Read-Host "Do you want to remove RTL script from settings.json? (y/n)"

    if ($RemoveFromSettings -eq 'y' -or $RemoveFromSettings -eq 'Y') {
        try {
            $Settings = Get-Content $SettingsPath -Raw | ConvertFrom-Json

            if ($Settings.PSObject.Properties['vscode_custom_css.imports']) {
                # Filter out RTL script entries
                $Settings.'vscode_custom_css.imports' = $Settings.'vscode_custom_css.imports' | Where-Object {
                    $_ -notmatch 'rtl-for-vscode-agents\.js'
                }

                # Remove the property if array is empty
                if ($Settings.'vscode_custom_css.imports'.Count -eq 0) {
                    $Settings.PSObject.Properties.Remove('vscode_custom_css.imports')
                }

                # Save settings
                $Settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsPath
                Write-Host "   ✓ Removed RTL script from settings.json" -ForegroundColor Green
                $RestoredCount++
            } else {
                Write-Host "   - No vscode_custom_css.imports found in settings" -ForegroundColor Gray
            }
        } catch {
            Write-Host "   ✗ Error updating settings.json: $_" -ForegroundColor Red
            $ErrorCount++
        }
    } else {
        Write-Host "   - Skipped settings.json cleanup" -ForegroundColor Gray
    }
} else {
    Write-Host "   - settings.json not found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Uninstall Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "   Files restored: $RestoredCount" -ForegroundColor $(if ($RestoredCount -gt 0) { "Green" } else { "Gray" })
Write-Host "   Errors: $ErrorCount" -ForegroundColor $(if ($ErrorCount -gt 0) { "Red" } else { "Gray" })
Write-Host ""

if ($RestoredCount -gt 0) {
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart VS Code and Antigravity" -ForegroundColor White
    Write-Host "2. RTL support has been removed" -ForegroundColor White
    Write-Host ""

    # Ask if user wants to restart
    $Restart = Read-Host "Do you want to restart VS Code now? (y/n)"
    if ($Restart -eq 'y' -or $Restart -eq 'Y') {
        Write-Host "Restarting VS Code..." -ForegroundColor Cyan
        Get-Process -Name "Code" -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 2
        Start-Process "code"
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
