
// SillyTavern Extension: Quick Formatting (Floating)
(function() {
    const extensionName = "Quick Formatting";
    const extensionId = "quick-formatting-floating";

    const buttons = [
        { label: '**', start: '**', end: '**', title: 'Action / Description' },
        { label: '""', start: '"', end: '"', title: 'Dialogue' },
        { label: 'OOC', start: '(OOC: ', end: ')', title: 'Out of Character' },
        { label: 'Code', start: '```\n', end: '\n```', title: 'Internal Thought / Code' }
    ];

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

        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function createFloatingToolbar() {
        const textarea = document.getElementById('send_textarea');
        if (!textarea) return;

        if (document.getElementById('qt-floating-toolbar')) return;

        // Ensure the parent container can handle absolute positioning
        const container = textarea.parentElement;
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const toolbar = document.createElement('div');
        toolbar.id = 'qt-floating-toolbar';
        toolbar.className = 'qt-floating-toolbar';

        buttons.forEach((btnConfig, index) => {
            const btn = document.createElement('div');
            btn.className = 'qt-btn';
            btn.textContent = btnConfig.label;
            btn.title = btnConfig.title;
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent focus loss issues
                insertAtCursor(btnConfig.start, btnConfig.end);
            });

            toolbar.appendChild(btn);
            
            // Add a small visual separator for grouping (optional logic)
            if (index === 1 || index === 2) {
                const sep = document.createElement('div');
                sep.className = 'qt-separator';
                toolbar.appendChild(sep);
            }
        });

        // Append to the container so it floats relative to the text area
        container.appendChild(toolbar);
    }

    jQuery(document).ready(function() {
        setTimeout(createFloatingToolbar, 1000);
        
        const observer = new MutationObserver((mutations) => {
            if (!document.getElementById('qt-floating-toolbar')) {
                createFloatingToolbar();
            }
        });
        
        const target = document.querySelector('#bottom-area') || document.body;
        observer.observe(target, { childList: true, subtree: true });
    });
})();
