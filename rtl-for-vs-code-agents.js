/**
 * RTL Support for VS Code AI Chat Agents
 * Supports Hebrew, Arabic, Persian, and other RTL languages
 *
 * Works with: GitHub Copilot Chat, Claude Code, Gemini CLI, and other AI chat extensions
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

    // Track elements that had RTL applied — survives React re-renders that strip data attributes
    const rtlTrackedElements = new WeakSet();

    // Configuration
    const CONFIG = {
        // Font settings - includes fonts for Hebrew, Arabic, Persian
        fontFamily: '"Segoe UI", "Arial Hebrew", "David", "Miriam", "Tahoma", "Arial", sans-serif',
        fontSize: '14px',
        lineHeight: '1.6',

        // Selectors for chat content (add more as needed for different agents)
        chatSelectors: [
            // Cursor (Composer / Agent panel) — all leaf text nodes under .conversations
            '.markdown-root > div',
            // Copilot
            '.chat-markdown-part.rendered-markdown',
            '.chat-markdown-part',
            '.rendered-markdown',
            // Codex (OpenAI) — user messages
            '[data-content-search-unit-key$=":user"] .text-size-chat',
            // Codex (OpenAI) — assistant + Previous Messages (p/li/ol/ul with text-size-chat)
            'p.text-size-chat',
            'li.text-size-chat',
            'ol.text-size-chat',
            'ul.text-size-chat',
            // Claude Code (new version - using partial class matching for dynamic hashes)
            '[class*="message_"][class*="userMessageContainer_"]', // User message outer wrapper (has both classes)
            '[class*="timelineMessage_"]', // Agent/timeline messages container
            '[class*="root_"]', // Agent message content root (contains p, ul, ol, etc.)
            // Gemini CLI
            '.history-item-text',   // User and agent messages
            // Antigravity (Google)
            '.whitespace-pre-wrap', // User messages
            'div.prose.prose-sm',   // Agent messages
            // Claude Code - AskUserQuestion popup
            '[class*="questionTextLarge_"]',  // question text
            '[class*="optionLabel_"]',        // option label
            '[class*="optionDescription_"]',  // option description text
            '[class*="navTab_"]'              // navigation tab buttons (button has defined width → text-align works)
        ],

        // Selectors for input boxes
        inputSelectors: [
            // Codex composer input
            '.ProseMirror[data-codex-composer="true"]',
            // Claude Code input box
            'div[contenteditable="plaintext-only"][role="textbox"][aria-label="Message input"]',
            // Gemini CLI input box
            '.chat-submit-input[contenteditable="plaintext-only"]',
            // Copilot input box
            '.view-line',
            // Claude Code - AskUserQuestion "Other" free-text input
            '[class*="otherInput_"] [contenteditable="plaintext-only"]',
            // Claude Code - Permission request reject message input
            '[class*="rejectMessageInput_"] [contenteditable="plaintext-only"]'
        ],

        // How often to check for new content (ms)
        checkInterval: 500
    };

    // Constants for CSS-based RTL (Monaco Editor inputs)
    const RTL_STYLE_ID = 'rtl-monaco-style';
    const RTL_MODE_CLASS = 'rtl-mode-active';

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

    // -------------------------------------------------------------------------
    // Markdown / document editor guard (NOT the whole editor chrome)
    // -------------------------------------------------------------------------
    // v1.0.6 used .editor-container / .editor-group-container — too broad;
    // Cursor can host Composer chat under those wrappers, which disabled RTL.
    //
    // Skip only surfaces that match the real Markdown document editor / preview:
    // - Cursor's react markdown editor (.markdown-editor-react, data-variant=document)
    // - Classic VS Code Markdown Preview tab (.markdown-body inside .editor-container)
    const SKIP_RTL_ZONE_SELECTOR = [
        '.markdown-editor-react',
        '.ui-rich-text-editor[data-variant="document"]',
        '.markdown-preview',
        '.editor-container .markdown-body'
    ].join(', ');

    // Text nodes must resolve through their parent: characterData mutations report
    // the text node itself, and returning false for those let every keystroke /
    // re-render inside a Markdown document schedule a full processElements() pass.
    function isInsideEditorArea(node) {
        if (!node) return false;
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || !el.closest) return false;
        return !!el.closest(SKIP_RTL_ZONE_SELECTOR);
    }

    // RTL_RANGES compiled into one character class. These run per character over
    // whole messages/tables on every 200ms tick, so the previous per-character
    // Array.some() closure showed up as real time on large documents.
    const RTL_CHAR_RE = new RegExp('[' + RTL_RANGES.map(r =>
        '\\u' + r.start.toString(16).padStart(4, '0') +
        '-\\u' + r.end.toString(16).padStart(4, '0')
    ).join('') + ']');
    const LETTER_RE = /\p{L}/u;

    // Direction only depends on the leading text and the overall letter mix, so a
    // cap keeps very large blocks (long docs, wide tables) from being rescanned in full.
    const DIRECTION_SCAN_LIMIT = 4000;

    /**
     * Check if a character is RTL
     */
    function isRTLChar(char) {
        return RTL_CHAR_RE.test(char);
    }

    /**
     * Check if text contains RTL characters
     */
    function containsRTL(text) {
        if (!text) return false;
        return RTL_CHAR_RE.test(text);
    }

    /**
     * Smart RTL detection based on first strong character + majority fallback.
     * Scans for the first Unicode letter (skipping emojis, numbers, punctuation, bullets):
     * - First strong char is RTL → always true
     * - First strong char is LTR → true only if ≥30% of all letters are RTL
     * - No letters found → false
     *
     * Examples:
     *   "🎉 שלום"        → skip 🎉, space → ש is RTL → true
     *   "• פריט ראשון"   → skip •, space → פ is RTL → true
     *   "Hello עולם"     → H is LTR, RTL < 30% → false
     *   "1.1 Migration: הוספת שדות WhatsApp ו-table העדפות מטופל"
     *                    → M is LTR, but RTL ≥ 30% → true
     */
    function shouldBeRTLText(text) {
        if (!text) return false;
        let trimmed = text.trim();
        if (!trimmed) return false;
        if (trimmed.length > DIRECTION_SCAN_LIMIT) {
            trimmed = trimmed.slice(0, DIRECTION_SCAN_LIMIT);
        }

        let firstStrongIsRTL = null;
        let rtlCount = 0;
        let ltrCount = 0;

        for (const char of trimmed) {
            if (isRTLChar(char)) {
                rtlCount++;
                if (firstStrongIsRTL === null) firstStrongIsRTL = true;
            } else if (LETTER_RE.test(char)) {
                ltrCount++;
                if (firstStrongIsRTL === null) firstStrongIsRTL = false;
            }
            // else: neutral character (emoji, number, punctuation, space) - skip
        }

        if (firstStrongIsRTL === null) return false; // no letters at all
        if (firstStrongIsRTL) return true; // first strong char is RTL → always RTL

        // First strong char is LTR - check if at least 30% of letters are RTL
        const totalLetters = rtlCount + ltrCount;
        return totalLetters > 0 && (rtlCount / totalLetters) >= 0.3;
    }

    /**
     * Get the first text content from an element's subtree
     */
    function getFirstTextContent(element) {
        // Skip code blocks
        if (element.tagName === 'PRE' || element.tagName === 'CODE') {
            return '';
        }

        // Skip attachment containers (Claude Code user message attachments)
        // These contain LTR text like filenames ("image.png", "711×170") that would
        // incorrectly cause the RTL detector to classify Hebrew messages as LTR
        if (element.matches && element.matches('[class*="userMessageAttachments_"], [class*="pill_"]')) {
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
        return shouldBeRTLText(firstText);
    }

    /**
     * Inject an RLM (Right-to-Left Mark) character at the start of an element
     * to anchor BiDi direction when the first child is an inline element with LTR text
     */
    function injectRLM(el) {
        const RLM = '\u200F';
        const first = el.firstChild;
        // Already injected?
        if (first && first.nodeType === Node.TEXT_NODE && first.textContent.startsWith(RLM)) return;
        el.insertBefore(document.createTextNode(RLM), first);
    }

    /**
     * Apply RTL styling to an element
     */
    function applyRTL(element) {
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
        element.style.unicodeBidi = 'isolate';
        element.style.fontFamily = CONFIG.fontFamily;
        element.setAttribute('data-rtl-applied', 'true');
        rtlTrackedElements.add(element);

        // Apply to buttons specifically to ensure both properties are set
        element.querySelectorAll('button').forEach(btn => {
            if (containsRTL(btn.textContent)) {
                btn.style.direction = 'rtl';
                btn.style.textAlign = 'right';
            }
        });

        // Apply to paragraphs - check each child independently
        element.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6').forEach(el => {
            if (shouldBeRTLText(el.textContent)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.unicodeBidi = 'isolate';
                if (el.tagName === 'LI') {
                    el.style.listStylePosition = 'inside';
                }
                // Inject RLM (Right-to-Left Mark) at the start to anchor BiDi direction
                // when the first visible child is an inline element with LTR content
                injectRLM(el);
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

        // Apply to tables (chat markdown, plan docs, etc.)
        element.querySelectorAll('table').forEach(applyTableRTL);

        // Keep code blocks LTR (including div.code for Copilot)
        element.querySelectorAll('div.code, pre, code').forEach(el => {
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
        rtlTrackedElements.delete(element);
    }

    /**
     * Apply RTL styling to input boxes.
     * In 'uniform' mode: entire box is RTL (direction: rtl, text-align: right).
     * In 'per-line' mode: browser auto-detects direction per paragraph (dir="auto").
     */
    function applyInputRTL(element) {
        const mode = getInputDirMode();
        element.style.fontFamily = CONFIG.fontFamily;
        element.setAttribute('data-rtl-input', 'true');

        if (mode === 'per-line') {
            element.setAttribute('dir', 'auto');
            element.style.direction = '';
            element.style.textAlign = '';
            element.style.unicodeBidi = 'plaintext';
        } else {
            element.removeAttribute('dir');
            element.style.direction = 'rtl';
            element.style.textAlign = 'right';
            element.style.unicodeBidi = 'plaintext';
        }

        // Sync RTL to mentionMirror sibling (Claude Code 2.1.76+)
        syncMirrorRTL(element, true);
    }

    /**
     * Remove RTL styling from input boxes
     */
    function removeInputRTL(element) {
        element.removeAttribute('dir');
        element.style.direction = 'ltr';
        element.style.textAlign = 'left';
        element.style.unicodeBidi = '';
        element.removeAttribute('data-rtl-input');

        // Sync LTR to mentionMirror sibling
        syncMirrorRTL(element, false);
    }

    /**
     * Sync RTL/LTR direction to the mentionMirror sibling element.
     * In Claude Code 2.1.76+, the input text is transparent (color: #0000)
     * and the visible text is rendered by a mentionMirror div with position: absolute.
     * Both must have matching direction for the caret to align with visible text.
     */
    function syncMirrorRTL(inputElement, isRTL) {
        const mirror = inputElement.parentElement &&
            inputElement.parentElement.querySelector('[class*="mentionMirror"]');
        if (!mirror) return;

        if (isRTL) {
            const mode = getInputDirMode();
            if (mode === 'per-line') {
                mirror.setAttribute('dir', 'auto');
                mirror.style.direction = '';
                mirror.style.textAlign = '';
                mirror.style.unicodeBidi = 'plaintext';
            } else {
                mirror.removeAttribute('dir');
                mirror.style.direction = 'rtl';
                mirror.style.textAlign = 'right';
                mirror.style.unicodeBidi = 'plaintext';
            }
            mirror.style.fontFamily = CONFIG.fontFamily;
        } else {
            mirror.removeAttribute('dir');
            mirror.style.direction = '';
            mirror.style.textAlign = '';
            mirror.style.unicodeBidi = '';
            mirror.style.fontFamily = '';
        }
    }

    /**
     * Inject CSS rules for RTL support in Monaco Editor (one-time operation)
     * This prevents flickering because CSS applies immediately when elements are created
     */
    function injectRTLStyles() {
        if (document.getElementById(RTL_STYLE_ID)) {
            return; // Already injected
        }

        const style = document.createElement('style');
        style.id = RTL_STYLE_ID;
        style.textContent = `
            /* RTL Mode for Monaco Editor Inputs (Copilot) */
            .${RTL_MODE_CLASS} .view-line,
            .${RTL_MODE_CLASS} .view-line[dir="ltr"] {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: bidi-override !important;
                font-family: ${CONFIG.fontFamily} !important;
            }

            /* Counter Claude Code's * { direction: ltr; unicode-bidi: bidi-override } rule —
               apply broadly to all chat content, not just RTL-marked elements */
            [class*="message_"] *,
            [class*="timelineMessage_"] *,
            [class*="root_"] *,
            .rendered-markdown *,
            [class*="questionTextLarge_"] *,
            [class*="optionLabel_"] *,
            [class*="optionDescription_"] *,
            [data-content-search-unit-key$=":user"] *,
            [data-content-search-unit-key$=":assistant"] *,
            .text-size-chat,
            .text-size-chat *,
            [data-rtl-applied="true"],
            [data-rtl-applied="true"] * {
                unicode-bidi: plaintext !important;
            }
            [data-rtl-input="true"],
            [data-rtl-input="true"] + [class*="mentionMirror"] {
                unicode-bidi: plaintext !important;
            }
            /* Maintain code blocks as LTR within RTL containers */
            [data-rtl-applied="true"] pre,
            [data-rtl-applied="true"] pre *,
            [data-rtl-applied="true"] code,
            [data-rtl-applied="true"] code * {
                unicode-bidi: embed !important;
                direction: ltr !important;
                text-align: left !important;
            }

            /* Cursor streamdown — during streaming, each word is wrapped in its own
               <span data-sd-animate="true"> for the word-by-word fade-in animation,
               and Cursor wraps bold/italic groups in <span data-streamdown="strong">.

               With unicode-bidi: isolate (the broad rule applied to chat content),
               each span becomes its own bidi unit ordered by DOM order, which under
               an RTL parent makes Hebrew words appear in reverse order — visible
               most clearly on bold text during streaming.

               Setting unicode-bidi: normal on these spans lets them rejoin the
               parent <p>'s bidi flow, so the bidi algorithm sees the whole sentence
               as one RTL run and orders words correctly. After streaming ends Cursor
               merges the per-word spans into a single span; both states work with
               this rule. */
            [data-sd-animate="true"],
            [data-streamdown] {
                unicode-bidi: normal !important;
            }

            /* Chat markdown tables — flagged by applyTableRTL() */
            .markdown-root table[data-rtl-table="true"] {
                direction: rtl !important;
                text-align: right !important;
            }
            .markdown-root table[data-rtl-table="true"] th,
            .markdown-root table[data-rtl-table="true"] td {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }
            .markdown-root table[data-rtl-table="true"] [data-streamdown] {
                unicode-bidi: normal !important;
            }
            .markdown-root table[data-rtl-table="true"] pre,
            .markdown-root table[data-rtl-table="true"] code {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: embed !important;
            }

            /* Markdown document preview — gated on [data-rtl-md], which
               markMarkdownDocumentDirection() writes on the wrapper ABOVE the editor's
               ProseMirror root. Everything below that root must be styled by CSS only:
               ProseMirror re-parses its DOM on any external mutation, so inline styles,
               attributes or RLM marks written inside it start a parse-render loop that
               blocked the renderer for up to 80s on large documents.

               plaintext gives each block its own direction from its first strong
               character, so a Hebrew paragraph and an English one can sit side by side. */
            [data-rtl-md] p,
            [data-rtl-md] li,
            [data-rtl-md] h1,
            [data-rtl-md] h2,
            [data-rtl-md] h3,
            [data-rtl-md] h4,
            [data-rtl-md] h5,
            [data-rtl-md] h6,
            [data-rtl-md] blockquote,
            [data-rtl-md] th,
            [data-rtl-md] td {
                unicode-bidi: plaintext !important;
                text-align: start !important;
            }

            /* An RTL-dominant document needs a real direction on the content root:
               plaintext only orders text, it can't move list markers, blockquote
               rules or table columns to the other side. */
            [data-rtl-md="rtl"] .ProseMirror,
            [data-rtl-md="rtl"].markdown-preview,
            [data-rtl-md="rtl"].markdown-body {
                direction: rtl !important;
            }

            /* Stock markdown styling hardcodes physical sides; mirror them for RTL. */
            [data-rtl-md="rtl"] blockquote {
                border-left-width: 0 !important;
                border-right-width: 5px !important;
                border-right-style: solid !important;
            }
            [data-rtl-md="rtl"] table {
                margin-left: auto !important;
            }

            /* Code is never prose — keep it LTR whatever the surrounding block does. */
            [data-rtl-md] pre,
            [data-rtl-md] pre code,
            [data-rtl-md] code {
                direction: ltr !important;
                unicode-bidi: isolate !important;
                text-align: left !important;
            }

            /* Codex composer */
            [data-codex-composer="true"],
            [data-codex-composer="true"] p {
                unicode-bidi: plaintext !important;
            }
            [data-codex-composer="true"][data-rtl-input="true"],
            [data-codex-composer="true"][data-rtl-input="true"] p {
                direction: rtl !important;
                text-align: right !important;
            }

            /* Codex thread title and short labels */
            [style*="view-transition-name: header-title"] [data-rtl-applied="true"],
            [style*="view-transition-name: header-title"] [data-rtl-applied="true"] * {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: plaintext !important;
            }
            [style*="view-transition-name: header-title"] .truncate[data-rtl-applied="true"] {
                white-space: normal !important;
                overflow: visible !important;
                text-overflow: clip !important;
            }

            /* Codex Previous Messages (collapsed section) — assistant paragraphs */
            .group.flex.min-w-0.flex-col > div > p.text-size-chat[data-rtl-applied="true"] {
                unicode-bidi: isolate !important;
            }

            /* Codex message text — override blue tint with neutral colors */
            .dark [data-content-search-unit-key$=":user"] .text-size-chat,
            html:not(.light) [data-content-search-unit-key$=":user"] .text-size-chat {
                color: #e3e3e3 !important;
            }
            .dark [data-content-search-unit-key$=":assistant"] .text-size-chat,
            .dark p.text-size-chat.leading-relaxed,
            html:not(.light) [data-content-search-unit-key$=":assistant"] .text-size-chat,
            html:not(.light) p.text-size-chat.leading-relaxed {
                color: #d0d0d0 !important;
            }
            .light [data-content-search-unit-key$=":user"] .text-size-chat {
                color: #1a1a1a !important;
            }
            .light [data-content-search-unit-key$=":assistant"] .text-size-chat,
            .light p.text-size-chat.leading-relaxed {
                color: #333333 !important;
            }

            /* Claude Code Chat History List - unconditional overrides */
            [class*="sessionName_"] {
                overflow: auto !important;
                text-overflow: unset !important;
                white-space: normal !important;
            }
            [class*="sessionItem_"] {
                height: auto !important;
                min-height: 28px !important;
                padding: 8px !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
                border-radius: 0 !important;
            }
            [class*="sessionItem_"]:last-child {
                border-bottom: none !important;
            }
            [class*="dropdown_"] {
                width: max(400px, 100vw - 32px) !important;
                max-height: 70% !important;
            }

            /* Claude Code Chat History Header Button - unconditional overrides */
            [class*="sessionsButtonText_"],
            [class*="titleTextInner_"] {
                white-space: normal !important;
                display: -webkit-box !important;
                -webkit-line-clamp: 3 !important;
                -webkit-box-orient: vertical !important;
                overflow: hidden !important;
            }
            [class*="sessionsButtonContent_"],
            [class*="titleGroup_"] {
                max-width: unset !important;
            }
            [class*="sessionsButton_"],
            [class*="titleText_"] {
                max-width: unset !important;
            }

            /* Expand collapsed user messages from ~3 lines to ~5 lines */
            [class*="userMessage_"] [class*="content_"][class*="collapsed_"] {
                max-height: 100px !important;
            }

            /* Codex user message collapse (Show more / Show less) */
            [data-content-search-unit-key$=":user"] .text-size-chat.rtl-collapsed {
                max-height: 6.5em;
                overflow: hidden;
                position: relative;
            }
            [data-content-search-unit-key$=":user"] .text-size-chat.rtl-collapsed::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 2em;
                background: linear-gradient(transparent, var(--token-input-background, #2a2a2a));
                pointer-events: none;
            }
            .rtl-show-more-btn {
                display: none;
                background: none;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 8px;
                color: rgba(255,255,255,0.7);
                font-size: 11px;
                padding: 2px 10px;
                cursor: pointer;
                margin-top: 4px;
                transition: opacity 0.15s;
            }
            .rtl-show-more-btn:hover {
                background: rgba(255,255,255,0.08);
                color: rgba(255,255,255,0.9);
            }
            [data-content-search-unit-key$=":user"]:hover .rtl-show-more-btn,
            .rtl-show-more-btn.rtl-expanded {
                display: inline-block;
            }

            /* Claude Code UI accent borders */
            [class*="header_"]:has([class*="titleText_"]) {
                border: 2px solid #c8a2f8 !important;
            }
            /* User message borders — injected dynamically by applyUserMessageBorder() */

            /* Copilot / VS Code Chat — user message accent border (also dynamic) */

            /* Bright scrollbar for chat panel */
            * {
                scrollbar-color: rgba(255, 255, 255, 0.45) transparent !important;
                scrollbar-width: auto !important;
            }
            ::-webkit-scrollbar {
                width: 10px !important;
                height: 10px !important;
            }
            ::-webkit-scrollbar-track {
                background: transparent !important;
            }
            ::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.45) !important;
                border-radius: 5px !important;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.7) !important;
            }

            /* User message navigation buttons — inline in footer bar */
            #rtl-msg-nav {
                display: flex;
                gap: 2px;
                align-items: center;
            }
            #rtl-msg-nav button {
                width: 20px;
                height: 20px;
                border: none;
                border-radius: 4px;
                background: transparent;
                color: var(--app-secondary-foreground, rgba(255,255,255,0.5));
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                opacity: 0.6;
                transition: opacity 0.15s, background 0.15s;
            }
            #rtl-msg-nav button:hover {
                opacity: 1;
                background: rgba(255,255,255,0.08);
            }
            #rtl-msg-nav button svg {
                width: 14px;
                height: 14px;
            }
            @keyframes rtl-nav-highlight {
                0%   { box-shadow: 0 0 0 0 rgba(249,131,131,0.7); }
                50%  { box-shadow: 0 0 8px 3px rgba(249,131,131,0.5); }
                100% { box-shadow: 0 0 0 0 rgba(249,131,131,0); }
            }
            .rtl-nav-highlight {
                animation: rtl-nav-highlight 0.9s ease-out !important;
            }

            /* Search match highlights inside messages */
            mark.rtl-search-mark {
                background: rgba(255, 200, 0, 0.35) !important;
                color: inherit !important;
                padding: 0 1px;
                border-radius: 2px;
            }
            mark.rtl-search-mark.rtl-search-mark-active {
                background: rgba(255, 165, 0, 0.7) !important;
                outline: 1px solid rgba(255, 140, 0, 0.9);
            }

            /* Input direction mode toggle button */
            #rtl-input-dir-btn {
                font-size: 13px;
                line-height: 1;
                opacity: 0.4;
                transition: opacity 0.2s, transform 0.15s;
            }
            #rtl-input-dir-btn.input-dir-perline {
                opacity: 1;
                transform: scale(1.15);
            }

            /* YOLO mode toggle button */
            #rtl-yolo-btn {
                font-size: 13px;
                line-height: 1;
                filter: grayscale(1);
                transition: filter 0.2s, transform 0.15s;
            }
            #rtl-yolo-btn.yolo-active {
                filter: grayscale(0);
                transform: scale(1.15);
            }
            @keyframes yolo-pulse {
                0%, 100% { filter: grayscale(0); transform: scale(1.15); }
                50%      { filter: grayscale(0); transform: scale(1.3); }
            }
            #rtl-yolo-btn.yolo-active {
                animation: yolo-pulse 1.5s ease-in-out infinite;
            }
            /* YOLO countdown overlay */
            .yolo-countdown {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                background: rgba(30, 30, 30, 0.92);
                border: 1px solid rgba(249, 131, 131, 0.5);
                border-radius: 6px;
                position: fixed;
                bottom: 60px;
                right: 16px;
                z-index: 99999;
                box-shadow: 0 2px 12px rgba(0,0,0,0.4);
                font-family: system-ui, sans-serif;
                font-size: 12px;
                color: rgba(255,255,255,0.85);
            }
            .yolo-countdown-bar-track {
                width: 120px;
                height: 6px;
                background: rgba(255,255,255,0.1);
                border-radius: 3px;
                overflow: hidden;
            }
            .yolo-countdown-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #f98383, #ff6b6b);
                border-radius: 3px;
                transition: width 0.1s linear;
            }
            .yolo-countdown-no {
                background: #d32f2f;
                color: #fff;
                border: none;
                border-radius: 4px;
                padding: 2px 8px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                white-space: nowrap;
            }
            .yolo-countdown-no:hover {
                background: #b71c1c;
            }

            /* YOLO settings popup (right-click on 💪) */
            .yolo-settings-popup {
                position: fixed;
                z-index: 100000;
                background: var(--vscode-menu-background, #252526);
                border: 2px solid rgba(200, 200, 200, 0.45);
                border-radius: 6px;
                padding: 8px 10px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);
                font-family: system-ui, sans-serif;
                font-size: 12px;
                color: var(--vscode-menu-foreground, rgba(255,255,255,0.85));
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 8px;
                min-width: 220px;
            }
            .yolo-settings-row {
                display: flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
            }
            .yolo-settings-check {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                user-select: none;
            }
            .yolo-settings-check input[type="checkbox"] {
                margin: 0;
            }
            .yolo-settings-popup input[type="number"] {
                width: 48px;
                padding: 2px 4px;
                border: 1px solid var(--vscode-input-border, #3c3c3c);
                border-radius: 3px;
                background: var(--vscode-input-background, #1e1e1e);
                color: var(--vscode-input-foreground, #ccc);
                font-size: 12px;
                text-align: center;
            }
            .yolo-settings-popup .yolo-settings-hint {
                opacity: 0.55;
                font-size: 10px;
            }

            /* Border toggle popup (right-click on ↑↓) */
            .rtl-border-popup {
                position: fixed;
                z-index: 100000;
                background: var(--vscode-menu-background, #252526);
                border: 1px solid var(--vscode-menu-border, #454545);
                border-radius: 6px;
                padding: 8px 10px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);
                font-family: system-ui, sans-serif;
                font-size: 12px;
                color: var(--vscode-menu-foreground, rgba(255,255,255,0.85));
                display: flex;
                align-items: center;
                gap: 8px;
                white-space: nowrap;
                cursor: pointer;
                user-select: none;
            }
            .rtl-border-popup:hover {
                background: var(--vscode-menu-selectionBackground, #094771);
            }
            .rtl-border-toggle {
                width: 32px;
                height: 16px;
                border-radius: 8px;
                background: rgba(255,255,255,0.15);
                position: relative;
                transition: background 0.2s;
                flex-shrink: 0;
            }
            .rtl-border-toggle.on {
                background: #4caf50;
            }
            .rtl-border-toggle::after {
                content: '';
                position: absolute;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #fff;
                top: 2px;
                left: 2px;
                transition: transform 0.2s;
            }
            .rtl-border-toggle.on::after {
                transform: translateX(16px);
            }

            /* Search in conversation — button + top bar */
            #rtl-search-btn {
                font-size: 13px;
                line-height: 1;
                opacity: 0.6;
                transition: opacity 0.15s;
            }
            #rtl-search-btn:hover { opacity: 1; }

            #rtl-search-bar {
                position: fixed;
                bottom: 60px;
                right: 16px;
                z-index: 100000;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 8px;
                background: var(--vscode-editorWidget-background, #252526);
                border: 2px solid rgba(200, 200, 200, 0.45);
                border-radius: 6px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);
                font-family: system-ui, sans-serif;
                font-size: 12px;
                color: var(--vscode-editorWidget-foreground, rgba(255,255,255,0.85));
                direction: ltr;
            }
            #rtl-search-bar input.rtl-search-input {
                width: 220px;
                padding: 3px 6px;
                border: 1px solid var(--vscode-input-border, #3c3c3c);
                border-radius: 3px;
                background: var(--vscode-input-background, #1e1e1e);
                color: var(--vscode-input-foreground, #ccc);
                font-size: 12px;
                outline: none;
            }
            #rtl-search-bar input.rtl-search-input:focus {
                border-color: var(--vscode-focusBorder, #007fd4);
            }
            #rtl-search-bar .rtl-search-counter {
                min-width: 42px;
                text-align: center;
                opacity: 0.75;
                font-variant-numeric: tabular-nums;
            }
            #rtl-search-bar .rtl-search-counter.no-matches { color: #f98383; }
            #rtl-search-bar button.rtl-search-btn {
                width: 22px; height: 22px;
                border: none; border-radius: 3px;
                background: transparent;
                color: var(--vscode-editorWidget-foreground, rgba(255,255,255,0.8));
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                padding: 0; opacity: 0.7;
            }
            #rtl-search-bar button.rtl-search-btn:hover {
                opacity: 1;
                background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08));
            }
            #rtl-search-bar button.rtl-search-btn:disabled {
                opacity: 0.3; cursor: default; background: transparent;
            }
            #rtl-search-bar button.rtl-search-btn svg { width: 12px; height: 12px; }
            #rtl-search-bar button.rtl-search-close { font-size: 16px; line-height: 1; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Find the stable Monaco editor parent for a view-line element
     * This parent persists across keystrokes, unlike .view-line which is recreated
     */
    function findMonacoParent(viewLineElement) {
        // Look for the monaco-editor container (most stable)
        let parent = viewLineElement.closest('.monaco-editor');
        if (parent) return parent;

        // Fallback to view-lines
        parent = viewLineElement.closest('.view-lines');
        return parent || viewLineElement.parentElement;
    }

    /**
     * Process Monaco Editor input boxes for RTL
     * Uses CSS class toggle on parent instead of inline styles to prevent flickering
     */
    function processMonacoInputs() {
        if (!getMonacoRTLEnabled()) return;
        const viewLines = document.querySelectorAll('.view-line');

        viewLines.forEach(viewLine => {
            const text = viewLine.textContent || '';
            const hasRTL = containsRTL(text);
            const monacoParent = findMonacoParent(viewLine);

            if (!monacoParent) return;

            const isCurrentlyRTL = monacoParent.classList.contains(RTL_MODE_CLASS);

            if (hasRTL && !isCurrentlyRTL) {
                monacoParent.classList.add(RTL_MODE_CLASS);
            } else if (!hasRTL && isCurrentlyRTL) {
                monacoParent.classList.remove(RTL_MODE_CLASS);
            }
        });
    }

    /**
     * Process input boxes
     */
    function processInputs() {
        const selector = CONFIG.inputSelectors.join(', ');
        const inputs = document.querySelectorAll(selector);
        const monacoRtlOff = !getMonacoRTLEnabled();

        inputs.forEach(input => {
            // When Monaco RTL is disabled, skip view-lines that live inside a regular code editor
            // (monaco-mouse-cursor-text is the class on the code editor's view-lines container)
            if (monacoRtlOff && input.classList && input.classList.contains('view-line') &&
                input.closest('.monaco-mouse-cursor-text')) {
                // If we previously applied RTL, undo it
                if (input.getAttribute('data-rtl-input') === 'true') removeInputRTL(input);
                return;
            }

            // Get the current text content
            const text = input.textContent || input.innerText || '';
            const hasRTL = containsRTL(text);
            const wasRTL = input.getAttribute('data-rtl-input') === 'true';

            if (hasRTL && !wasRTL) {
                applyInputRTL(input);
            } else if (!hasRTL && wasRTL) {
                removeInputRTL(input);
            }

            // Add event listener for real-time changes if not already added
            if (!input.hasAttribute('data-rtl-listener')) {
                input.setAttribute('data-rtl-listener', 'true');

                // Listen for input events
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

    /**
     * User message navigation — track current index
     */
    let navCurrentIndex = -1;

    // ─── Search in conversation — state ───────────────────────────
    let searchMatches = [];
    let searchCurrentIndex = -1;
    let searchDebounceId = null;
    let searchQuery = '';

    // ─── YOLO Mode (auto-approve with countdown) ──────────────────
    let yoloPollId = null;
    let yoloRunning = false;
    let yoloCountdownActive = false;  // true while a countdown is in progress
    let yoloCancelledBtn = null;      // ref to the button the user cancelled — skip until it leaves DOM
    let yoloCountdownCancel = null;   // cancel function for active countdown
    const YOLO_LS_KEY = 'rtl-yolo-delay-ms';
    const YOLO_AUTO_APPROVE_PLANS_LS_KEY = 'rtl-yolo-auto-approve-plans';
    const YOLO_POLL_MS = 500;
    const BORDER_LS_KEY = 'rtl-user-msg-border';
    const INPUT_DIR_MODE_LS_KEY = 'rtl-input-dir-mode'; // 'uniform' (default) or 'per-line'
    const MONACO_RTL_LS_KEY = 'rtl-monaco-enabled'; // true (default) or false
    const MD_PREVIEW_RTL_LS_KEY = 'rtl-md-preview-enabled'; // true (default) or false

    // Seed localStorage from injected config (only if not already set by user)
    if (localStorage.getItem(YOLO_LS_KEY) === null) {
        const seed = (window.__RTL_CONFIG__ && typeof window.__RTL_CONFIG__.yoloDelayMs === 'number')
            ? window.__RTL_CONFIG__.yoloDelayMs : 5000;
        localStorage.setItem(YOLO_LS_KEY, String(seed));
    }
    if (localStorage.getItem(YOLO_AUTO_APPROVE_PLANS_LS_KEY) === null) {
        localStorage.setItem(YOLO_AUTO_APPROVE_PLANS_LS_KEY, 'false');
    }
    if (localStorage.getItem(BORDER_LS_KEY) === null) {
        const seed = (window.__RTL_CONFIG__ && typeof window.__RTL_CONFIG__.userMessageBorder === 'boolean')
            ? window.__RTL_CONFIG__.userMessageBorder : true;
        localStorage.setItem(BORDER_LS_KEY, String(seed));
    }
    if (localStorage.getItem(INPUT_DIR_MODE_LS_KEY) === null) {
        const seed = (window.__RTL_CONFIG__ && window.__RTL_CONFIG__.inputDirMode)
            ? window.__RTL_CONFIG__.inputDirMode : 'uniform';
        localStorage.setItem(INPUT_DIR_MODE_LS_KEY, seed);
    }
    // Monaco RTL — always sync from __RTL_CONFIG__ so Settings change takes effect after Disable/Enable Custom CSS
    if (window.__RTL_CONFIG__ && typeof window.__RTL_CONFIG__.monacoRtlEnabled === 'boolean') {
        localStorage.setItem(MONACO_RTL_LS_KEY, String(window.__RTL_CONFIG__.monacoRtlEnabled));
    } else if (localStorage.getItem(MONACO_RTL_LS_KEY) === null) {
        localStorage.setItem(MONACO_RTL_LS_KEY, 'true');
    }
    // Markdown preview RTL — same always-sync rule as Monaco above
    if (window.__RTL_CONFIG__ && typeof window.__RTL_CONFIG__.markdownPreviewRtl === 'boolean') {
        localStorage.setItem(MD_PREVIEW_RTL_LS_KEY, String(window.__RTL_CONFIG__.markdownPreviewRtl));
    } else if (localStorage.getItem(MD_PREVIEW_RTL_LS_KEY) === null) {
        localStorage.setItem(MD_PREVIEW_RTL_LS_KEY, 'true');
    }

    /** Read YOLO delay dynamically — changes take effect on next poll without reload */
    function getYoloDelayMs() {
        const v = parseInt(localStorage.getItem(YOLO_LS_KEY), 10);
        return isNaN(v) ? 5000 : v;
    }
    function setYoloDelayMs(ms) {
        localStorage.setItem(YOLO_LS_KEY, String(Math.max(0, ms)));
    }
    function getYoloAutoApprovePlans() {
        return localStorage.getItem(YOLO_AUTO_APPROVE_PLANS_LS_KEY) === 'true';
    }
    function setYoloAutoApprovePlans(on) {
        localStorage.setItem(YOLO_AUTO_APPROVE_PLANS_LS_KEY, String(!!on));
    }

    // ─── Input direction mode toggle ─────────────────────────────────
    function getInputDirMode() {
        return localStorage.getItem(INPUT_DIR_MODE_LS_KEY) === 'per-line' ? 'per-line' : 'uniform';
    }
    function setInputDirMode(mode) {
        localStorage.setItem(INPUT_DIR_MODE_LS_KEY, mode);
        reapplyInputDirection();
    }

    // ─── Monaco Editor RTL toggle ─────────────────────────────────────────────
    function getMonacoRTLEnabled() {
        return localStorage.getItem(MONACO_RTL_LS_KEY) !== 'false';
    }
    function setMonacoRTLEnabled(on) {
        localStorage.setItem(MONACO_RTL_LS_KEY, String(on));
        // If disabling, remove the RTL class from all Monaco editors immediately
        if (!on) {
            document.querySelectorAll('.' + RTL_MODE_CLASS).forEach(el => {
                el.classList.remove(RTL_MODE_CLASS);
            });
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    /** Re-apply direction to all active inputs after mode toggle */
    function reapplyInputDirection() {
        document.querySelectorAll(CONFIG.inputSelectors.join(', ')).forEach(input => {
            if (input.getAttribute('data-rtl-input') === 'true') {
                applyInputRTL(input);
            }
        });
    }

    // ─── User message border toggle ──────────────────────────────────
    function getUserMessageBorder() {
        return localStorage.getItem(BORDER_LS_KEY) !== 'false';
    }
    function setUserMessageBorder(on) {
        localStorage.setItem(BORDER_LS_KEY, String(on));
        applyUserMessageBorder();
    }

    /** Dynamically inject or remove the user message border style */
    function applyUserMessageBorder() {
        const STYLE_ID = 'rtl-user-msg-border-style';
        let el = document.getElementById(STYLE_ID);
        const enabled = getUserMessageBorder();

        if (enabled) {
            if (!el) {
                el = document.createElement('style');
                el.id = STYLE_ID;
                el.textContent = `
                    [class*="userMessage_"] {
                        border: 2px solid #f98383 !important;
                    }
                    .interactive-request .chat-markdown-part {
                        border: 2px solid #f98383 !important;
                        border-radius: 4px;
                        padding: 4px 8px;
                    }
                    [data-content-search-unit-key$=":user"] .rounded-2xl {
                        border: 2px solid #f98383 !important;
                    }
                `;
                document.head.appendChild(el);
            }
        } else {
            if (el) el.remove();
        }
    }

    // Apply on startup
    applyUserMessageBorder();
    // ────────────────────────────────────────────────────────────────

    function findYesButton(doc) {
        if (!doc) return null;

        // --- Codex approval dialog ---
        // Has a radiogroup with "Yes" selected (aria-checked="true") + separate Submit button
        const radioGroup = doc.querySelector('[role="radiogroup"]');
        if (radioGroup) {
            const yesRadio = radioGroup.querySelector('button[role="radio"][aria-checked="true"][aria-label="Yes"]');
            if (yesRadio) {
                // Find the Submit button in the same approval panel
                const panel = radioGroup.closest('.flex.flex-col.gap-1');
                if (panel) {
                    // Look for the button whose text includes "Submit"
                    const allBtns = panel.querySelectorAll('button');
                    for (const btn of allBtns) {
                        if (btn.textContent?.includes('Submit')) {
                            return btn;
                        }
                    }
                }
            }
        }

        // --- Claude Code approval dialog ---
        const buttons = doc.querySelectorAll('button');

        // Strategy 1: button with "Yes" text and a span containing "1"
        for (const button of buttons) {
            const text = button.textContent?.trim() || '';
            if (text.includes('Yes')) {
                const span = button.querySelector('span');
                if (span && span.textContent?.trim() === '1') {
                    return button;
                }
            }
        }

        // Strategy 2: exact text patterns
        for (const button of buttons) {
            const text = button.textContent?.trim() || '';
            if (text === '1 Yes' || text === 'Yes 1' || text === '1Yes') {
                return button;
            }
        }

        // Strategy 3: any button with "Yes" and a digit
        for (const button of buttons) {
            const text = button.textContent?.trim() || '';
            if (text.includes('Yes') && /\d/.test(text)) {
                return button;
            }
        }

        // Recursively check iframes
        const iframes = doc.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                    const found = findYesButton(iframeDoc);
                    if (found) return found;
                }
            } catch (e) { /* cross-origin */ }
        }
        return null;
    }

    function isPlanApprovalButton(button) {
        if (!button) return false;

        const buttonText = (button.textContent || '').toLowerCase();
        if (buttonText.includes('auto-accept')) return true;

        let el = button;
        for (let i = 0; el && i < 6; i++, el = el.parentElement) {
            const text = (el.textContent || '').toLowerCase();
            if (
                text.includes('accept this plan?') &&
                (
                    text.includes('yes, and manually approve edits') ||
                    text.includes('no, keep planning') ||
                    text.includes('auto-accept')
                )
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Show a countdown overlay, then click the button.
     * Returns a cancel function. If the user cancels (NO!) the button is NOT clicked.
     */
    function showCountdown(targetButton) {
        yoloCountdownActive = true;

        // Build overlay
        const overlay = document.createElement('div');
        overlay.className = 'yolo-countdown';

        const label = document.createElement('span');
        label.textContent = '💪 YOLO';

        const track = document.createElement('div');
        track.className = 'yolo-countdown-bar-track';
        const fill = document.createElement('div');
        fill.className = 'yolo-countdown-bar-fill';
        fill.style.width = '100%';
        track.appendChild(fill);

        const timer = document.createElement('span');
        timer.style.minWidth = '28px';
        timer.style.textAlign = 'center';

        const noBtn = document.createElement('button');
        noBtn.className = 'yolo-countdown-no';
        noBtn.textContent = 'NO!';

        overlay.appendChild(label);
        overlay.appendChild(track);
        overlay.appendChild(timer);
        overlay.appendChild(noBtn);
        document.body.appendChild(overlay);

        const delayMs = getYoloDelayMs(); // snapshot once per countdown
        const startTime = Date.now();
        let cancelled = false;
        let animFrame;

        function tick() {
            // If the Yes button disappeared (user clicked YES manually), cancel silently
            if (!targetButton.isConnected && !cancelled) {
                cleanup();
                console.log('YOLO: Yes button gone (manual click?) — countdown dismissed');
                return;
            }

            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, delayMs - elapsed);
            const pct = (remaining / delayMs) * 100;
            fill.style.width = pct + '%';
            timer.textContent = (remaining / 1000).toFixed(1) + 's';

            if (remaining <= 0 && !cancelled) {
                cleanup();
                if (targetButton.isConnected) {
                    console.log('YOLO: auto-clicking Yes');
                    targetButton.click();
                }
                return;
            }
            animFrame = requestAnimationFrame(tick);
        }

        function cleanup() {
            yoloCountdownActive = false;
            yoloCountdownCancel = null;
            cancelAnimationFrame(animFrame);
            overlay.remove();
        }

        function cancel() {
            cancelled = true;
            // Remember this button so poll skips it until it leaves the DOM
            yoloCancelledBtn = targetButton;
            cleanup();
            console.log('YOLO: cancelled by user');
        }

        noBtn.addEventListener('click', (e) => { e.stopPropagation(); cancel(); });
        animFrame = requestAnimationFrame(tick);

        yoloCountdownCancel = cancel;
        return cancel;
    }

    /** Poll for Yes buttons; when found start a countdown instead of clicking immediately */
    function yoloPoll() {
        if (yoloCountdownActive) return; // countdown in progress, skip

        // Clear cancelled-button ref once it leaves the DOM
        if (yoloCancelledBtn && !yoloCancelledBtn.isConnected) {
            yoloCancelledBtn = null;
        }

        const btn = findYesButton(document);
        if (btn) {
            // Skip if this is the same button the user already cancelled
            if (btn === yoloCancelledBtn) return;
            if (isPlanApprovalButton(btn) && !getYoloAutoApprovePlans()) return;

            // 0 delay = instant approve, no progress bar
            if (getYoloDelayMs() <= 0) {
                console.log('YOLO: instant auto-clicking Yes');
                btn.click();
                return;
            }

            showCountdown(btn);
        }
    }

    function startYolo() {
        if (yoloRunning) return;
        yoloRunning = true;
        yoloPoll();
        yoloPollId = setInterval(yoloPoll, YOLO_POLL_MS);
        console.log('💪 YOLO mode ON');
    }

    function stopYolo() {
        if (!yoloRunning) return;
        yoloRunning = false;
        if (yoloPollId) { clearInterval(yoloPollId); yoloPollId = null; }
        // Remove any active countdown overlay
        const overlay = document.querySelector('.yolo-countdown');
        if (overlay) overlay.remove();
        yoloCountdownActive = false;
        console.log('💪 YOLO mode OFF');
    }

    function toggleYolo() {
        yoloRunning ? stopYolo() : startYolo();
        // Update button visual
        const btn = document.getElementById('rtl-yolo-btn');
        if (btn) btn.classList.toggle('yolo-active', yoloRunning);
        return yoloRunning;
    }
    // ────────────────────────────────────────────────────────────────

    /**
     * Show a small settings popup near the YOLO button (right-click)
     */
    function showYoloSettings(e) {
        // Remove any existing popup
        const existing = document.querySelector('.yolo-settings-popup');
        if (existing) { existing.remove(); return; }

        const popup = document.createElement('div');
        popup.className = 'yolo-settings-popup';

        const delayRow = document.createElement('div');
        delayRow.className = 'yolo-settings-row';

        const lbl = document.createElement('span');
        lbl.textContent = '⏱ Delay:';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '30';
        input.step = '1';
        input.value = String(getYoloDelayMs() / 1000);

        const unit = document.createElement('span');
        unit.textContent = 'sec';

        const hint = document.createElement('span');
        hint.className = 'yolo-settings-hint';
        hint.textContent = '(0 = instant)';

        delayRow.appendChild(lbl);
        delayRow.appendChild(input);
        delayRow.appendChild(unit);
        delayRow.appendChild(hint);
        popup.appendChild(delayRow);

        const plansToggle = document.createElement('label');
        plansToggle.className = 'yolo-settings-check';

        const plansCheckbox = document.createElement('input');
        plansCheckbox.type = 'checkbox';
        plansCheckbox.checked = getYoloAutoApprovePlans();

        const plansLabel = document.createElement('span');
        plansLabel.textContent = 'Auto Approve Plans';

        plansToggle.appendChild(plansCheckbox);
        plansToggle.appendChild(plansLabel);
        popup.appendChild(plansToggle);

        // Position near the button
        popup.style.bottom = '40px';
        popup.style.right = '16px';
        document.body.appendChild(popup);

        // Save on change
        input.addEventListener('input', () => {
            const secs = parseFloat(input.value);
            if (!isNaN(secs) && secs >= 0) {
                setYoloDelayMs(Math.round(secs * 1000));
            }
        });
        plansCheckbox.addEventListener('change', () => {
            setYoloAutoApprovePlans(plansCheckbox.checked);
        });

        // Close on outside click
        function onOutsideClick(ev) {
            if (!popup.contains(ev.target)) {
                popup.remove();
                document.removeEventListener('mousedown', onOutsideClick, true);
            }
        }
        // Delay listener so the current contextmenu event doesn't close it immediately
        setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);

        // Focus the input
        input.focus();
        input.select();
    }

    /**
     * Show a toggle popup for user message borders (right-click on ↑↓)
     */
    function showBorderToggle(e) {
        // Remove any existing popup
        const existing = document.querySelector('.rtl-border-popup');
        if (existing) { existing.remove(); return; }

        const popup = document.createElement('div');
        popup.className = 'rtl-border-popup';

        const toggle = document.createElement('div');
        toggle.className = 'rtl-border-toggle' + (getUserMessageBorder() ? ' on' : '');

        const lbl = document.createElement('span');
        lbl.textContent = 'User message border';

        popup.appendChild(toggle);
        popup.appendChild(lbl);

        // Position near the buttons
        popup.style.bottom = '40px';
        popup.style.right = '16px';
        document.body.appendChild(popup);

        // Toggle on click
        popup.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const newVal = !getUserMessageBorder();
            setUserMessageBorder(newVal);
            toggle.classList.toggle('on', newVal);
        });

        // Close on outside click
        function onOutsideClick(ev) {
            if (!popup.contains(ev.target)) {
                popup.remove();
                document.removeEventListener('mousedown', onOutsideClick, true);
            }
        }
        setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
    }

    /**
     * Inject navigation buttons (↑ ↓) above the chat input box
     */
    function injectMessageNavigation() {
        // Already injected
        if (document.getElementById('rtl-msg-nav')) return;

        // Build the shared nav element
        function buildNav() {
            const nav = document.createElement('div');
            nav.id = 'rtl-msg-nav';
            nav.addEventListener('mousedown', (e) => e.preventDefault());

            const upBtn = document.createElement('button');
            upBtn.title = 'Previous user message (↑)';
            upBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/></svg>';
            upBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); navigateUserMessages(-1); });
            upBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showBorderToggle(e); });

            const downBtn = document.createElement('button');
            downBtn.title = 'Next user message (↓)';
            downBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>';
            downBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); navigateUserMessages(1); });
            downBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showBorderToggle(e); });

            const yoloBtn = document.createElement('button');
            yoloBtn.id = 'rtl-yolo-btn';
            yoloBtn.title = 'YOLO mode: auto-approve all tool calls';
            yoloBtn.textContent = '💪';
            if (yoloRunning) yoloBtn.classList.add('yolo-active');
            yoloBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleYolo(); });
            yoloBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showYoloSettings(e); });

            const inputDirBtn = document.createElement('button');
            inputDirBtn.id = 'rtl-input-dir-btn';
            inputDirBtn.textContent = '⇔';
            const currentMode = getInputDirMode();
            inputDirBtn.title = currentMode === 'per-line'
                ? 'Input direction: per-line (click for uniform)'
                : 'Input direction: uniform (click for per-line)';
            if (currentMode === 'per-line') inputDirBtn.classList.add('input-dir-perline');
            inputDirBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const newMode = getInputDirMode() === 'uniform' ? 'per-line' : 'uniform';
                setInputDirMode(newMode);
                inputDirBtn.classList.toggle('input-dir-perline', newMode === 'per-line');
                inputDirBtn.title = newMode === 'per-line'
                    ? 'Input direction: per-line (click for uniform)'
                    : 'Input direction: uniform (click for per-line)';
            });

            const searchBtn = document.createElement('button');
            searchBtn.id = 'rtl-search-btn';
            searchBtn.title = 'Search in conversation';
            searchBtn.textContent = '🔍';
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (document.getElementById('rtl-search-bar')) {
                    closeSearchBar();
                } else {
                    openSearchBar();
                }
            });

            nav.appendChild(upBtn);
            nav.appendChild(downBtn);
            nav.appendChild(searchBtn);
            nav.appendChild(inputDirBtn);
            nav.appendChild(yoloBtn);
            return nav;
        }

        // --- Claude Code: insert before "Ask before edits" in inputFooter ---
        const footer = document.querySelector('[class*="inputFooter_"]');
        if (footer) {
            const permContainer = footer.querySelector('[class*="container_"][class*="_"]:has([class*="footerButtonPrimary_"])');
            if (permContainer) {
                footer.insertBefore(buildNav(), permContainer);
                return;
            }
        }

        // --- Codex: insert in the right column of composer-footer, before submit ---
        const codexComposer = document.querySelector('.ProseMirror[data-codex-composer="true"]');
        if (codexComposer) {
            const composerFooter = codexComposer.closest('.border-token-border')?.querySelector('.composer-footer');
            if (composerFooter) {
                // Right column: last child of the grid (contains submit button)
                const rightCol = composerFooter.querySelector(':scope > div:last-child');
                const submitBtn = rightCol?.querySelector('button');
                if (rightCol && submitBtn) {
                    rightCol.insertBefore(buildNav(), submitBtn);
                    return;
                }
            }
        }
    }

    /**
     * Navigate to the next/previous user message
     * @param {number} direction  -1 for up (previous), +1 for down (next)
     */
    function navigateUserMessages(direction) {
        // Claude Code user messages
        let msgs = Array.from(document.querySelectorAll(
            '[class*="message_"][class*="userMessageContainer_"]'
        ));
        // Codex user messages
        if (msgs.length === 0) {
            msgs = Array.from(document.querySelectorAll(
                '[data-content-search-unit-key$=":user"]'
            ));
        }
        if (msgs.length === 0) return;

        // Compute next index with cyclic wrap
        if (navCurrentIndex < 0 || navCurrentIndex >= msgs.length) {
            navCurrentIndex = direction === -1 ? msgs.length - 1 : 0;
        } else {
            navCurrentIndex += direction;
            if (navCurrentIndex < 0) navCurrentIndex = msgs.length - 1;
            if (navCurrentIndex >= msgs.length) navCurrentIndex = 0;
        }

        const target = msgs[navCurrentIndex];
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight pulse (short, one-shot)
        target.classList.remove('rtl-nav-highlight');
        void target.offsetWidth;
        target.classList.add('rtl-nav-highlight');
        target.addEventListener('animationend', () => {
            target.classList.remove('rtl-nav-highlight');
        }, { once: true });
    }

    // ─── Search in conversation ──────────────────────────────────
    const SEARCH_SELECTOR =
        '[class*="message_"][class*="userMessageContainer_"], ' +
        '[class*="timelineMessage_"], ' +
        '[data-content-search-unit-key$=":user"]';

    function unwrapSearchMarks() {
        document.querySelectorAll('mark.rtl-search-mark').forEach(mark => {
            const parent = mark.parentNode;
            if (!parent) return;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
        });
    }

    function wrapMatchesInElement(el, query) {
        if (!query) return [];
        const marks = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                const p = node.parentNode;
                if (!p) return NodeFilter.FILTER_REJECT;
                const tag = p.nodeName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
                return node.nodeValue.toLowerCase().includes(query)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });
        const textNodes = [];
        let n;
        while ((n = walker.nextNode())) textNodes.push(n);

        const qLen = query.length;
        textNodes.forEach(node => {
            const text = node.nodeValue;
            const lower = text.toLowerCase();
            const frag = document.createDocumentFragment();
            let i = 0, idx;
            while ((idx = lower.indexOf(query, i)) !== -1) {
                if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
                const mark = document.createElement('mark');
                mark.className = 'rtl-search-mark';
                mark.appendChild(document.createTextNode(text.slice(idx, idx + qLen)));
                frag.appendChild(mark);
                marks.push(mark);
                i = idx + qLen;
            }
            if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
            node.parentNode.replaceChild(frag, node);
        });
        return marks;
    }

    function collectSearchMatches(query) {
        unwrapSearchMarks();
        if (!query) return [];
        const containers = Array.from(document.querySelectorAll(SEARCH_SELECTOR));
        const allMarks = [];
        containers.forEach(el => {
            const marks = wrapMatchesInElement(el, query);
            allMarks.push(...marks);
        });
        return allMarks;
    }

    function scrollToSearchHit(el) {
        document.querySelectorAll('mark.rtl-search-mark-active')
            .forEach(m => m.classList.remove('rtl-search-mark-active'));
        el.classList.add('rtl-search-mark-active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function updateSearchCounter() {
        const bar = document.getElementById('rtl-search-bar');
        if (!bar) return;
        const counter = bar.querySelector('.rtl-search-counter');
        const upBtn = bar.querySelector('button.rtl-search-btn[data-dir="up"]');
        const downBtn = bar.querySelector('button.rtl-search-btn[data-dir="down"]');
        const total = searchMatches.length;
        const pos = total > 0 ? (searchCurrentIndex + 1) : 0;
        counter.textContent = `${pos}/${total}`;
        counter.classList.toggle('no-matches', searchQuery !== '' && total === 0);
        upBtn.disabled = total === 0;
        downBtn.disabled = total === 0;
    }

    function updateSearchResults() {
        const bar = document.getElementById('rtl-search-bar');
        if (!bar) return;
        const input = bar.querySelector('input.rtl-search-input');
        const raw = (input.value || '').trim();
        searchQuery = raw.toLowerCase();
        searchMatches = collectSearchMatches(searchQuery);
        if (searchMatches.length > 0) {
            searchCurrentIndex = 0;
            scrollToSearchHit(searchMatches[0]);
        } else {
            searchCurrentIndex = -1;
        }
        updateSearchCounter();
    }

    function navigateSearch(direction) {
        if (!searchQuery) return;
        const prevIndex = searchCurrentIndex;
        searchMatches = collectSearchMatches(searchQuery);
        if (searchMatches.length === 0) {
            searchCurrentIndex = -1;
            updateSearchCounter();
            return;
        }
        // Restore index (clamped) then apply direction
        if (prevIndex < 0 || prevIndex >= searchMatches.length) {
            searchCurrentIndex = direction === -1 ? searchMatches.length - 1 : 0;
        } else {
            searchCurrentIndex = prevIndex;
        }
        searchCurrentIndex += direction;
        if (searchCurrentIndex < 0) searchCurrentIndex = searchMatches.length - 1;
        if (searchCurrentIndex >= searchMatches.length) searchCurrentIndex = 0;
        scrollToSearchHit(searchMatches[searchCurrentIndex]);
        updateSearchCounter();
    }

    function onSearchInput() {
        if (searchDebounceId) clearTimeout(searchDebounceId);
        searchDebounceId = setTimeout(() => {
            searchDebounceId = null;
            updateSearchResults();
        }, 150);
    }

    function onSearchKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateSearch(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeSearchBar();
        }
    }

    function openSearchBar() {
        if (document.getElementById('rtl-search-bar')) return;

        const bar = document.createElement('div');
        bar.id = 'rtl-search-bar';
        bar.addEventListener('mousedown', (e) => e.stopPropagation());

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'rtl-search-input';
        input.placeholder = 'Search in conversation…';
        input.addEventListener('input', onSearchInput);
        input.addEventListener('keydown', onSearchKeydown);

        const counter = document.createElement('span');
        counter.className = 'rtl-search-counter';
        counter.textContent = '0/0';

        const upBtn = document.createElement('button');
        upBtn.className = 'rtl-search-btn';
        upBtn.dataset.dir = 'up';
        upBtn.title = 'Previous match (Shift+Enter)';
        upBtn.disabled = true;
        upBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/></svg>';
        upBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); navigateSearch(-1); });

        const downBtn = document.createElement('button');
        downBtn.className = 'rtl-search-btn';
        downBtn.dataset.dir = 'down';
        downBtn.title = 'Next match (Enter)';
        downBtn.disabled = true;
        downBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>';
        downBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); navigateSearch(1); });

        const closeBtn = document.createElement('button');
        closeBtn.className = 'rtl-search-btn rtl-search-close';
        closeBtn.dataset.dir = 'close';
        closeBtn.title = 'Close (Esc)';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeSearchBar(); });

        bar.appendChild(input);
        bar.appendChild(counter);
        bar.appendChild(upBtn);
        bar.appendChild(downBtn);
        bar.appendChild(closeBtn);

        document.body.appendChild(bar);
        input.focus();
    }

    function closeSearchBar() {
        if (searchDebounceId) { clearTimeout(searchDebounceId); searchDebounceId = null; }
        const bar = document.getElementById('rtl-search-bar');
        if (bar) bar.remove();
        unwrapSearchMarks();
        searchMatches = [];
        searchCurrentIndex = -1;
        searchQuery = '';
    }

    /**
     * Answer bubble inside a completed "Ask Question" transcript card
     * ([data-testid="agent-transcript-ask-question-card"]). Cursor renders this
     * as a plain `<div><span>text</span></div>` sibling of the question's
     * .markdown-root wrapper — it carries no semantic class, only hashed
     * build-time utility classes (e.g. "ui-1wd3ewq") that differ across Cursor
     * releases and can't be selected directly. The testid and the DOM depth
     * relative to it are the only stable anchors, so we walk from there and
     * exclude the question wrapper by its .markdown-root descendant.
     */
    function getAskQuestionAnswerBubbles() {
        const bubbles = [];
        document.querySelectorAll('[data-testid="agent-transcript-ask-question-card"]').forEach(card => {
            card.querySelectorAll(':scope > div > div > div').forEach(div => {
                if (div.classList.contains('markdown-root') || div.querySelector('.markdown-root')) return;
                bubbles.push(div);
            });
        });
        return bubbles;
    }

    /**
     * Cursor — conditionally apply RTL to user-side bubbles based on content.
     * Targets:
     *   .composer-human-message-content — regular user message bubbles
     *   .composer-questionnaire-toolbar — inline questionnaire / choice toolbar
     *   .user-questionnaire-answer-text — questionnaire answer bubble text
     *   getAskQuestionAnswerBubbles() — answer bubble in a completed ask-question
     *     transcript card (see comment above)
     * These don't go through processChildrenForRTL because they don't have
     * .markdown-root, so we flag them directly: Hebrew/Arabic flips to RTL,
     * English stays LTR.
     */
    function processCursorUserMessages() {
        const elements = document.querySelectorAll('.composer-human-message-content, .composer-questionnaire-toolbar, .user-questionnaire-answer-text');
        [...elements, ...getAskQuestionAnswerBubbles()].forEach(el => {
            const text = el.textContent || '';
            const hasRTL = shouldBeRTLText(text);
            const wasRTL = el.getAttribute('data-rtl-applied') === 'true';

            if (hasRTL && !wasRTL) {
                el.style.direction = 'rtl';
                // Multi-line messages (auto-wrapped or manual Enter) need text-align too —
                // direction alone only handles single-line bubbles via flex justify-content.
                el.style.textAlign = 'right';
                el.setAttribute('data-rtl-applied', 'true');
            } else if (!hasRTL && wasRTL) {
                el.style.direction = '';
                el.style.textAlign = '';
                el.removeAttribute('data-rtl-applied');
            }
        });
    }

    /**
     * Ensure all code blocks are LTR
     */
    function ensureCodeBlocksLTR() {
        // Force all code blocks to be LTR immediately
        const codeBlocks = document.querySelectorAll(
            'div.code, pre, code, ' +
            // Cursor agent message code blocks
            '.composer-message-codeblock, .ui-default-code, .ui-code-block-default-code'
        );
        codeBlocks.forEach(block => {
            // Don't touch code blocks in markdown preview / document editor — see SKIP_RTL_ZONE_SELECTOR
            // comment. A single .md preview can hold hundreds of <pre>/<code>
            // nodes and writing inline styles on each every 200ms freezes Cursor.
            if (isInsideEditorArea(block)) return;
            block.style.direction = 'ltr';
            block.style.textAlign = 'left';
            block.style.unicodeBidi = 'embed';
        });
    }

    /**
     * Apply RTL to a table: direction for BiDi/column flow + text-align on cells
     * so mixed Hebrew/English is readable and flush right (direction alone is not enough).
     */
    function applyTableRTL(table) {
        const text = table.textContent || '';
        const hasRTL = containsRTL(text);
        const wasRTL = table.getAttribute('data-rtl-table') === 'true';

        // Nothing to do unless the state changed or a re-render stripped our styles.
        if (hasRTL && wasRTL && table.style.direction === 'rtl') return;
        if (!hasRTL && !wasRTL) return;

        if (!hasRTL) {
            if (table.getAttribute('data-rtl-table') === 'true') {
                table.style.direction = '';
                table.style.textAlign = '';
                table.removeAttribute('data-rtl-table');
                table.querySelectorAll('th, td').forEach(cell => {
                    cell.style.direction = '';
                    cell.style.textAlign = '';
                    cell.style.unicodeBidi = '';
                    cell.removeAttribute('data-rtl-applied');
                });
            }
            return;
        }

        table.style.direction = 'rtl';
        table.style.textAlign = 'right';
        table.setAttribute('data-rtl-table', 'true');

        table.querySelectorAll('th, td').forEach(cell => {
            cell.style.direction = 'rtl';
            cell.style.textAlign = 'right';
            cell.style.unicodeBidi = 'isolate';
            cell.setAttribute('data-rtl-applied', 'true');
            if (shouldBeRTLText(cell.textContent)) {
                injectRLM(cell);
            }
        });

        table.querySelectorAll('pre, code').forEach(code => {
            code.style.direction = 'ltr';
            code.style.textAlign = 'left';
            code.style.unicodeBidi = 'embed';
        });
    }

    // Wrappers that sit ABOVE the ProseMirror root of a Markdown document view.
    // Confirmed against Cursor's DOM: .markdown-editor-react is seven levels above
    // div.tiptap.ProseMirror[contenteditable], and ProseMirror only observes its own
    // root downwards — so a write here is invisible to it. Nothing below that root
    // may be touched; see the [data-rtl-md] CSS block.
    const MD_DOC_WRAPPER_SELECTOR = [
        '.markdown-editor-react',
        '.ui-rich-text-editor[data-variant="document"]',
        '.markdown-preview',
        '.editor-container .markdown-body'
    ].join(', ');

    const mdDocDirectionCache = new WeakMap();
    const MD_DOC_RECHECK_MS = 3000;

    function getMarkdownPreviewRTLEnabled() {
        return localStorage.getItem(MD_PREVIEW_RTL_LS_KEY) !== 'false';
    }

    /**
     * Sample only enough leading text to decide a document's direction. These
     * documents get large and this runs on every pass, so it stops early and never
     * reads the whole thing. Code blocks are skipped — they're always Latin and
     * would drag a Hebrew document towards LTR.
     */
    function sampleLeadingText(root) {
        let text = '';
        let seen = 0;
        for (const child of root.children) {
            if (++seen > 20 || text.length >= 600) break;
            if (child.tagName === 'PRE') continue;
            text += ' ' + (child.textContent || '').slice(0, 400);
        }
        return text;
    }

    /**
     * Flag each Markdown document view with its overall direction for the CSS to
     * pick up. Re-reads the text only when the block count changed or the cached
     * answer went stale, and writes the attribute only when the value differs.
     */
    function markMarkdownDocumentDirection() {
        const enabled = getMarkdownPreviewRTLEnabled();

        document.querySelectorAll(MD_DOC_WRAPPER_SELECTOR).forEach(wrapper => {
            if (!enabled) {
                if (wrapper.hasAttribute('data-rtl-md')) wrapper.removeAttribute('data-rtl-md');
                return;
            }

            const content = wrapper.querySelector('.ProseMirror') || wrapper;
            const childCount = content.childElementCount;
            const cached = mdDocDirectionCache.get(wrapper);
            const now = Date.now();

            let value;
            if (cached && cached.childCount === childCount && now - cached.at < MD_DOC_RECHECK_MS) {
                value = cached.value;
            } else {
                value = shouldBeRTLText(sampleLeadingText(content)) ? 'rtl' : 'ltr';
                mdDocDirectionCache.set(wrapper, { value, childCount, at: now });
            }

            if (wrapper.getAttribute('data-rtl-md') !== value) {
                wrapper.setAttribute('data-rtl-md', value);
            }
        });
    }

    /**
     * Process individual child elements for RTL
     * This handles cases where a message starts in English but has Hebrew paragraphs
     */
    function processChildrenForRTL(element) {
        // Process paragraphs, headings, and list items
        element.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6').forEach(el => {
            // Skip if already processed and RTL
            if (el.style.direction === 'rtl') {
                return;
            }

            if (shouldBeRTLText(el.textContent)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.unicodeBidi = 'isolate';
                el.style.fontFamily = CONFIG.fontFamily;
                el.setAttribute('data-rtl-applied', 'true');
                if (el.tagName === 'LI') {
                    el.style.listStylePosition = 'inside';
                }
                injectRLM(el);
            }
        });

        // Process lists
        element.querySelectorAll('ul, ol').forEach(el => {
            // Skip if already processed and RTL
            if (el.style.direction === 'rtl') {
                return;
            }

            if (containsRTL(el.textContent)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.paddingRight = '20px';
                el.style.paddingLeft = '0';
                el.setAttribute('data-rtl-applied', 'true');
            }
        });

        element.querySelectorAll('table').forEach(applyTableRTL);
    }

    /**
     * Process Claude Code Planning webview — a separate webview with a #content div
     * containing rendered markdown (plan document).
     */
    function processPlanningWebview() {
        const content = document.getElementById('content');
        if (!content) return;
        // Only act in planning webview (has #comment-banner sibling)
        if (!document.getElementById('comment-banner')) return;

        processChildrenForRTL(content);
        // Also process direct block-level elements that processChildrenForRTL may skip
        content.querySelectorAll('blockquote, details, summary, td, th, dt, dd').forEach(el => {
            if (el.style.direction === 'rtl') return;
            if (shouldBeRTLText(el.textContent)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.unicodeBidi = 'isolate';
                el.style.fontFamily = CONFIG.fontFamily;
                el.setAttribute('data-rtl-applied', 'true');
            }
        });
    }

    /**
     * Collapse long Codex user messages with Show more / Show less toggle.
     */
    function processCodexUserMessageCollapse() {
        const containers = document.querySelectorAll('[data-content-search-unit-key$=":user"]');
        containers.forEach(container => {
            const textEl = container.querySelector('.text-size-chat');
            if (!textEl || textEl.hasAttribute('data-rtl-collapse-processed')) return;
            textEl.setAttribute('data-rtl-collapse-processed', 'true');

            // Wait for content to render, then check if it overflows
            requestAnimationFrame(() => {
                const lineHeight = parseFloat(getComputedStyle(textEl).lineHeight) || 22;
                const maxCollapsedHeight = lineHeight * 5; // ~5 lines
                if (textEl.scrollHeight <= maxCollapsedHeight + 10) return; // short message, skip

                textEl.classList.add('rtl-collapsed');

                const btn = document.createElement('button');
                btn.className = 'rtl-show-more-btn';
                btn.textContent = 'Show more';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isCollapsed = textEl.classList.contains('rtl-collapsed');
                    textEl.classList.toggle('rtl-collapsed');
                    btn.textContent = isCollapsed ? 'Show less' : 'Show more';
                    btn.classList.toggle('rtl-expanded', !isCollapsed);
                });

                // Insert button after the text element
                textEl.parentElement.appendChild(btn);
            });
        });
    }

    /**
     * Process Codex-specific compact UI elements such as thread title,
     * history items, menu labels, and question options.
     */
    function processCodexUI() {
        // Only target Codex-specific UI — thread title bar and history sidebar
        const uiElements = document.querySelectorAll([
            '[style*="view-transition-name: header-title"] .truncate',
            '[style*="view-transition-name: header-title"] button > span.truncate'
        ].join(', '));

        uiElements.forEach(el => {
            const text = (el.textContent || '').trim();
            const isRTL = shouldBeRTLText(text);

            if (isRTL) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.style.unicodeBidi = 'plaintext';
                el.setAttribute('data-rtl-ui', 'true');
                el.setAttribute('data-rtl-applied', 'true');

                if (el.classList.contains('truncate') || el.classList.contains('whitespace-nowrap')) {
                    el.style.whiteSpace = 'normal';
                    el.style.overflow = 'visible';
                    el.style.textOverflow = 'clip';
                }
            } else {
                el.style.direction = '';
                el.style.textAlign = '';
                el.style.unicodeBidi = '';
                el.style.whiteSpace = '';
                el.style.overflow = '';
                el.style.textOverflow = '';
                el.removeAttribute('data-rtl-ui');
            }
        });
    }

    /**
     * Process Claude Code chat history list items for RTL
     * Checks each sessionItem's sessionName content and conditionally applies RTL
     */
    function processHistoryList() {
        // Process session items in the dropdown list
        const sessionItems = document.querySelectorAll('[class*="sessionItem_"]');
        sessionItems.forEach(item => {
            const sessionName = item.querySelector('[class*="sessionName_"]');
            if (!sessionName) return;

            const text = sessionName.textContent || '';
            const isRTL = shouldBeRTLText(text);

            if (isRTL) {
                item.style.textAlign = 'right';
                sessionName.style.direction = 'rtl';
                sessionName.setAttribute('data-rtl-applied', 'true');
            } else {
                item.style.textAlign = '';
                sessionName.style.direction = '';
                sessionName.removeAttribute('data-rtl-applied');
            }
        });

        // Process the header button text (current session title)
        const buttonTexts = document.querySelectorAll('[class*="sessionsButtonText_"], [class*="titleTextInner_"]');
        buttonTexts.forEach(el => {
            const text = el.textContent || '';
            if (shouldBeRTLText(text)) {
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
                el.setAttribute('data-rtl-applied', 'true');
            } else {
                el.style.direction = '';
                el.style.textAlign = '';
                el.removeAttribute('data-rtl-applied');
            }
        });
    }

    /**
     * Process all chat elements (including Antigravity)
     */
    function processElements() {
        const selector = CONFIG.chatSelectors.join(', ');
        const elements = document.querySelectorAll(selector);

        elements.forEach(element => {
            // Skip markdown document editor / preview only — see SKIP_RTL_ZONE_SELECTOR
            if (isInsideEditorArea(element)) return;

            // Antigravity user message
            if (element.classList && element.classList.contains('whitespace-pre-wrap')) {
                // Simple RTL detection for user messages
                const text = element.textContent || '';
                if (containsRTL(text)) {
                    element.style.direction = 'rtl';
                    element.style.textAlign = 'right';
                    element.setAttribute('data-rtl-applied', 'true');
                } else if (element.getAttribute('data-rtl-applied') === 'true') {
                    element.style.direction = '';
                    element.style.textAlign = '';
                    element.removeAttribute('data-rtl-applied');
                }
                return;
            }
            // Antigravity agent message
            if (element.classList && element.classList.contains('prose') && element.classList.contains('prose-sm')) {
                // Only process if not already processed
                if (!element.hasAttribute('data-rtl-container-processed')) {
                    const firstText = (element.textContent || '').trim().substring(0, 100);
                    if (shouldBeRTLText(firstText)) {
                        element.setAttribute('data-rtl-container-processed', 'true');
                        // Apply RTL to text elements that should be RTL (check each independently)
                        element.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach(el => {
                            if (shouldBeRTLText(el.textContent)) {
                                el.style.direction = 'rtl';
                                el.style.textAlign = 'right';
                                el.setAttribute('data-rtl-applied', 'true');
                                if (el.tagName === 'LI') {
                                    el.style.listStylePosition = 'inside';
                                }
                            }
                        });
                        // Also handle lists (ol, ul)
                        element.querySelectorAll('ol, ul').forEach(list => {
                            list.style.direction = 'rtl';
                            list.style.textAlign = 'right';
                            list.setAttribute('data-rtl-applied', 'true');
                        });
                    }
                }
                return;
            }

            // Claude Code timeline/agent messages - process all child elements
            if (element.matches && element.matches('[class*="timelineMessage_"], [class*="root_"]')) {
                // Always re-process children — Rewind replaces inner elements
                // while the container keeps its data-rtl-container-processed attribute
                processChildrenForRTL(element);
                element.setAttribute('data-rtl-container-processed', 'true');
                return;
            }

            // Cursor agent messages - process all child elements
            if (element.classList && element.classList.contains('whitespace-normal')) {
                processChildrenForRTL(element);
                element.setAttribute('data-rtl-container-processed', 'true');
                return;
            }

            // Default logic for Copilot/Claude user messages
            const wasRTL = element.getAttribute('data-rtl-applied') === 'true';
            const needsRTL = shouldBeRTL(element);
            const trackedRTL = rtlTrackedElements.has(element);

            if (needsRTL && !wasRTL) {
                applyRTL(element);
            } else if (needsRTL && wasRTL && !element.style.direction) {
                // Re-apply RTL if styles were stripped (e.g. Rewind re-render)
                applyRTL(element);
            } else if (!needsRTL && trackedRTL && !wasRTL) {
                // React re-render stripped data-rtl-applied and changed text (e.g. Rewind menu)
                // Re-apply RTL since we know this element had Hebrew content before
                applyRTL(element);
            } else if (!needsRTL && wasRTL) {
                removeRTL(element);
            } else if (!needsRTL && !wasRTL && !trackedRTL) {
                // Even if parent is LTR, check children for Hebrew paragraphs
                // This handles messages that start in English but have Hebrew content
                processChildrenForRTL(element);
            }
        });

        // Also process input boxes
        processInputs();

        // Process chat history list items for RTL
        processHistoryList();

        // Process Codex thread title, history labels, and compact controls
        processCodexUI();

        // Collapse long Codex user messages
        processCodexUserMessageCollapse();

        // Process Claude Code Planning webview (separate tab)
        processPlanningWebview();

        // Cursor user messages — conditionally RTL based on content
        processCursorUserMessages();

        // Markdown document preview direction (attribute only, above ProseMirror)
        markMarkdownDocumentDirection();

        // Ensure all code blocks are LTR (run after RTL processing)
        ensureCodeBlocksLTR();

        // Inject user message navigation buttons above input
        injectMessageNavigation();
    }

    /**
     * Initialize the RTL support
     */
    function init() {
        // Inject CSS styles first (one-time) - prevents flickering in Monaco inputs
        injectRTLStyles();

        // Process existing elements
        processElements();

        // Watch for new elements and streaming content
        const observer = new MutationObserver((mutations) => {
            let hasNewNodes = false;
            let hasTextChanges = false;

            mutations.forEach((mutation) => {
                // Markdown document editor / preview — see SKIP_RTL_ZONE_SELECTOR.
                // Never react to these: ProseMirror re-renders constantly, and
                // answering each render with DOM writes deadlocks the renderer.
                if (isInsideEditorArea(mutation.target)) return;

                if (mutation.addedNodes.length > 0) {
                    hasNewNodes = true;
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            // Skip nodes inserted into the editor area (e.g.
                            // Markdown Preview rendering its content)
                            if (isInsideEditorArea(node)) return;

                            // Immediately handle code blocks
                            if (node.tagName === 'PRE' || node.tagName === 'CODE' ||
                                (node.classList && node.classList.contains('code'))) {
                                node.style.direction = 'ltr';
                                node.style.textAlign = 'left';
                                node.style.unicodeBidi = 'embed';
                            }

                            // Check for code blocks inside the node
                            const codeBlocks = node.querySelectorAll('div.code, pre, code');
                            if (codeBlocks.length > 0) {
                                codeBlocks.forEach(block => {
                                    block.style.direction = 'ltr';
                                    block.style.textAlign = 'left';
                                    block.style.unicodeBidi = 'embed';
                                });
                            }

                            // Immediately check if this node matches our chat selectors
                            const selector = CONFIG.chatSelectors.join(', ');
                            let chatElements = [];

                            // Check if the node itself is a chat element
                            if (node.matches && node.matches(selector)) {
                                chatElements.push(node);
                            }

                            // Check for chat elements inside the node
                            const childChatElements = node.querySelectorAll(selector);
                            if (childChatElements.length > 0) {
                                chatElements.push(...childChatElements);
                            }

                            // Process chat elements immediately
                            chatElements.forEach(element => {
                                if (isInsideEditorArea(element)) return;
                                // Claude Code timeline/agent messages - process all child elements
                                if (element.matches && element.matches('[class*="timelineMessage_"], [class*="root_"]')) {
                                    processChildrenForRTL(element);
                                    element.setAttribute('data-rtl-container-processed', 'true');
                                    return;
                                }

                                const wasRTL = element.getAttribute('data-rtl-applied') === 'true';
                                const needsRTL = shouldBeRTL(element);

                                if (needsRTL && !wasRTL) {
                                    applyRTL(element);
                                } else if (needsRTL && wasRTL && !element.style.direction) {
                                    applyRTL(element);
                                } else if (!needsRTL && wasRTL) {
                                    removeRTL(element);
                                } else if (!needsRTL && !wasRTL) {
                                    processChildrenForRTL(element);
                                }
                            });
                        }
                    });
                }
                if (mutation.type === 'characterData') {
                    hasTextChanges = true;
                }
            });

            // For streaming content updates, debounce and reprocess all
            if (hasTextChanges || hasNewNodes) {
                clearTimeout(window._rtlProcessTimeout);
                window._rtlProcessTimeout = setTimeout(() => {
                    processElements();
                }, 50);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true // Needed for streaming messages
        });

        // Process periodically — catches re-renders (e.g. Rewind) that the observer may miss
        setInterval(() => {
            processElements();
            processMonacoInputs(); // Monaco Editor inputs (Copilot) - uses CSS class toggle
            processInputs();       // Other inputs (Claude Code) - uses inline styles
            injectMessageNavigation(); // Ensure nav buttons exist (handles late DOM)
        }, 200);

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

    // Expose YOLO mode toggle and settings
    window.toggleYOLO = toggleYolo;
    window.setYoloDelay = function(secs) { setYoloDelayMs(Math.round(secs * 1000)); console.log('YOLO delay set to ' + secs + 's'); };
    window.getYoloDelay = function() { return getYoloDelayMs() / 1000; };
    window.setYoloAutoApprovePlans = function(on) { setYoloAutoApprovePlans(on); };
    window.getYoloAutoApprovePlans = function() { return getYoloAutoApprovePlans(); };

    // Expose function to check RTL status
    window.checkRTL = function(text) {
        console.log(`Text: "${text}"`);
        console.log(`Contains RTL: ${containsRTL(text)}`);
    };

    console.log('🔄 RTL for VS Code Agents loaded. Use window.refreshRTL() to manually refresh.');
})();
