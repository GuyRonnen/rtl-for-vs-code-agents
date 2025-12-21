# RTL for VS Code Agents

Right-to-Left (RTL) support for AI chat agents in Visual Studio Code, including GitHub Copilot Chat.

Optimized for Hebrew, Arabic, Persian, and other RTL languages.

## Features

- ✅ RTL text alignment in chat window
- ✅ RTL-friendly fonts (Segoe UI, Arial Hebrew, David)
- ✅ Code blocks remain LTR (left-to-right) - essential for readability
- ✅ Bidirectional text support (mixed Hebrew/Arabic + English)
- ✅ RTL input field alignment
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

2. Download and save `copilot-rtl-hebrew.js` to that folder

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
    "file:///C:/Users/YourName/vscode-custom/copilot-rtl-hebrew.js"
  ]
}
```

**Mac/Linux:**
```json
{
  "vscode_custom_css.imports": [
    "file:///Users/YourName/vscode-custom/copilot-rtl-hebrew.js"
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

### 🔄 After VS Code Updates

After each VS Code update, you'll need to re-enable Custom CSS:

1. `Ctrl+Shift+P`
2. "Reload Custom CSS and JS"
3. Restart VS Code

### 🔧 Manual Refresh

If something doesn't work, you can manually refresh:

1. Open Developer Tools: `Help > Toggle Developer Tools`
2. In the console, type: `window.refreshCopilotRTL()`

## Customization

You can edit the file and change the settings at the top:

```javascript
const CONFIG = {
    // Change the font
    fontFamily: '"Segoe UI", "Arial Hebrew", "David", "Miriam", Arial, sans-serif',
    // Change font size
    fontSize: '14px',
    // Change line height
    lineHeight: '1.6',
};
```

## Troubleshooting

### Styles not loading

1. Verify the path in settings.json is correct
2. Check for syntax errors in the path (pay attention to slashes)
3. Try running "Disable Custom CSS and JS" then "Enable" again

### Code appears reversed

Code should remain LTR. If there's an issue, check that the code selectors match your version of VS Code.

### Font doesn't look right

Change `fontFamily` in the configuration to a font installed on your system.

## Supported AI Agents

Currently tested with:
- GitHub Copilot Chat

Should also work with other AI chat extensions that use similar UI patterns.

## Contributing

Contributions are welcome! If you find that certain selectors don't work with your version of VS Code or with a specific AI agent, please open an issue or submit a PR.

## Credits

Based on [NabiKAZ/vscode-copilot-rtl](https://github.com/NabiKAZ/vscode-copilot-rtl)

Adapted and extended for Hebrew users and broader AI agent support.

## License

GPL-3.0 (following the original project's license)
