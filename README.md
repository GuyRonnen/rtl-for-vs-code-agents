# RTL for VS Code Agents

Right-to-Left (RTL) support for AI chat agents in Visual Studio Code.

**Smart RTL detection** - automatically detects Hebrew, Arabic, Persian, and other RTL languages and applies RTL styling only when needed.

## Features

- ✅ **Automatic RTL detection** - analyzes content and applies RTL only to RTL text
- ✅ Supports Hebrew, Arabic, Persian, Urdu, and other RTL languages
- ✅ Code blocks remain LTR (left-to-right) - essential for readability
- ✅ Bidirectional text support (mixed RTL + English)
- ✅ Works with GitHub Copilot Chat, Claude Code, and other AI chat extensions
- ✅ Input box RTL support - automatically switches direction as you type
- ✅ Auto-applies to dynamically loaded content

## Preview

*Coming soon*

## Installation

### Quick Install (Recommended)

The easiest way to install RTL support is using the automated installer scripts:

**Windows:**
```powershell
.\install.ps1
```

**Mac/Linux:**
```bash
./install.sh
```

The installer will:
- Guide you through installing the "Custom CSS and JS Loader" extension
- Create the necessary folders automatically
- Copy the RTL script to the correct location
- Update your VS Code settings.json
- Optionally inject RTL support into Claude Code (with automatic backup)
- Restart VS Code when complete

**That's it!** RTL support will be active in all AI chat agents.

### Manual Installation

If you prefer to install manually or the automated script doesn't work:

#### Step 1: Install the Extension

Install **"Custom CSS and JS Loader"** from the VS Code Marketplace:

1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for "Custom CSS and JS Loader"
4. Install the extension by **be5invis**

#### Step 2: Save the Script

1. Create a new folder, for example:
   - Windows: `C:\Users\YourName\vscode-custom\`
   - Mac/Linux: `~/vscode-custom/`

2. Download and save `rtl-for-vscode-agents.js` to that folder

#### Step 3: Configure VS Code

1. Open settings.json:
   - Press `Ctrl+Shift+P`
   - Type "Preferences: Open User Settings (JSON)"
   - Select the option

2. Add the following lines (adjust the path to your location):

**Windows:**
```json
{
  "vscode_custom_css.imports": [
    "file:///C:/Users/YourName/vscode-custom/rtl-for-vscode-agents.js"
  ]
}
```

**Mac/Linux:**
```json
{
  "vscode_custom_css.imports": [
    "file:///Users/YourName/vscode-custom/rtl-for-vscode-agents.js"
  ]
}
```

#### Step 4: Enable

1. Press `Ctrl+Shift+P`
2. Type "Enable Custom CSS and JS"
3. Select the command
4. VS Code will ask to restart - confirm

## Additional Setup for Claude Code

The above installation works for **Copilot Chat** and most agents. For **Claude Code**, you need one additional step because it runs in an isolated webview.

### Automated Injection (Recommended)

The installer scripts automatically handle Claude Code setup. When you run `install.ps1` or `install.sh`, you'll be prompted whether to inject RTL support into Claude Code. If you choose "yes", the script will:

- Locate your Claude Code extension folder
- Create a backup of the original `index.js`
- Inject the RTL script automatically
- Restore functionality after Claude Code updates

### Manual Injection

If you installed manually or prefer to do it yourself:

1. **Close VS Code completely**

2. **Locate your Claude Code extension folder:**
   - Windows: `%USERPROFILE%\.vscode\extensions\anthropic.claude-code-*\webview\`
   - Mac/Linux: `~/.vscode/extensions/anthropic.claude-code-*/webview/`

3. **Backup the original file:**
   ```bash
   cd webview
   cp index.js index.js.backup
   ```

4. **Inject the RTL script:**

   **Windows (PowerShell):**
   ```powershell
   Get-Content path\to\claude-code-rtl-simple.js | Add-Content index.js
   ```

   **Mac/Linux:**
   ```bash
   cat path/to/claude-code-rtl-simple.js >> index.js
   ```

   **Or manually:**
   - Open `index.js` in a text editor
   - Scroll to the very end
   - Paste the entire contents of `claude-code-rtl-simple.js`
   - Save

5. **Restart VS Code**

**That's it!** RTL support will now work automatically in Claude Code.

**Important Notes:**
- After updating Claude Code extension, you'll need to re-inject the script
- To restore the original: `mv index.js.backup index.js`

### Console Injection (Temporary - Per Session)

If you prefer not to modify extension files:

1. Open Claude Code chat
2. Open DevTools: `Help → Toggle Developer Tools`
3. **Important:** In the Console dropdown (top-left), select the Claude Code webview context (look for "Electron isolated Context")
4. Copy the entire contents of `claude-code-rtl-simple.js`
5. Paste into the console and press Enter
6. You should see: `✅ RTL for Claude Code: Active`

**Note:** This method requires re-running the script each time you restart VS Code.

## Important Notes

### ⚠️ "[Unsupported]" Warning

After enabling, VS Code will display "[Unsupported]" in the title bar. **This is normal!**

The extension modifies VS Code's core files, which triggers this warning. It does not affect functionality.

### 🔄 After Updating the Script

If you modify the JS file, you must reload it:

1. Press `Ctrl+Shift+P`
2. Type **"Reload Custom CSS and JS"**
3. Select the command
4. Restart VS Code

**Note:** Simply restarting VS Code is not enough - you must run the Reload command first!

### 🔄 After VS Code Updates

After each VS Code update, you'll need to re-enable Custom CSS:

1. `Ctrl+Shift+P`
2. "Reload Custom CSS and JS"
3. Restart VS Code

### 🔧 Manual Refresh

If RTL is not applied to new content, you can manually refresh:

1. Open Developer Tools: `Help > Toggle Developer Tools`
2. In the console, type: `window.refreshRTL()`

### 🐛 Debug Functions

The script exposes helper functions in the Developer Tools console:

```javascript
// Manually refresh RTL detection
window.refreshRTL()

