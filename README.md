# RTL for VS Code Agents

Right-to-Left (RTL) support for AI chat agents in Visual Studio Code.

**Smart RTL detection** - automatically detects Hebrew, Arabic, Persian, and other RTL languages and applies RTL styling only when needed.

## Features

- ✅ **Automatic RTL detection** - analyzes content and applies RTL only to RTL text
- ✅ Supports Hebrew, Arabic, Persian, Urdu, and other RTL languages
- ✅ Code blocks remain LTR (left-to-right) - essential for readability
- ✅ Bidirectional text support (mixed RTL + English)
- ✅ Works with GitHub Copilot Chat and other AI chat extensions
- ✅ Auto-applies to dynamically loaded content

## Preview

*Coming soon*

## Installation

### Step 1: Install the Extension

Install **"Custom CSS and JS Loader"** from the VS Code Marketplace:

1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for "Custom CSS and JS Loader"
4. Install the extension by **be5invis**

### Step 2: Save the Script

1. Create a new folder, for example:
   - Windows: `C:\Users\YourName\vscode-custom\`
   - Mac/Linux: `~/vscode-custom/`

2. Download and save `rtl-for-vscode-agents.js` to that folder

### Step 3: Configure VS Code

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

### Step 4: Enable

1. Press `Ctrl+Shift+P`
2. Type "Enable Custom CSS and JS"
3. Select the command
4. VS Code will ask to restart - confirm

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
- GitHub Copilot Chat

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
