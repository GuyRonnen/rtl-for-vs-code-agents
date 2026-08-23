const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const MARKER = 'RTL for VS Code Agents';
const SCRIPT_FILE = 'rtl-for-vs-code-agents.js';
const GITHUB_OWNER = 'GuyRonnen';
const GITHUB_REPO = 'rtl-for-vs-code-agents';
const GITHUB_API_BASE = 'https://api.github.com';

let statusBarItem;

function getConfig() {
    return vscode.workspace.getConfiguration('rtlForVsCodeAgents');
}

function getScriptContent(extensionPath) {
    const scriptPath = path.join(extensionPath, SCRIPT_FILE);
    return fs.readFileSync(scriptPath, 'utf8');
}

function resolveCodexWebviewEntrypoint(extensionDir) {
    const indexHtmlPath = path.join(extensionDir, 'webview', 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
        return null;
    }

    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const match = html.match(/<script[^>]+src="\.\/([^"]+\.js)"/i);
    if (!match) {
        return null;
    }

    return path.join(extensionDir, 'webview', match[1].replace(/\//g, path.sep));
}

function listExtensionInstallations() {
    const home = os.homedir();
    const locations = [
        { label: 'VS Code', basePath: path.join(home, '.vscode', 'extensions') },
        { label: 'VS Code (Remote/WSL)', basePath: path.join(home, '.vscode-server', 'extensions') },
        { label: 'VS Code Insiders (Remote/WSL)', basePath: path.join(home, '.vscode-server-insiders', 'extensions') },
        { label: 'Cursor', basePath: path.join(home, '.cursor', 'extensions') },
        { label: 'Cursor (Remote/WSL)', basePath: path.join(home, '.cursor-server', 'extensions') },
        { label: 'Antigravity', basePath: path.join(home, '.antigravity', 'extensions') }
    ];

    // Extension patterns to search for
    const extensionPatterns = [
        {
            prefix: 'anthropic.claude-code-',
            type: 'claude-extension',
            webviewFile: path.join('webview', 'index.js')
        },
        {
            prefix: 'google.geminicodeassist-',
            type: 'gemini-extension',
            webviewFile: path.join('webview', 'app_bundle.js')
        },
        {
            prefix: 'openai.chatgpt-',
            type: 'codex-extension',
            resolveIndexPath: resolveCodexWebviewEntrypoint
        }
    ];

    const results = [];

    for (const location of locations) {
        if (!fs.existsSync(location.basePath)) {
            continue;
        }

        const entries = fs.readdirSync(location.basePath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            for (const pattern of extensionPatterns) {
                if (!entry.name.startsWith(pattern.prefix)) continue;

                const extensionDir = path.join(location.basePath, entry.name);
                const indexPath = pattern.resolveIndexPath
                    ? pattern.resolveIndexPath(extensionDir)
                    : path.join(extensionDir, pattern.webviewFile);

                if (!indexPath) continue;

                results.push({
                    type: pattern.type,
                    location: location.label,
                    name: entry.name,
                    extensionDir,
                    indexPath
                });
            }
        }
    }

    return results;
}

function getAntigravityAppInstallation() {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const appPath = path.join(localAppData, 'Programs', 'Antigravity');
    const chatPath = path.join(appPath, 'resources', 'app', 'extensions', 'antigravity', 'out', 'media', 'chat.js');

    if (fs.existsSync(chatPath)) {
        return {
            type: 'antigravity-app',
            location: 'Antigravity',
            name: 'Antigravity App',
            extensionDir: appPath,
            indexPath: chatPath
        };
    }

    return null;
}

function ensureBackup(indexPath) {
    const backupPath = `${indexPath}.backup`;
    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(indexPath, backupPath);
        return true;
    }
    return false;
}

function isInjected(content) {
    return content.includes('// ' + MARKER);
}

function hasAnyInjection(content) {
    return content.includes('// ' + MARKER) || content.includes('// RTL Support for Claude Code');
}

function needsInjection(indexPath) {
    if (!fs.existsSync(indexPath)) return false;
    const content = fs.readFileSync(indexPath, 'utf8');
    return !isInjected(content);
}

