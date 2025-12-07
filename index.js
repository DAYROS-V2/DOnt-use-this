// index.js
jQuery(document).ready(function () {
    const buttons = [
        { label: '**', start: '**', end: '**', title: 'Action (**)' },
        { label: '""', start: '"', end: '"', title: 'Dialogue (")' },
        { label: 'OOC', start: '(OOC: ', end: ')', title: 'OOC' },
        { label: 'CODE', start: '```', end: '```', title: 'Code/Thought' }
    ];

    // Create toolbar container
    const $toolbar = $('<div class="quick-format-toolbar"></div>');

    buttons.forEach(btn => {
        const $btn = $('<button class="quick-format-btn" title="' + btn.title + '">' + btn.label + '</button>');
        
        $btn.on('click', function(e) {
            e.preventDefault();
            const textarea = document.getElementById('send_textarea');
            if (!textarea) return;

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const before = text.substring(0, start);
            const selected = text.substring(start, end);
            const after = text.substring(end);

            textarea.value = before + btn.start + selected + btn.end + after;
            
            // Trigger input event for frameworks like React/Vue used in ST
            textarea.dispatchEvent(new Event('input', { bubbles: true }));

            textarea.focus();
            
            // Cursor placement logic
            if (selected.length === 0) {
                 const newPos = start + btn.start.length;
                 textarea.setSelectionRange(newPos, newPos);
            } else {
                 const newPos = start + btn.start.length + selected.length + btn.end.length;
                 textarea.setSelectionRange(newPos, newPos);
            }
        });

        $toolbar.append($btn);
    });

    const injectExtension = () => {
        const $textarea = $('#send_textarea');
        
        // Avoid duplicate injection
        if ($('.quick-format-toolbar').length) return;
        if (!$textarea.length) return;

        // Create a wrapper to stack toolbar above textarea 
        const $wrapper = $('<div class="st-format-wrapper"></div>');
        
        // Insert wrapper before textarea
        $textarea.before($wrapper);
        
        // Move toolbar and textarea into wrapper
        $wrapper.append($toolbar);
        $wrapper.append($textarea);
        
        console.log('Compact Formatting Extension: Injected successfully.');
    };

    // Attempt injection with retries
    setTimeout(injectExtension, 500);
    setTimeout(injectExtension, 2000);
    setTimeout(injectExtension, 5000);
    
    // Observer for dynamic UI reloads
    const observer = new MutationObserver((mutations) => {
        if (!document.querySelector('.quick-format-toolbar') && document.getElementById('send_textarea')) {
            injectExtension();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});
