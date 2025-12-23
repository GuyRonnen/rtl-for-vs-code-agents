(function() {
    console.log('RTL Support - Running in Antigravity context');

    // Hebrew and Arabic character ranges
    const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFB4F]/;

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
        if (!proseContainer) {
            return;
        }

        // Get text content excluding code blocks
        let textToCheck = '';
        const walker = document.createTreeWalker(
            proseContainer,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip text inside code blocks
                    let parent = node.parentElement;
                    while (parent && parent !== proseContainer) {
                        if (parent.classList.contains('code') || parent.tagName === 'PRE' || parent.tagName === 'CODE') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let count = 0;
        while (walker.nextNode() && count < 100) {
            textToCheck += walker.currentNode.textContent;
            count++;
        }

        const firstText = textToCheck.trim().substring(0, 100);
        if (!isRTL(firstText)) {
            return;
        }

        // Apply RTL to all text elements inside (p, h3, h4, li, etc.)
        const textElements = proseContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
        textElements.forEach(element => {
            element.style.direction = 'rtl';
            element.style.textAlign = 'right';
        });

        // Also handle the lists themselves (ol, ul)
        const lists = proseContainer.querySelectorAll('ol, ul');
        lists.forEach(list => {
            list.style.direction = 'rtl';
            list.style.textAlign = 'right';
        });

        // CRITICAL: Keep code blocks LTR
        const codeBlocks = proseContainer.querySelectorAll('div.code, pre, code');
        codeBlocks.forEach(block => {
            block.style.direction = 'ltr';
            block.style.textAlign = 'left';
        });
    }

    function ensureCodeBlocksLTR() {
        // Force all code blocks to be LTR immediately
        const codeBlocks = document.querySelectorAll('div.code, pre, code');
        codeBlocks.forEach(block => {
            block.style.direction = 'ltr';
            block.style.textAlign = 'left';
        });
    }

    function processElements() {
        // Target user messages with class="whitespace-pre-wrap"
        const userMessages = document.querySelectorAll('.whitespace-pre-wrap');
        userMessages.forEach(applyRTLToElement);

        // Target agent messages - look for prose containers
        const agentContainers = document.querySelectorAll('div.prose.prose-sm');
        agentContainers.forEach(processAgentMessage);

        // Ensure all code blocks are LTR
        ensureCodeBlocksLTR();
    }

    // Initial processing
    processElements();

    // Watch for DOM changes and process immediately - no debouncing, no polling
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    // Immediately handle code blocks
                    if (node.tagName === 'PRE' || node.tagName === 'CODE' ||
                        (node.classList && node.classList.contains('code'))) {
                        node.style.direction = 'ltr';
                        node.style.textAlign = 'left';
                    }

                    // Check for code blocks inside the node
                    const codeBlocks = node.querySelectorAll('div.code, pre, code');
                    if (codeBlocks.length > 0) {
                        codeBlocks.forEach(block => {
                            block.style.direction = 'ltr';
                            block.style.textAlign = 'left';
                        });
                    }

                    // Process user messages immediately
                    if (node.classList && node.classList.contains('whitespace-pre-wrap')) {
                        applyRTLToElement(node);
                    }

                    // Process agent message containers immediately
                    if (node.classList && node.classList.contains('prose') && node.classList.contains('prose-sm')) {
                        processAgentMessage(node);
                    }

                    // Also check child elements and process immediately
                    const userMsgChildren = node.querySelectorAll('.whitespace-pre-wrap');
                    if (userMsgChildren.length > 0) {
                        userMsgChildren.forEach(applyRTLToElement);
                    }

                    const agentContainers = node.querySelectorAll('div.prose.prose-sm');
                    if (agentContainers.length > 0) {
                        agentContainers.forEach(processAgentMessage);
                    }

                    // IMPORTANT: If a paragraph is added inside an existing prose container,
                    // we need to process the parent container
                    if (node.tagName === 'P' || node.tagName === 'H1' || node.tagName === 'H2' ||
                        node.tagName === 'H3' || node.tagName === 'H4' || node.tagName === 'H5' ||
                        node.tagName === 'H6' || node.tagName === 'LI') {
                        const proseContainer = node.closest('div.prose.prose-sm');
                        if (proseContainer) {
                            processAgentMessage(proseContainer);
                        }
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: false // Not needed - childList catches everything
    });

    console.log('RTL Support for Google Antigravity - Active');
})();