function buildConfigBlock() {
    const config = getConfig();
    const yoloSeconds = Number(config.get('yoloCountdownSeconds', 5)) || 0;
    const userMessageBorder = config.get('userMessageBorder', true);
    const collapsedUserMessageLines = Number(config.get('collapsedUserMessageLines', 3)) || 3;
    const stickyUserMessage = config.get('stickyUserMessage', false);
    return `window.__RTL_CONFIG__ = ${JSON.stringify({ yoloDelayMs: yoloSeconds * 1000, userMessageBorder, collapsedUserMessageLines, stickyUserMessage })};`;
}

const PLAN_MARKER = 'RTL-Plan-Injection';

/**
 * Build a minimal inline RTL script for the Claude Code Plan/Review webview.
 * Includes only: RTL detection, processChildrenForRTL, observer, and init.
 */
function buildPlanRTLScript() {
    // IMPORTANT: The output of this function is injected INTO a JS backtick template
    // literal (the s46 variable in Claude Code's extension.js). That means all
    // backslash escapes are evaluated TWICE: once when this template is evaluated,
    // and once when s46 is evaluated. So we need double-escaping:
    //   \\\\p{L} → (our template) → \\p{L} → (s46 template) → \p{L}  ✓
    //   \\\\u200F → (our template) → \\u200F → (s46 template) → \u200F ✓
    // Also: use double-quotes inside the script to avoid issues with s46's backticks.
    return [
        '<script nonce="{{NONCE}}">',
        '// ' + PLAN_MARKER,
        '(function(){',
        '  var RTL_RANGES=[{s:0x0590,e:0x05FF},{s:0x0600,e:0x06FF},{s:0x0750,e:0x077F},{s:0x08A0,e:0x08FF},{s:0x0700,e:0x074F},{s:0x0780,e:0x07BF}];',
        '  function isRTL(c){var code=c.charCodeAt(0);return RTL_RANGES.some(function(r){return code>=r.s&&code<=r.e})}',
        '  function containsRTL(t){if(!t)return false;for(var i=0;i<t.length;i++)if(isRTL(t[i]))return true;return false}',
        '  function shouldBeRTLText(t){if(!t)return false;t=t.trim();if(!t)return false;var first=null,rc=0,lc=0;for(var ch of t){if(isRTL(ch)){rc++;if(first===null)first=true}else if(/\\\\p{L}/u.test(ch)){lc++;if(first===null)first=false}}if(first===null)return false;if(first)return true;var tot=rc+lc;return tot>0&&(rc/tot)>=0.3}',
        '  function injectRLM(el){var RLM="\\\\u200F";var f=el.firstChild;if(f&&f.nodeType===3&&f.textContent.startsWith(RLM))return;el.insertBefore(document.createTextNode(RLM),f)}',
        '  function processContent(){',
        '    var content=document.getElementById("content");',
        '    if(!content)return;',
        '    content.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6").forEach(function(el){',
        '      if(el.style.direction==="rtl")return;',
        '      if(shouldBeRTLText(el.textContent)){',
        '        el.style.direction="rtl";el.style.textAlign="right";el.style.unicodeBidi="isolate";',
        '        el.setAttribute("data-rtl-applied","true");',
        '        if(el.tagName==="LI")el.style.listStylePosition="inside";',
        '        injectRLM(el);',
        '      }',
        '    });',
        '    content.querySelectorAll("ul,ol").forEach(function(el){',
        '      if(el.style.direction==="rtl")return;',
        '      if(containsRTL(el.textContent)){',
        '        el.style.direction="rtl";el.style.textAlign="right";el.style.paddingRight="20px";el.style.paddingLeft="0";',
        '        el.setAttribute("data-rtl-applied","true");',
        '      }',
        '    });',
        '    content.querySelectorAll("blockquote,details,summary,td,th,dt,dd").forEach(function(el){',
        '      if(el.style.direction==="rtl")return;',
        '      if(shouldBeRTLText(el.textContent)){',
        '        el.style.direction="rtl";el.style.textAlign="right";el.style.unicodeBidi="isolate";',
        '        el.setAttribute("data-rtl-applied","true");',
        '      }',
        '    });',
        '    content.querySelectorAll("pre,code").forEach(function(el){',
        '      el.style.direction="ltr";el.style.textAlign="left";el.style.unicodeBidi="embed";',
        '    });',
        '  }',
        '  window.addEventListener("message",function(e){if(e.data&&e.data.type==="updateContent")setTimeout(processContent,50)});',
        '  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",processContent);',
        '  else processContent();',
        '})();',
        '</script>'
    ].join('\n');
}

