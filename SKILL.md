---
name: rtl-for-vs-code-agents
description: Install and configure RTL (Right-to-Left) support for AI code agents in VS Code/Cursor/Antigravity. Use when the user asks to install RTL support, fix Hebrew/Arabic text direction in Claude Code, Copilot, Gemini, or Codex, or enable YOLO mode / search in conversation.
---

# RTL for VS Code Agents — Installation Skill

## What This Extension Does

Adds full RTL (right-to-left) support for Hebrew, Arabic, Persian, and other RTL languages in VS Code AI chat panels:
- Claude Code, GitHub Copilot Chat, Google Gemini Code Assist, OpenAI Codex (ChatGPT)
- Works in VS Code, Cursor, and Antigravity

**Bonus features:** YOLO auto-approve mode, search in conversation, user message navigation, Plan Documents RTL.

## Installation Steps

### Step 1 — Download and install the VSIX

1. Go to the [Releases page](https://github.com/GuyRonnen/rtl-for-vs-code-agents/releases)
2. Download the latest `.vsix` file
3. In VS Code: `Ctrl+Shift+X` → `...` (top-right menu) → **Install from VSIX...**
4. Select the downloaded file
5. Restart VS Code

That's it for Claude Code, Codex, and Gemini Code Assist — RTL injects automatically.

### Step 2 (Optional) — Enable RTL in GitHub Copilot Chat

Copilot requires the [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) extension:

1. Install the extension from the marketplace
2. `Ctrl+Shift+P` → **RTL for VS Code Agents: Configure Custom CSS Loader**
3. `Ctrl+Shift+P` → **Enable Custom CSS and JS**
4. Restart VS Code

## AI Agent Installation Note

If the user asks you (the AI agent) to install this for them:
1. Fetch the latest release from `https://api.github.com/repos/GuyRonnen/rtl-for-vs-code-agents/releases/latest`
2. Download the `.vsix` asset
3. Run: `code --install-extension <path-to-vsix>` (or use the VS Code UI)
4. Optionally install `be5invis.vscode-custom-css` for Copilot support

## Troubleshooting

| Problem | Solution |
|---------|----------|
| RTL not working in Claude Code | `Ctrl+Shift+P` → **RTL for VS Code Agents: Check and Inject** |
| RTL not working in Copilot | Run "Configure Custom CSS Loader", then "Enable Custom CSS and JS" |
| "[Unsupported]" in title bar | Normal — expected when using Custom CSS |
| RTL broke after VS Code update | Extension notifies automatically — click "Enable Custom CSS" + Reload Window |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `rtlForVsCodeAgents.autoInject` | `true` | Auto-inject RTL into new versions |
| `rtlForVsCodeAgents.yoloCountdownSeconds` | `5` | YOLO countdown seconds (0 = instant) |
| `rtlForVsCodeAgents.userMessageBorder` | `true` | Show coral border on user messages |
| `rtlForVsCodeAgents.autoCheckUpdates` | `true` | Check for updates on startup |
