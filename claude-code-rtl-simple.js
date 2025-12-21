/**
 * Simple RTL Script for Claude Code
 *
 * Copy and paste this ENTIRE file into Claude Code's DevTools Console
 * Make sure you're in the correct context (Claude Code webview, not main VS Code)
 */

(function() {
    'use strict';

    if (window._rtlAgentInjected) {
        console.log('ℹ️ RTL already loaded');
        return;
    }
    window._rtlAgentInjected = true;

    const CONFIG = {
        fontFamily: '"Segoe UI", "Arial Hebrew", "David", "Miriam", "Tahoma", "Arial", sans-serif',
        chatSelectors: ['.V.D', '.V.o'], // .V.D = user messages, .V.o = assistant messages
        inputSelectors: ['div[contenteditable="plaintext-only"][role="textbox"][aria-label="Message input"]']
    };

    const RTL_RANGES = [
        { start: 0x0590, end: 0x05FF },
        { start: 0x0600, end: 0x06FF },
        { start: 0x0750, end: 0x077F },
        { start: 0x08A0, end: 0x08FF },
        { start: 0x0700, end: 0x074F },
        { start: 0x0780, end: 0x07BF }
    ];

    function isRTLChar(char) {
        const code = char.charCodeAt(0);
        return RTL_RANGES.some(range => code >= range.start && code <= range.end);
    }

    function containsRTL(text) {
        if (!text) return false;
        for (let i = 0; i < text.length; i++) {
            if (isRTLChar(text[i])) return true;
        }
        return false;
    }

    function getFirstTextContent(element) {
        if (element.tagName === 'PRE' || element.tagName === 'CODE') return '';
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) return text;
            }
        }
        for (const child of element.children) {
            if (child.tagName === 'PRE' || child.tagName === 'CODE') continue;
            const text = getFirstTextContent(child);
            if (text) return text;
        }
        return '';
    }

    function shouldBeRTL(element) {
        const firstText = getFirstTextContent(element);
        return containsRTL(firstText);
    }

    function applyRTL(element) {
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
        element.style.fontFamily = CONFIG.fontFamily;
        element.setAttribute('data-rtl-applied', 'true');

        element.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6').forEach(el => {
            const text = el.textContent.trim();
            if (containsRTL(text)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.unicodeBidi = 'plaintext';
            }
        });

        element.querySelectorAll('ul, ol').forEach(el => {
            if (containsRTL(el.textContent)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.paddingRight = '20px';
                el.style.paddingLeft = '0';
            }
        });

        element.querySelectorAll('pre, code').forEach(el => {
            el.style.direction = 'ltr';
            el.style.textAlign = 'left';
            el.style.unicodeBidi = 'embed';
        });
    }

    function removeRTL(element) {
        element.style.direction = '';
        element.style.textAlign = '';
        element.style.fontFamily = '';
        element.removeAttribute('data-rtl-applied');
    }

    function applyInputRTL(element) {
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
        element.style.fontFamily = CONFIG.fontFamily;
        element.setAttribute('data-rtl-input', 'true');
    }

    function removeInputRTL(element) {
        element.style.direction = 'ltr';
        element.style.textAlign = 'left';
        element.removeAttribute('data-rtl-input');
    }

    function processInputs() {
        const selector = CONFIG.inputSelectors.join(', ');
        const inputs = document.querySelectorAll(selector);

        inputs.forEach(input => {
            const text = input.textContent || input.innerText || '';
            const hasRTL = containsRTL(text);
            const wasRTL = input.getAttribute('data-rtl-input') === 'true';

            if (hasRTL && !wasRTL) {
                applyInputRTL(input);
            } else if (!hasRTL && wasRTL) {
                removeInputRTL(input);
            }

            if (!input.hasAttribute('data-rtl-listener')) {
                input.setAttribute('data-rtl-listener', 'true');
                input.addEventListener('input', function() {
                    const currentText = this.textContent || this.innerText || '';
                    const needsRTL = containsRTL(currentText);
                    if (needsRTL) {
                        applyInputRTL(this);
                    } else {
                        removeInputRTL(this);
                    }
                });
            }
        });
    }

    function processElements() {
        const selector = CONFIG.chatSelectors.join(', ');
        const elements = document.querySelectorAll(selector);

        console.log('RTL: Found', elements.length, 'elements');

        elements.forEach(element => {
            const wasRTL = element.getAttribute('data-rtl-applied') === 'true';
            const needsRTL = shouldBeRTL(element);

            if (needsRTL && !wasRTL) {
                console.log('RTL: Applying to element');
                applyRTL(element);
            } else if (!needsRTL && wasRTL) {
                removeRTL(element);
            }
        });

        processInputs();
    }

    function init() {
        console.log('RTL: Initializing...');
        processElements();

        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
                    shouldProcess = true;
                }
            });

            if (shouldProcess) {
                clearTimeout(window._rtlProcessTimeout);
                window._rtlProcessTimeout = setTimeout(processElements, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        console.log('✅ RTL for Claude Code: Active');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.refreshRTL = function() {
        processElements();
        console.log('✅ RTL refreshed');
    };

    window.checkRTL = function(text) {
        console.log('Text:', text);
        console.log('Contains RTL:', containsRTL(text));
    };
})();