/**
 * Inject RTL script into the Plan/Review webview HTML template inside Claude Code's extension.js.
 * Finds '</body>' inside the plan template and inserts the RTL script before it.
 */
function injectPlanRTL(extensionDir) {
    const extJsPath = path.join(extensionDir, 'extension.js');
    if (!fs.existsSync(extJsPath)) return { changed: false, reason: 'no-extension-js' };

    let content = fs.readFileSync(extJsPath, 'utf8');

    // Already injected?
    if (content.includes(PLAN_MARKER)) return { changed: false, reason: 'already-injected' };

    // Find the plan template: look for the closing </body> that's inside the template string.
    // The plan template has a unique structure: </script>\n</body>\n</html> at the end of a backtick-string.
    // We look for '</body>' preceded by '</script>' to target only the plan template.
    const planBodyClose = content.indexOf('vscode.postMessage({ type: \'ready\' });');
    if (planBodyClose < 0) return { changed: false, reason: 'plan-template-not-found' };

    // Find the </script></body> after the ready message
    const bodyCloseIdx = content.indexOf('</body>', planBodyClose);
    if (bodyCloseIdx < 0) return { changed: false, reason: 'body-close-not-found' };

    // Create backup of extension.js
    const backupPath = `${extJsPath}.rtl-backup`;
    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(extJsPath, backupPath);
    }

    const rtlScript = buildPlanRTLScript();
    const before = content.substring(0, bodyCloseIdx);
    const after = content.substring(bodyCloseIdx);
    content = before + rtlScript + '\n' + after;
    fs.writeFileSync(extJsPath, content, 'utf8');
    return { changed: true, reason: 'injected' };
}

/**
 * Remove the Plan RTL injection from Claude Code's extension.js.
 */
function stripPlanInjection(extensionDir) {
    const extJsPath = path.join(extensionDir, 'extension.js');
    const backupPath = `${extJsPath}.rtl-backup`;

    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, extJsPath);
        fs.unlinkSync(backupPath);
        return true;
    }

    // Fallback: strip inline
    if (!fs.existsSync(extJsPath)) return false;
    let content = fs.readFileSync(extJsPath, 'utf8');
    if (!content.includes(PLAN_MARKER)) return false;

    // Remove the injected <script>...</script> block
    const startTag = `<script>\n// ${PLAN_MARKER}`;
    const si = content.indexOf(startTag);
    if (si < 0) return false;
    const endTag = '</script>';
    const ei = content.indexOf(endTag, si);
    if (ei < 0) return false;
    content = content.substring(0, si) + content.substring(ei + endTag.length);
    // Clean up extra newline
    content = content.replace(/\n\n<\/body>/, '\n</body>');
    fs.writeFileSync(extJsPath, content, 'utf8');
    return true;
}

function injectScript(indexPath, scriptContent) {
    let original = fs.readFileSync(indexPath, 'utf8');
    if (isInjected(original)) {
        return { changed: false, reason: 'already-injected' };
    }

    ensureBackup(indexPath);

    // Strip legacy injection if present (older versions used a different header)
    original = stripInjection(original);

    const configBlock = buildConfigBlock();
    const appended = `${original}\n\n// ${MARKER} (injected)\n${configBlock}\n${scriptContent}\n`;
    fs.writeFileSync(indexPath, appended, 'utf8');
    return { changed: true, reason: 'injected' };
}

async function confirmInjection(target) {
    let nameLine;
    if (target.type === 'antigravity-app') {
        nameLine = 'Antigravity: installation found requiring RTL injection.';
    } else if (target.type === 'codex-extension') {
        nameLine = 'Codex: installation found requiring RTL injection.';
    } else if (target.type === 'gemini-extension') {
        nameLine = 'Gemini Code Assist: new version found requiring RTL injection.';
    } else {
        nameLine = 'Claude Code: new version found requiring RTL injection.';
    }

    const detail = target.name ? `\nVersion: ${target.name}` : '';

    const message = `${nameLine}${detail}\n\nRTL injection will modify a local file. Continue?`;
    const yes = 'Inject';
    const no = 'Not now';

    const choice = await vscode.window.showInformationMessage(message, yes, no);
    return choice === yes;
}

