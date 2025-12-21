#!/bin/bash

# RTL for VS Code Agents - Installation Script
# This script automates the installation process for Mac/Linux

echo "============================================"
echo "RTL for VS Code Agents - Installer"
echo "============================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    VSCODE_DIR="$HOME/Library/Application Support/Code"
    EXTENSIONS_DIR="$HOME/.vscode/extensions"
else
    VSCODE_DIR="$HOME/.config/Code"
    EXTENSIONS_DIR="$HOME/.vscode/extensions"
fi

SETTINGS_FILE="$VSCODE_DIR/User/settings.json"

# 1. Find Claude Code extension folder
echo "Step 1: Locating Claude Code extension..."
CLAUDE_EXTENSION=$(find "$EXTENSIONS_DIR" -maxdepth 1 -type d -name "anthropic.claude-code-*" | head -n 1)

if [ -n "$CLAUDE_EXTENSION" ]; then
    WEBVIEW_PATH="$CLAUDE_EXTENSION/webview"
    INDEX_JS="$WEBVIEW_PATH/index.js"

    echo "   Found: $(basename "$CLAUDE_EXTENSION")"

    # Ask user if they want to inject into Claude Code
    read -p $'\nDo you want to inject RTL support into Claude Code? (y/n): ' INJECT_CLAUDE

    if [[ "$INJECT_CLAUDE" =~ ^[Yy]$ ]]; then
        if [ -f "$INDEX_JS" ]; then
            # Backup
            BACKUP_PATH="$INDEX_JS.backup"
            if [ ! -f "$BACKUP_PATH" ]; then
                cp "$INDEX_JS" "$BACKUP_PATH"
                echo "   Backup created: index.js.backup"
            else
                echo "   Backup already exists"
            fi

            # Inject
            cat "$SCRIPT_DIR/claude-code-rtl-simple.js" >> "$INDEX_JS"
            echo "   RTL script injected successfully!"
        else
            echo "   Error: index.js not found in webview folder"
        fi
    fi
else
    echo "   Claude Code extension not found"
    echo "   Skipping Claude Code injection"
fi

echo ""

# 2. Set up Custom CSS and JS Loader
echo "Step 2: Configuring Custom CSS and JS Loader..."
echo "   Settings file: $SETTINGS_FILE"

# Ask user where to save the main script
echo ""
echo "Where do you want to save the RTL script?"
echo "   Default: $HOME/vscode-custom"
read -p "Press Enter for default, or enter custom path: " CUSTOM_PATH

if [ -z "$CUSTOM_PATH" ]; then
    CUSTOM_PATH="$HOME/vscode-custom"
fi

# Create directory if it doesn't exist
if [ ! -d "$CUSTOM_PATH" ]; then
    mkdir -p "$CUSTOM_PATH"
    echo "   Created directory: $CUSTOM_PATH"
fi

# Copy the main RTL script
DEST_SCRIPT="$CUSTOM_PATH/rtl-for-vscode-agents.js"
cp "$SCRIPT_DIR/rtl-for-vs-code-agents.js" "$DEST_SCRIPT"
echo "   Copied rtl-for-vscode-agents.js"

# Update settings.json
if [ -f "$SETTINGS_FILE" ]; then
    # Convert path to file:/// format
    FILE_URL="file://$DEST_SCRIPT"

    # Check if jq is available for JSON manipulation
    if command -v jq &> /dev/null; then
        # Use jq to safely update JSON
        TMP_FILE=$(mktemp)
        if jq --arg url "$FILE_URL" '. + {"vscode_custom_css.imports": [.["vscode_custom_css.imports"][]?, $url] | unique}' "$SETTINGS_FILE" > "$TMP_FILE"; then
            mv "$TMP_FILE" "$SETTINGS_FILE"
            echo "   Settings updated successfully!"
        else
            rm "$TMP_FILE"
            echo "   Error updating settings. Please add manually:"
            echo "   \"vscode_custom_css.imports\": [\"$FILE_URL\"]"
        fi
    else
        # Manual instruction if jq is not available
        echo "   Please add the following to your settings.json manually:"
        echo "   \"vscode_custom_css.imports\": [\"$FILE_URL\"]"
    fi
else
    echo "   Error: settings.json not found at $SETTINGS_FILE"
    echo "   Please create it and add:"
    echo "   \"vscode_custom_css.imports\": [\"file://$DEST_SCRIPT\"]"
fi

echo ""
echo "============================================"
echo "Installation Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Install 'Custom CSS and JS Loader' extension if you haven't already"
echo "2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Linux) and run 'Enable Custom CSS and JS'"
echo "3. Restart VS Code"
echo ""
echo "RTL support will now work in Copilot and Claude Code!"
echo ""

# Ask if user wants to restart VS Code
read -p "Do you want to restart VS Code now? (y/n): " RESTART_VSCODE

if [[ "$RESTART_VSCODE" =~ ^[Yy]$ ]]; then
    echo "Restarting VS Code..."
    # Kill VS Code
    pkill -f "Visual Studio Code" 2>/dev/null || pkill -f "code" 2>/dev/null
    sleep 2
    # Start VS Code
    if command -v code &> /dev/null; then
        code &
    else
        echo "VS Code command not found. Please start it manually."
    fi
fi

echo ""
echo "Installation script completed!"
