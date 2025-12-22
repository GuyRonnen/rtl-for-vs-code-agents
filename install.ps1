# RTL for VS Code Agents - Installation Script
# This script automates the installation process for Windows

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RTL for VS Code Agents - Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Find Claude Code extension folder
Write-Host "Step 1: Locating Claude Code extension..." -ForegroundColor Yellow
$ExtensionsPath = "$env:USERPROFILE\.vscode\extensions"
$ClaudeExtension = Get-ChildItem -Path $ExtensionsPath -Filter "anthropic.claude-code-*" -Directory | Select-Object -First 1

if ($ClaudeExtension) {
    $WebviewPath = Join-Path $ClaudeExtension.FullName "webview"
    $IndexJs = Join-Path $WebviewPath "index.js"

    Write-Host "   Found: $($ClaudeExtension.Name)" -ForegroundColor Green

    # Ask user if they want to inject into Claude Code
    $InjectClaude = Read-Host "`nDo you want to inject RTL support into Claude Code? (y/n)"

    if ($InjectClaude -eq 'y' -or $InjectClaude -eq 'Y') {
        if (Test-Path $IndexJs) {
            # Backup
            $BackupPath = "$IndexJs.backup"
            if (-not (Test-Path $BackupPath)) {
                Copy-Item $IndexJs $BackupPath
                Write-Host "   Backup created: index.js.backup" -ForegroundColor Green
            } else {
                Write-Host "   Backup already exists" -ForegroundColor Yellow
            }

            # Inject
            $RtlScript = Get-Content (Join-Path $ScriptDir "claude-code-rtl-simple.js") -Raw
            Add-Content -Path $IndexJs -Value "`n$RtlScript"
            Write-Host "   RTL script injected successfully!" -ForegroundColor Green
        } else {
            Write-Host "   Error: index.js not found in webview folder" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   Claude Code extension not found" -ForegroundColor Yellow
    Write-Host "   Skipping Claude Code injection" -ForegroundColor Yellow
}

Write-Host ""

# 2. Find Google Antigravity
Write-Host "Step 2: Locating Google Antigravity..." -ForegroundColor Yellow
$AntigravityPath = "$env:LOCALAPPDATA\Programs\Antigravity"

if (Test-Path $AntigravityPath) {
    $ChatJsPath = Join-Path $AntigravityPath "resources\app\extensions\antigravity\out\media\chat.js"

    Write-Host "   Found: Antigravity" -ForegroundColor Green

    # Ask user if they want to inject into Antigravity
    $InjectAntigravity = Read-Host "`nDo you want to inject RTL support into Antigravity? (y/n)"

    if ($InjectAntigravity -eq 'y' -or $InjectAntigravity -eq 'Y') {
        if (Test-Path $ChatJsPath) {
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
                Set-Content -Path $ChatJsPath -Value $JsContent -NoNewline
                Write-Host "   RTL script injected successfully!" -ForegroundColor Green
            }
        } else {
            Write-Host "   Error: chat.js not found" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   Google Antigravity not found" -ForegroundColor Yellow
    Write-Host "   Skipping Antigravity injection" -ForegroundColor Yellow
}

Write-Host ""

# 3. Set up Custom CSS and JS Loader
Write-Host "Step 3: Configuring Custom CSS and JS Loader..." -ForegroundColor Yellow

# Find settings.json
$SettingsPath = "$env:APPDATA\Code\User\settings.json"

Write-Host "   Settings file: $SettingsPath" -ForegroundColor Cyan

# Ask user where to save the main script
Write-Host ""
Write-Host "Where do you want to save the RTL script?" -ForegroundColor Cyan
Write-Host "   Default: $env:USERPROFILE\vscode-custom" -ForegroundColor Gray
$CustomPath = Read-Host "Press Enter for default, or enter custom path"

if ([string]::IsNullOrWhiteSpace($CustomPath)) {
    $CustomPath = "$env:USERPROFILE\vscode-custom"
}

# Create directory if it doesn't exist
if (-not (Test-Path $CustomPath)) {
    New-Item -ItemType Directory -Path $CustomPath -Force | Out-Null
    Write-Host "   Created directory: $CustomPath" -ForegroundColor Green
}

# Copy the main RTL script
$DestScript = Join-Path $CustomPath "rtl-for-vscode-agents.js"
Copy-Item (Join-Path $ScriptDir "rtl-for-vs-code-agents.js") $DestScript -Force
Write-Host "   Copied rtl-for-vscode-agents.js" -ForegroundColor Green

# Update settings.json
if (Test-Path $SettingsPath) {
    $Settings = Get-Content $SettingsPath -Raw | ConvertFrom-Json

    # Convert path to file:/// format
    $FileUrl = "file:///" + $DestScript.Replace('\', '/')

    # Add or update vscode_custom_css.imports
    if (-not $Settings.PSObject.Properties['vscode_custom_css.imports']) {
        $Settings | Add-Member -MemberType NoteProperty -Name 'vscode_custom_css.imports' -Value @($FileUrl)
        Write-Host "   Added vscode_custom_css.imports to settings" -ForegroundColor Green
    } else {
        if ($Settings.'vscode_custom_css.imports' -notcontains $FileUrl) {
            $Settings.'vscode_custom_css.imports' += $FileUrl
            Write-Host "   Updated vscode_custom_css.imports" -ForegroundColor Green
        } else {
            Write-Host "   Script already in settings.json" -ForegroundColor Yellow
        }
    }

    # Save settings
    $Settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsPath
    Write-Host "   Settings updated successfully!" -ForegroundColor Green
} else {
    Write-Host "   Error: settings.json not found at $SettingsPath" -ForegroundColor Red
    Write-Host "   Please add manually:" -ForegroundColor Yellow
    Write-Host "   `"vscode_custom_css.imports`": [`"file:///$($DestScript.Replace('\', '/'))`"]" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Install 'Custom CSS and JS Loader' extension if you haven't already" -ForegroundColor White
Write-Host "2. Press Ctrl+Shift+P and run 'Enable Custom CSS and JS'" -ForegroundColor White
Write-Host "3. Restart VS Code" -ForegroundColor White
Write-Host ""
Write-Host "RTL support will now work in Copilot, Claude Code, and Antigravity!" -ForegroundColor Green
Write-Host ""

# Ask if user wants to open VS Code now
$OpenVSCode = Read-Host "Do you want to restart VS Code now? (y/n)"
if ($OpenVSCode -eq 'y' -or $OpenVSCode -eq 'Y') {
    Write-Host "Restarting VS Code..." -ForegroundColor Cyan
    # Close VS Code if running
    Get-Process -Name "Code" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    # Start VS Code
    Start-Process "code"
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