function showPostInjectNotice(targets) {
    const includesAntigravity = targets.some(t => t.type === 'antigravity-app');
    const includesWebviewExtension = targets.some(t =>
        t.type === 'claude-extension' ||
        t.type === 'gemini-extension' ||
        t.type === 'codex-extension'
    );

    let message = 'RTL: injection successful.';
    let buttons = [];

    if (includesWebviewExtension) {
        message += ' Restart Extension Host to apply changes.';
        buttons.push('Restart Extension Host', 'Reload Window');
    }
    if (includesAntigravity) {
        message += ' Antigravity: restart the app.';
    }

    vscode.window.showInformationMessage(message, ...buttons).then(choice => {
        if (choice === 'Restart Extension Host') {
            vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        } else if (choice === 'Reload Window') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    });
}

async function checkAndInject(context, options = {}) {
    const { quiet = false, interactive = false, notifyNoChanges = false } = options;
    const config = getConfig();

    if (!config.get('autoInject', true) && quiet) {
        return;
    }

    const scriptContent = getScriptContent(context.extensionPath);
    const installations = listExtensionInstallations();
    const antigravityApp = getAntigravityAppInstallation();
    const targets = antigravityApp ? [...installations, antigravityApp] : installations;

    if (targets.length === 0) {
        if (!quiet && notifyNoChanges) {
            vscode.window.showInformationMessage('RTL: no installations of Codex, Claude Code, Gemini Code Assist or Antigravity found.');
        }
        return;
    }

    const injectedPaths = new Set(context.globalState.get('rtlForVsCodeAgents.injectedPaths', []));
    const updatedPaths = [];
    const errors = [];

    for (const install of targets) {
        if (!fs.existsSync(install.indexPath)) {
            continue;
        }

        if (!needsInjection(install.indexPath)) {
            continue;
        }

        if (interactive) {
            const approved = await confirmInjection(install);
            if (!approved) {
                continue;
            }
        }

        try {
            const result = injectScript(install.indexPath, scriptContent);
            if (result.changed) {
                injectedPaths.add(install.indexPath);
                updatedPaths.push(install);
            }
            // Also inject RTL into Plan/Review webview for Claude Code
            if (install.type === 'claude-extension') {
                try {
                    injectPlanRTL(install.extensionDir);
                } catch (planErr) {
                    console.error('RTL: failed to inject Plan RTL:', planErr.message);
                }
            }
        } catch (error) {
            errors.push({ install, error });
        }
    }

    await context.globalState.update('rtlForVsCodeAgents.injectedPaths', Array.from(injectedPaths));
    await context.globalState.update('rtlForVsCodeAgents.lastCheck', Date.now());

    if (!quiet) {
        if (updatedPaths.length > 0) {
            showPostInjectNotice(updatedPaths);
        } else if (errors.length === 0 && notifyNoChanges) {
            vscode.window.showInformationMessage('RTL injection: nothing to update.');
        }

        if (errors.length > 0) {
            const message = errors[0].error?.message || 'Unknown error';
            vscode.window.showWarningMessage(`RTL injection: some injections failed — error: ${message}`);
        }
    }
}

async function configureCustomCss(context, options = {}) {
    const { quiet = false } = options;
    const scriptPath = path.join(context.extensionPath, SCRIPT_FILE);
    const fileUrl = `file:///${scriptPath.replace(/\\/g, '/')}`;

    const config = vscode.workspace.getConfiguration();
    const imports = config.get('vscode_custom_css.imports', []);

    if (!Array.isArray(imports)) {
        if (!quiet) {
            vscode.window.showWarningMessage('vscode_custom_css.imports is not an array. Please fix it manually.');
        }
        return;
    }

    // Remove stale RTL entries (old versions, wrong paths) before adding current one
    const cleanedImports = imports.filter(url =>
        typeof url !== 'string' || !url.includes('rtl-for-vs-code-agents') || url === fileUrl
    );

    if (!cleanedImports.includes(fileUrl)) {
        cleanedImports.push(fileUrl);
    }

    const changed = cleanedImports.length !== imports.length || !imports.includes(fileUrl);
    if (changed) {
        await config.update('vscode_custom_css.imports', cleanedImports, vscode.ConfigurationTarget.Global);
        if (!quiet) {
            vscode.window.showInformationMessage('Added RTL script to vscode_custom_css.imports. Run “Enable Custom CSS and JS” and restart VS Code.');
        }
    } else if (!quiet) {
        vscode.window.showInformationMessage('RTL script already configured in vscode_custom_css.imports.');
    }

    const customCssExt = vscode.extensions.getExtension('be5invis.vscode-custom-css');
    if (!customCssExt && !quiet) {
        const install = await vscode.window.showInformationMessage(
            'Custom CSS and JS Loader is required for Copilot RTL. Install now?',
            'Install'
        );
        if (install === 'Install') {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', 'be5invis.vscode-custom-css');
        }
    }
}

