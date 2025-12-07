
// SillyTavern Extension: Quick Formatting (Fixed Overlay)
// Version: 1.3.0
(function() {
    const LOG_PREFIX = '[Quick Formatting]:';
    console.log(LOG_PREFIX, 'Extension initializing in Fixed Overlay mode...');

    const buttons = [
        { label: '**', start: '**', end: '**', title: 'Action / Description' },
        { label: '""', start: '"', end: '"', title: 'Dialogue' },
        { label: 'OOC', start: '(OOC: ', end: ')', title: 'Out of Character' },
        { label: 'Code', start: '```\n', end: '\n```', title: 'Internal Thought / Code' }
    ];

    let toolbar = null;

    function insertAtCursor(startTag, endTag) {
        const textarea = document.getElementById('send_textarea');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);

        const before = text.substring(0, start);
        const after = text.substring(end);
        const newValue = before + startTag + selectedText + endTag + after;

        textarea.value = newValue;

        const newCursorPos = start + startTag.length + selectedText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();

        // Trigger input event so SillyTavern knows text changed
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function createToolbar() {
        if (document.getElementById('qt-fixed-toolbar')) return;

        console.log(LOG_PREFIX, 'Creating DOM elements...');
        toolbar = document.createElement('div');
        toolbar.id = 'qt-fixed-toolbar';
        toolbar.className = 'qt-floating-toolbar';
        
        // Populate buttons
        buttons.forEach((btnConfig, index) => {
            const btn = document.createElement('div');
            btn.className = 'qt-btn';
            btn.textContent = btnConfig.label;
            btn.title = btnConfig.title;
            
            // Use mousedown to prevent focus loss from textarea
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                insertAtCursor(btnConfig.start, btnConfig.end);
            });

            toolbar.appendChild(btn);
            
            if (index === 1 || index === 2) {
                const sep = document.createElement('div');
                sep.className = 'qt-separator';
                toolbar.appendChild(sep);
            }
        });

        // Attach directly to body to avoid overflow/z-index issues from ST containers
        document.body.appendChild(toolbar);
        console.log(LOG_PREFIX, 'Toolbar attached to document.body');
    }

    // Animation loop to track position
    function updatePosition() {
        // If toolbar not created yet, do nothing
        if (!toolbar) return;

        const textarea = document.getElementById('send_textarea');
        
        // If textarea doesn't exist or is hidden, hide toolbar
        if (!textarea || textarea.offsetParent === null) {
            toolbar.style.opacity = '0';
            toolbar.style.pointerEvents = 'none';
            return;
        }

        const rect = textarea.getBoundingClientRect();

        // If rect is invalid (collapsed), hide
        if (rect.width === 0 || rect.height === 0) {
            toolbar.style.opacity = '0';
            toolbar.style.pointerEvents = 'none';
            return;
        }

        // Show toolbar
        toolbar.style.opacity = '1';
        toolbar.style.pointerEvents = 'auto';

        // Calculate position: Centered above textarea
        const toolbarHeight = 45; // Approximate height including padding/margin
        const topPos = rect.top - toolbarHeight;
        const leftPos = rect.left + (rect.width / 2);

        toolbar.style.top = `${topPos}px`;
        toolbar.style.left = `${leftPos}px`;
    }

    // Initialize
    const init = () => {
        createToolbar();
        
        // Start the tracking loop
        const loop = () => {
            updatePosition();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    };

    // Robust start: wait for load, but also try immediately if document is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
    
    // Fallback: Sometimes extensions load before the body is fully ready in ST
    setTimeout(init, 1000);
})();