// Check if specific text is detected as RTL
window.checkRTL("שלום עולם")  // Returns: Contains RTL: true
window.checkRTL("Hello world") // Returns: Contains RTL: false
```

## How It Works

The script automatically:

1. Monitors the chat interface for new content
2. For each chat message, finds the first text content (skipping code blocks)
3. Checks if the text contains RTL characters (Hebrew, Arabic, Persian, etc.)
4. Applies RTL styling only to elements that contain RTL text
5. Keeps code blocks in LTR direction

This means English-only messages stay LTR, while RTL messages get proper RTL alignment.

## Customization

You can edit the configuration at the top of the file:

```javascript
const CONFIG = {
    // Change the font family
    fontFamily: '"Segoe UI", "Arial Hebrew", "David", "Miriam", "Tahoma", "Arial", sans-serif',
    
    // Change font size
    fontSize: '14px',
    
    // Change line height
    lineHeight: '1.6',
    
    // Add selectors for other chat extensions
    chatSelectors: [
        '.chat-markdown-part.rendered-markdown',
        '.chat-markdown-part',
        '.rendered-markdown'
    ]
};
```

## Supported Languages

The script detects these RTL Unicode ranges:

| Language | Unicode Range |
|----------|---------------|
| Hebrew | U+0590 – U+05FF |
| Arabic | U+0600 – U+06FF |
| Arabic Supplement | U+0750 – U+077F |
| Arabic Extended-A | U+08A0 – U+08FF |
| Syriac | U+0700 – U+074F |
| Thaana (Maldivian) | U+0780 – U+07BF |

Persian and Urdu are covered by the Arabic ranges.

## Supported AI Agents

Currently tested with:
- ✅ GitHub Copilot Chat
- ✅ Claude Code (requires additional setup - see above)

Should also work with other AI chat extensions that use similar UI patterns. If you find an extension that doesn't work, please open an issue with the CSS selector information.

## Troubleshooting

### Styles not loading

1. Verify the path in settings.json is correct
2. Make sure to use forward slashes `/` even on Windows
3. Run "Reload Custom CSS and JS" (not just restart)
4. Check the Developer Tools console for error messages

### RTL not applied to some messages

1. Open Developer Tools: `Help > Toggle Developer Tools`
2. Run `window.refreshRTL()` in the console
3. If still not working, the chat extension may use different CSS selectors

### Code appears with RTL styling

Code blocks should remain LTR. If code is affected, please open an issue.

### Finding CSS selectors for other extensions

1. Open Developer Tools: `Help > Toggle Developer Tools`
2. Use the element inspector to find the chat message elements
3. Add the selector to `CONFIG.chatSelectors` in the script
4. Run "Reload Custom CSS and JS"

## Contributing

Contributions are welcome! 

- Found a bug? Open an issue
- Support for a new AI agent? Submit a PR with the CSS selectors
- Improvement ideas? Let's discuss in issues

## Credits

Based on [NabiKAZ/vscode-copilot-rtl](https://github.com/NabiKAZ/vscode-copilot-rtl)

Extended with automatic RTL detection and support for multiple AI agents.

## License

GPL-3.0 (following the original project's license)