function isCopilotInjectionActive() {
    try {
        const htmlPath = path.join(vscode.env.appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.html');
        if (!fs.existsSync(htmlPath)) return null;
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        const config = vscode.workspace.getConfiguration();
        const imports = config.get('vscode_custom_css.imports', []);
        if (!Array.isArray(imports) || imports.length === 0) return null;

        const rtlImports = imports.filter(url => typeof url === 'string' && url.includes('rtl-for-vs'));
        if (rtlImports.length === 0) return null;

        return rtlImports.some(url => htmlContent.includes(url));
    } catch (e) {
        return null;
    }
}

async function checkCopilotStatus() {
    const isActive = isCopilotInjectionActive();
    if (isActive === null || isActive === true) return;

    const reEnable = 'Enable Custom CSS';
    const choice = await vscode.window.showWarningMessage(
        'Copilot RTL: injection lost after VS Code update. Re-enable: "Enable Custom CSS and JS" + Reload Window.',
        reEnable,
        'Dismiss'
    );
    if (choice === reEnable) {
        await vscode.commands.executeCommand('workbench.action.showCommands');
        vscode.window.showInformationMessage('Search "Enable Custom CSS and JS", press Enter, then run "Reload Window".');
    }
}

// --- Auto-Update functions ---

function getLocalVersion(extensionPath) {
    const pkgPath = path.join(extensionPath, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version;
}

function parseVersion(versionStr) {
    const clean = versionStr.replace(/^v/, '');
    const parts = clean.split('.').map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function isNewerVersion(remote, local) {
    const r = parseVersion(remote);
    const l = parseVersion(local);
    if (r.major !== l.major) return r.major > l.major;
    if (r.minor !== l.minor) return r.minor > l.minor;
    return r.patch > l.patch;
}

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'rtl-for-vs-code-agents',
                'Accept': 'application/vnd.github.v3+json'
            }
        };
        https.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsGet(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function httpsDownload(url, destPath) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'User-Agent': 'rtl-for-vs-code-agents', 'Accept': 'application/octet-stream' }
        };
        https.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return httpsDownload(res.headers.location, destPath).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(destPath); });
            file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
        }).on('error', reject);
    });
}

async function fetchLatestRelease() {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const json = await httpsGet(url);
    const release = JSON.parse(json);
    const vsixAsset = release.assets && release.assets.find(a => a.name.endsWith('.vsix'));
    return {
        version: release.tag_name.replace(/^v/, ''),
        tagName: release.tag_name,
        name: release.name || release.tag_name,
        body: release.body || '',
        downloadUrl: vsixAsset ? vsixAsset.browser_download_url : null
    };
}

/**
 * Strip any RTL injection (current or legacy) from file content.
 * Returns the clean original content, or the input unchanged if no injection found.
 */
function stripInjection(content) {
    // Try current marker first, then legacy header
    let mi = content.indexOf('// ' + MARKER);
    if (mi <= 0) mi = content.indexOf('// RTL Support for Claude Code');
    if (mi <= 0) return content;
    return content.substring(0, mi).trimEnd();
}

