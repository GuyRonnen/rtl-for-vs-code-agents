(function() {
    console.log('RTL Support for Google Antigravity - Initializing...');

    // The actual RTL implementation code as a string that will be injected
    const rtlImplementationCode = `
        (function() {
            console.log('RTL Support - Running in webview context');

            // Hebrew and Arabic character ranges
            const rtlRegex = /[\\u0590-\\u05FF\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB1D-\\uFB4F]/;

            function isRTL(text) {
                return rtlRegex.test(text);
            }

            function applyRTLToElement(element) {
                if (!element || element.hasAttribute('data-rtl-processed')) {
                    return;
                }

                const text = element.textContent || '';
                if (isRTL(text)) {
                    element.style.direction = 'rtl';
                    element.style.textAlign = 'right';
                    element.setAttribute('data-rtl-processed', 'true');
                }
            }

            function processAgentMessage(proseContainer) {
                if (!proseContainer || proseContainer.hasAttribute('data-rtl-container-processed')) {
                    return;
                }

                // Check if this container has RTL content by looking at first text node
                const firstText = proseContainer.textContent.trim().substring(0, 100);
                if (!isRTL(firstText)) {
                    return;
                }

                // Mark container as processed
                proseContainer.setAttribute('data-rtl-container-processed', 'true');

                // Apply RTL to all text elements inside (p, h3, h4, li, etc.)
                const textElements = proseContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
                textElements.forEach(element => {
                    if (!element.hasAttribute('data-rtl-processed')) {
                        element.style.direction = 'rtl';
                        element.style.textAlign = 'right';
                        element.setAttribute('data-rtl-processed', 'true');
                    }
                });

                // Also handle the lists themselves (ol, ul)
                const lists = proseContainer.querySelectorAll('ol, ul');
                lists.forEach(list => {
                    if (!list.hasAttribute('data-rtl-processed')) {
                        list.style.direction = 'rtl';
                        list.style.textAlign = 'right';
                        list.setAttribute('data-rtl-processed', 'true');
                    }
                });
            }

            function processElements() {
                // Target user messages with class="whitespace-pre-wrap"
                const userMessages = document.querySelectorAll('.whitespace-pre-wrap');
                userMessages.forEach(applyRTLToElement);

                // Target agent messages - look for prose containers
                const agentContainers = document.querySelectorAll('div.prose.prose-sm');
                agentContainers.forEach(processAgentMessage);
            }

            // Initial processing
            processElements();

            // Watch for DOM changes
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            // Check for user messages
                            if (node.classList && node.classList.contains('whitespace-pre-wrap')) {
                                applyRTLToElement(node);
                            }
                            // Check for agent message containers
                            if (node.classList && node.classList.contains('prose') && node.classList.contains('prose-sm')) {
                                processAgentMessage(node);
                            }
                            // Also check child elements
                            const userMsgChildren = node.querySelectorAll('.whitespace-pre-wrap');
                            userMsgChildren.forEach(applyRTLToElement);
                            const agentContainers = node.querySelectorAll('div.prose.prose-sm');
                            agentContainers.forEach(processAgentMessage);
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            console.log('RTL Support for Google Antigravity - Active in webview');
        })();
    `;

    // Function to inject code into webview
    function injectIntoWebview(webview) {
        try {
            webview.executeJavaScript(rtlImplementationCode);
            console.log('RTL code injected into webview');
        } catch (error) {
            console.error('Failed to inject RTL code into webview:', error);
        }
    }

    // Try to find and inject into existing webviews
    function findAndInjectWebviews() {
        const webviews = document.querySelectorAll('webview');
        console.log(`Found ${webviews.length} webview(s)`);

        webviews.forEach((webview, index) => {
            console.log(`Injecting into webview ${index + 1}`);

            // Wait for webview to be ready
            if (webview.contentWindow) {
                injectIntoWebview(webview);
            } else {
                webview.addEventListener('dom-ready', () => {
                    injectIntoWebview(webview);
                });
            }
        });
    }

    // Initial injection
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', findAndInjectWebviews);
    } else {
        findAndInjectWebviews();
    }

    // Watch for new webviews being added
    const webviewObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName === 'WEBVIEW') {
                    console.log('New webview detected, injecting RTL support');
                    if (node.contentWindow) {
                        injectIntoWebview(node);
                    } else {
                        node.addEventListener('dom-ready', () => {
                            injectIntoWebview(node);
                        });
                    }
                }
            });
        });
    });

    webviewObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('RTL Support for Google Antigravity - Webview injection setup complete');
})();
