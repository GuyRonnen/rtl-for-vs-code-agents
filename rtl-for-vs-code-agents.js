/**
 * RTL Support for VS Code AI Chat Agents
 * Supports Hebrew, Arabic, Persian, and other RTL languages
 * 
 * Works with: GitHub Copilot Chat, and other AI chat extensions
 * 
 * Based on NabiKAZ's vscode-copilot-rtl project (GPL-3.0)
 * 
 * Installation:
 * 1. Install "Custom CSS and JS Loader" extension in VS Code
 * 2. Save this file somewhere permanent (e.g., C:\Users\YourName\vscode-custom\rtl-for-vscode-agents.js)
 * 3. Add to VS Code settings.json:
 *    "vscode_custom_css.imports": [
 *      "file:///C:/Users/YourName/vscode-custom/rtl-for-vscode-agents.js"
 *    ]
 * 4. Run command "Enable Custom CSS and JS" and restart VS Code
 * 
 * Note: VS Code will show "[Unsupported]" in title bar - this is normal
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        // Font settings - includes fonts for Hebrew, Arabic, Persian
        fontFamily: '"Segoe UI", "Arial Hebrew", "David", "Miriam", "Tahoma", "Arial", sans-serif',
        fontSize: '14px',
        lineHeight: '1.6',
        
        // Selectors for chat content (add more as needed for different agents)
        chatSelectors: [
            '.chat-markdown-part.rendered-markdown',
            '.chat-markdown-part',
            '.rendered-markdown',
            '.V.D'
        ],
        
        // How often to check for new content (ms)
        checkInterval: 500
    };

    // RTL Unicode ranges
    const RTL_RANGES = [
        // Hebrew: U+0590 to U+05FF
        { start: 0x0590, end: 0x05FF },
        // Arabic: U+0600 to U+06FF
        { start: 0x0600, end: 0x06FF },
        // Arabic Supplement: U+0750 to U+077F
        { start: 0x0750, end: 0x077F },
        // Arabic Extended-A: U+08A0 to U+08FF
        { start: 0x08A0, end: 0x08FF },
        // Persian specific (within Arabic range)
        // Urdu specific (within Arabic range)
        // Syriac: U+0700 to U+074F
        { start: 0x0700, end: 0x074F },
        // Thaana (Maldivian): U+0780 to U+07BF
        { start: 0x0780, end: 0x07BF }
    ];

    /**
     * Check if a character is RTL
     */
    function isRTLChar(char) {
        const code = char.charCodeAt(0);
        return RTL_RANGES.some(range => code >= range.start && code <= range.end);
    }

    /**
     * Check if text contains RTL characters
     */
    function containsRTL(text) {
        if (!text) return false;
        for (let i = 0; i < text.length; i++) {
            if (isRTLChar(text[i])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the first text content from an element's subtree
     */
    function getFirstTextContent(element) {
        // Skip code blocks
        if (element.tagName === 'PRE' || element.tagName === 'CODE') {
            return '';
        }

        // Check direct text nodes
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) return text;
            }
        }

        // Recursively check children
        for (const child of element.children) {
            // Skip code elements
            if (child.tagName === 'PRE' || child.tagName === 'CODE') {
                continue;
            }
            const text = getFirstTextContent(child);
            if (text) return text;
        }

        return '';
    }

    /**
     * Check if an element should be RTL based on its content
     */
    function shouldBeRTL(element) {
        const firstText = getFirstTextContent(element);
        return containsRTL(firstText);
    }

    /**
     * Apply RTL styling to an element
     */
    function applyRTL(element) {
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
        element.style.fontFamily = CONFIG.fontFamily;
        element.setAttribute('data-rtl-applied', 'true');

        // Apply to paragraphs
        element.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6').forEach(el => {
            // Check if this specific element should be RTL
            const text = el.textContent.trim();
            if (containsRTL(text)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.unicodeBidi = 'plaintext';
            }
        });

        // Apply to lists
        element.querySelectorAll('ul, ol').forEach(el => {
            if (containsRTL(el.textContent)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.paddingRight = '20px';
                el.style.paddingLeft = '0';
            }
        });

        // Keep code blocks LTR
        element.querySelectorAll('pre, code').forEach(el => {
            el.style.direction = 'ltr';
            el.style.textAlign = 'left';
            el.style.unicodeBidi = 'embed';
        });
    }

    /**
     * Remove RTL styling from an element
     */
    function removeRTL(element) {
        element.style.direction = '';
        element.style.textAlign = '';
        element.style.fontFamily = '';
        element.removeAttribute('data-rtl-applied');
    }

    /**
     * Process all chat elements
     */
    function processElements() {
        const selector = CONFIG.chatSelectors.join(', ');
        const elements = document.querySelectorAll(selector);

        elements.forEach(element => {
            const wasRTL = element.getAttribute('data-rtl-applied') === 'true';
            const needsRTL = shouldBeRTL(element);

            if (needsRTL && !wasRTL) {
                applyRTL(element);
            } else if (!needsRTL && wasRTL) {
                removeRTL(element);
            }
        });
    }

    /**
     * Initialize the RTL support
     */
    function init() {
        // Process existing elements
        processElements();

        // Watch for new elements
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                }
                // Also check for content changes
                if (mutation.type === 'characterData') {
                    shouldProcess = true;
                }
            });

            if (shouldProcess) {
                // Debounce processing
                clearTimeout(window._rtlProcessTimeout);
                window._rtlProcessTimeout = setTimeout(processElements, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        console.log('✅ RTL for VS Code Agents: Initialized');
    }

    // Start when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose manual refresh function
    window.refreshRTL = function() {
        processElements();
        console.log('✅ RTL for VS Code Agents: Refreshed');
    };

    // Expose function to check RTL status
    window.checkRTL = function(text) {
        console.log(`Text: "${text}"`);
        console.log(`Contains RTL: ${containsRTL(text)}`);
    };

    console.log('🔄 RTL for VS Code Agents loaded. Use window.refreshRTL() to manually refresh.');
})();