function restoreAllBackups() {
    const installations = listExtensionInstallations();
    const antigravityApp = getAntigravityAppInstallation();
    const targets = antigravityApp ? [...installations, antigravityApp] : installations;
    let restored = 0;

    for (const target of targets) {
        const backupPath = `${target.indexPath}.backup`;
        if (fs.existsSync(backupPath) && fs.existsSync(target.indexPath)) {
            try {
                let content = fs.readFileSync(backupPath, 'utf8');
                // Clean backup in case it was created from an already-injected file
                content = stripInjection(content);
                fs.writeFileSync(target.indexPath, content, 'utf8');
                fs.unlinkSync(backupPath);
                restored++;
            } catch (e) {
                console.error(`RTL: failed to restore backup for ${target.indexPath}:`, e.message);
            }
        }
        // Also restore Plan RTL injection for Claude Code
        if (target.type === 'claude-extension') {
            try {
                if (stripPlanInjection(target.extensionDir)) restored++;
            } catch (e) {
                console.error(`RTL: failed to restore Plan RTL for ${target.extensionDir}:`, e.message);
            }
        }
    }
    return restored;
}

function reinjectAll(extensionPath) {
    const scriptContent = getScriptContent(extensionPath);
    const configBlock = buildConfigBlock();
    const installations = listExtensionInstallations();
    const antigravityApp = getAntigravityAppInstallation();
    const targets = antigravityApp ? [...installations, antigravityApp] : installations;
    let count = 0;

    for (const target of targets) {
        if (!fs.existsSync(target.indexPath)) continue;
        const content = fs.readFileSync(target.indexPath, 'utf8');
        if (!hasAnyInjection(content)) continue;

        // Strip old injection (current or legacy), re-append with new config
        const clean = stripInjection(content);
        if (clean === content) continue; // nothing was stripped
        const output = `${clean}\n\n// ${MARKER} (injected)\n${configBlock}\n${scriptContent}\n`;
        fs.writeFileSync(target.indexPath, output, 'utf8');
        count++;

        // Also re-inject Plan RTL for Claude Code
        if (target.type === 'claude-extension') {
            try {
                stripPlanInjection(target.extensionDir);
                injectPlanRTL(target.extensionDir);
            } catch (e) {
                console.error('RTL: failed to re-inject Plan RTL:', e.message);
            }
        }
    }
    return count;
}

async function removeAllInjections(context) {
    const yes = 'Remove All';
    const no = 'Cancel';
    const choice = await vscode.window.showWarningMessage(
        'This will remove all RTL injections and restore original files. Continue?',
        { modal: true }, yes, no
    );
    if (choice !== yes) return;

    const restored = restoreAllBackups();
    await context.globalState.update('rtlForVsCodeAgents.injectedPaths', []);

    if (restored > 0) {
        const restart = 'Restart Extension Host';
        const reload = 'Reload Window';
        const message = `RTL: restored ${restored} file(s) to original. Restart Extension Host to apply.`;
        vscode.window.showInformationMessage(message, restart, reload).then(choice => {
            if (choice === restart) {
                vscode.commands.executeCommand('workbench.action.restartExtensionHost');
            } else if (choice === reload) {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    } else {
        vscode.window.showInformationMessage('RTL: no injections found to remove.');
    }
}

let updateBlinkTimer;

function startUpdateBlink() {
    if (updateBlinkTimer) return; // already blinking
    let highlighted = false;
    updateBlinkTimer = setInterval(() => {
        if (!statusBarItem) return;
        highlighted = !highlighted;
        statusBarItem.backgroundColor = highlighted
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
    }, 900);
}

function stopUpdateBlink() {
    if (updateBlinkTimer) {
        clearInterval(updateBlinkTimer);
        updateBlinkTimer = undefined;
    }
}

function updateStatusBar(localVersion, remoteVersion) {
    if (!statusBarItem) return;
    if (remoteVersion && isNewerVersion(remoteVersion, localVersion)) {
        statusBarItem.text = `$(cloud-download) RTL: Update available (v${remoteVersion})`;
        statusBarItem.tooltip = `RTL for VS Code Agents: Update available — v${localVersion} → v${remoteVersion}. Click to update.`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        startUpdateBlink();
    } else {
        stopUpdateBlink();
        statusBarItem.text = `RTL v${localVersion}`;
        statusBarItem.tooltip = 'RTL for VS Code Agents: Click to check for updates';
        statusBarItem.backgroundColor = undefined;
    }
}

async function checkForUpdates(context, options = {}) {
    const { quiet = false, isAutoCheck = false, isPeriodicCheck = false } = options;
    const config = getConfig();
    const localVersion = getLocalVersion(context.extensionPath);

    if (isAutoCheck && !config.get('autoCheckUpdates', true)) {
        return;
    }

    // Respect check interval only for periodic (setInterval) checks, not startup
    if (isPeriodicCheck) {
        const hours = Number(config.get('updateCheckIntervalHours', 5)) || 5;
        const lastCheck = context.globalState.get('rtlForVsCodeAgents.lastUpdateCheck', 0);
        const elapsed = (Date.now() - lastCheck) / (1000 * 60 * 60);
        if (hours > 0 && elapsed < hours) {
            return;
        }
    }

    try {
        if (!quiet) {
            statusBarItem && (statusBarItem.text = `$(sync~spin) RTL checking...`);
        }

        const release = await fetchLatestRelease();
        await context.globalState.update('rtlForVsCodeAgents.lastUpdateCheck', Date.now());

        updateStatusBar(localVersion, release.version);

        if (!isNewerVersion(release.version, localVersion)) {
            if (!quiet) {
                vscode.window.showInformationMessage(`RTL for VS Code Agents: you are on the latest version (v${localVersion}).`);
            }
            return;
        }

        if (!release.downloadUrl) {
            if (!quiet) {
                vscode.window.showWarningMessage(`RTL update v${release.version} found, but no VSIX asset in the release.`);
            }
            return;
        }

        // Store release info for the update command
        await context.globalState.update('rtlForVsCodeAgents.pendingUpdate', {
            version: release.version,
            name: release.name,
            downloadUrl: release.downloadUrl
        });

        const updateNow = 'Update Now';
        const later = 'Later';
        const choice = await vscode.window.showInformationMessage(
            `RTL for VS Code Agents: update available — v${localVersion} → v${release.version} (${release.name})`,
            updateNow, later
        );

        if (choice === updateNow) {
            await downloadAndInstall(context, release);
        }
    } catch (err) {
        if (!quiet) {
            vscode.window.showWarningMessage(`RTL update check failed: ${err.message}`);
        }
        updateStatusBar(localVersion, null);
    }
}

async function downloadAndInstall(context, release) {
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `RTL: Updating to v${release.version}...`, cancellable: false },
        async (progress) => {
            try {
                progress.report({ message: 'Restoring backups...' });
                restoreAllBackups();

                progress.report({ message: 'Downloading VSIX...' });
                const tmpDir = os.tmpdir();
                const vsixFileName = `rtl-for-vs-code-agents-${release.version}.vsix`;
                const vsixPath = path.join(tmpDir, vsixFileName);
                await httpsDownload(release.downloadUrl, vsixPath);

                progress.report({ message: 'Installing...' });
                await vscode.commands.executeCommand(
                    'workbench.extensions.installExtension',
                    vscode.Uri.file(vsixPath)
                );

                // Clean up temp file
                try { fs.unlinkSync(vsixPath); } catch (e) {}

                // Clear pending update
                await context.globalState.update('rtlForVsCodeAgents.pendingUpdate', undefined);

                const reload = 'Reload Window';
                const choice = await vscode.window.showInformationMessage(
                    `RTL for VS Code Agents updated to v${release.version}. Reload to apply.`,
                    reload
                );
                if (choice === reload) {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            } catch (err) {
                vscode.window.showErrorMessage(`RTL update failed: ${err.message}`);
            }
        }
    );
}

async function handleVersionUpgrade(context) {
    const localVersion = getLocalVersion(context.extensionPath);
    const storedVersion = context.globalState.get('rtlForVsCodeAgents.installedVersion');

    if (storedVersion && storedVersion !== localVersion) {
        console.log(`RTL: version changed ${storedVersion} → ${localVersion}, re-injecting...`);
        restoreAllBackups();
        // Re-inject with the new script even if no backup existed
        // (reinjectAll strips old injection by MARKER and re-appends current script)
        reinjectAll(context.extensionPath);
    }

    await context.globalState.update('rtlForVsCodeAgents.installedVersion', localVersion);
}

function scheduleAutoCheck(context) {
    const config = getConfig();
    if (!config.get('autoInject', true)) {
        return;
    }

    const hours = Number(config.get('checkIntervalHours', 0)) || 0;
    if (hours <= 0) {
        return;
    }

    const intervalMs = hours * 60 * 60 * 1000;
    const handle = setInterval(() => {
        checkAndInject(context, { quiet: false, interactive: true, notifyNoChanges: false });
    }, intervalMs);

    context.subscriptions.push({ dispose: () => clearInterval(handle) });
}

function maybeAutoConfigureCustomCss(context) {
    const config = getConfig();
    if (config.get('autoConfigureCustomCss', false)) {
        configureCustomCss(context, { quiet: true });
    }
}

function scheduleUpdateCheck(context) {
    const config = getConfig();
    if (!config.get('autoCheckUpdates', true)) return;

    const hours = Number(config.get('updateCheckIntervalHours', 5)) || 5;
    if (hours <= 0) return;

    const intervalMs = hours * 60 * 60 * 1000;
    const handle = setInterval(() => {
        checkForUpdates(context, { quiet: true, isAutoCheck: true, isPeriodicCheck: true });
    }, intervalMs);

    context.subscriptions.push({ dispose: () => clearInterval(handle) });
}

function createStatusBarItem(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'rtlForVsCodeAgents.showMenu';
    const localVersion = getLocalVersion(context.extensionPath);
    updateStatusBar(localVersion, null);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push({ dispose: () => stopUpdateBlink() });
}

async function activate(context) {
    console.log('RTL for VS Code Agents: Activating...');

    // Handle version upgrade (restore old injections before re-injecting)
    await handleVersionUpgrade(context);

    // Create status bar item
    createStatusBarItem(context);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('rtlForVsCodeAgents.checkAndInject', () => checkAndInject(context, { quiet: false, interactive: true, notifyNoChanges: true })),
        vscode.commands.registerCommand('rtlForVsCodeAgents.configureCustomCss', () => configureCustomCss(context)),
        vscode.commands.registerCommand('rtlForVsCodeAgents.checkForUpdates', () => checkForUpdates(context, { quiet: false })),
        vscode.commands.registerCommand('rtlForVsCodeAgents.removeInjections', () => removeAllInjections(context)),
        vscode.commands.registerCommand('rtlForVsCodeAgents.showMenu', async () => {
            // Run update check in background (updates status bar, shows notification if update found)
            checkForUpdates(context, { quiet: true, isAutoCheck: true });

            const items = [
                { label: '$(sync) Check for Updates', command: 'rtlForVsCodeAgents.checkForUpdates' },
                { label: '$(syringe) Check and Inject RTL', command: 'rtlForVsCodeAgents.checkAndInject' },
                { label: '$(settings-gear) Configure Custom CSS Loader', command: 'rtlForVsCodeAgents.configureCustomCss' },
                { label: '$(trash) Remove All RTL Injections', command: 'rtlForVsCodeAgents.removeInjections' }
            ];
            const picked = await vscode.window.showQuickPick(items, { placeHolder: 'RTL for VS Code Agents' });
            if (picked) {
                await vscode.commands.executeCommand(picked.command);
            }
        })
    );

    // Re-inject when settings change, then offer Reload
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('rtlForVsCodeAgents.yoloCountdownSeconds') ||
                e.affectsConfiguration('rtlForVsCodeAgents.userMessageBorder') ||
                e.affectsConfiguration('rtlForVsCodeAgents.collapsedUserMessageLines') ||
                e.affectsConfiguration('rtlForVsCodeAgents.stickyUserMessage')) {
                const updated = reinjectAll(context.extensionPath);
                if (updated > 0) {
                    vscode.window.showInformationMessage(
                        'RTL settings updated. Restart Extension Host to apply.',
                        'Restart Extension Host',
                        'Reload Window'
                    ).then(choice => {
                        if (choice === 'Restart Extension Host') {
                            vscode.commands.executeCommand('workbench.action.restartExtensionHost');
                        } else if (choice === 'Reload Window') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            }
        })
    );

    // Auto-inject RTL into agent webviews
    checkAndInject(context, { quiet: false, interactive: true, notifyNoChanges: false });
    checkCopilotStatus();
    scheduleAutoCheck(context);
    maybeAutoConfigureCustomCss(context);

    // Auto-check for extension updates (delayed to not block startup)
    setTimeout(() => {
        checkForUpdates(context, { quiet: true, isAutoCheck: true });
    }, 5000);
    scheduleUpdateCheck(context);

    console.log('RTL for VS Code Agents: Activated successfully!');
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
