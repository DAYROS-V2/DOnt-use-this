// index.js
// IMPORTS - Adjust depth based on install location: public/scripts/extensions/third-party/QuickFormatting
import { saveSettingsDebounced, getContext } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const EXTENSION_NAME = "QuickFormatting";
const SETTINGS_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}/settings.html`;

// Default Settings
const DEFAULT_SETTINGS = {
    provider: "openai",
    openai_key: "",
    openrouter_key: "",
    context_limit: 5,
    temp: 1.0,
    top_p: 1.0,
    top_k: 0,
    min_p: 0,
    bar_scale: 1.0
};

let isGenerating = false;
let abortController = null;
let lastInputState = ""; // For Undo

// PowerShell Style Logger
function log(msg, type = 'info') {
    const styles = {
        base: 'font-family: monospace; padding: 2px 5px; border-radius: 2px;',
        info: 'background: #012456; color: white;', // PowerShell Blue
        error: 'background: #8b0000; color: white;',
        success: 'background: #006400; color: white;'
    };
    console.log(`%c[PS] ${msg}`, styles.base + styles[type]);
}

async function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
    }
    
    // Inject Settings
    try {
        const response = await fetch(SETTINGS_PATH);
        if (!response.ok) throw new Error("Failed to load settings.html");
        const html = await response.text();
        $('#extensions_settings').append(html);
        
        bindSettingsUI();
        toggleKeyFields();
    } catch (e) {
        log(`Error loading settings: ${e.message}`, 'error');
    }
}

function bindSettingsUI() {
    const settings = extension_settings[EXTENSION_NAME];
    const inputs = [
        { id: '#qf_provider', key: 'provider' },
        { id: '#qf_openai_key', key: 'openai_key' },
        { id: '#qf_openrouter_key', key: 'openrouter_key' },
        { id: '#qf_context_limit', key: 'context_limit', type: 'number' },
        { id: '#qf_temp', key: 'temp', type: 'number' },
        { id: '#qf_top_p', key: 'top_p', type: 'number' },
        { id: '#qf_top_k', key: 'top_k', type: 'number' },
        { id: '#qf_min_p', key: 'min_p', type: 'number' }
    ];

    inputs.forEach(input => {
        $(input.id).val(settings[input.key]);
        $(input.id).on('input change', function() {
            let val = $(this).val();
            if (input.type === 'number') val = parseFloat(val);
            extension_settings[EXTENSION_NAME][input.key] = val;
            saveSettingsDebounced();
            if (input.key === 'provider') toggleKeyFields();
        });
    });
}

function toggleKeyFields() {
    const provider = $('#qf_provider').val();
    if (provider === 'openai') {
        $('#qf_openai_key_container').show();
        $('#qf_openrouter_key_container').hide();
    } else {
        $('#qf_openai_key_container').hide();
        $('#qf_openrouter_key_container').show();
    }
}

function buildToolbar() {
    const $toolbar = $('<div id="quick-formatting-bar"></div>');
    const settings = extension_settings[EXTENSION_NAME] || DEFAULT_SETTINGS;
    
    // Initial Scale
    updateScale($toolbar, settings.bar_scale);

    const buttons = [
        { label: '**', start: '**', end: '**' },
        { label: '""', start: '"', end: '"' },
        { label: '(OOC)', start: '(OOC: ', end: ')' },
        { label: 'code', start: '```\n', end: '\n```' }
    ];

    buttons.forEach(btn => {
        const $btn = $(`<button class="qf-btn">${btn.label}</button>`);
        $btn.on('click', (e) => {
            e.preventDefault();
            if ($toolbar.hasClass('edit-mode')) return;
            insertTag(btn.start, btn.end);
        });
        $toolbar.append($btn);
    });

    const $magicBtn = $('<button class="qf-btn magic-wand" title="AI Spell Check">🪄</button>');
    $magicBtn.on('click', async (e) => {
        e.preventDefault();
        if ($toolbar.hasClass('edit-mode')) return;
        
        if (isGenerating) {
            abortGeneration();
        } else {
            // Undo Logic
            if ($magicBtn.text() === '↩️') {
                $('#send_textarea').val(lastInputState).trigger('input');
                $magicBtn.text('🪄');
                log('Undo performed', 'info');
                return;
            }
            await runSpellCheck($magicBtn);
        }
    });
    $toolbar.append($magicBtn);

    // Edit Mode Toggle
    $toolbar.on('dblclick', function(e) {
        if ($(e.target).hasClass('qf-edit-control')) return;
        toggleEditMode($(this));
    });

    return $toolbar;
}

function toggleEditMode($toolbar) {
    $toolbar.toggleClass('edit-mode');
    const isEdit = $toolbar.hasClass('edit-mode');

    if (isEdit) {
        const $plus = $('<button class="qf-btn qf-edit-control">[+]</button>').click((e) => {
            e.stopPropagation();
            changeScale(0.1);
        });
        const $minus = $('<button class="qf-btn qf-edit-control">[-]</button>').click((e) => {
            e.stopPropagation();
            changeScale(-0.1);
        });
        const $save = $('<button class="qf-btn qf-edit-control" style="color:#4ade80">[SAVE]</button>').click((e) => {
            e.stopPropagation();
            toggleEditMode($toolbar);
        });
        $toolbar.append($plus, $minus, $save);
        log('Entered Edit Mode', 'info');
    } else {
        $toolbar.find('.qf-edit-control').remove();
        log('Exited Edit Mode', 'info');
    }
}

function changeScale(delta) {
    const settings = extension_settings[EXTENSION_NAME];
    settings.bar_scale = Math.max(0.5, (settings.bar_scale || 1) + delta);
    updateScale($('#quick-formatting-bar'), settings.bar_scale);
    saveSettingsDebounced();
}

function updateScale($toolbar, scale) {
    $toolbar.find('.qf-btn').css('font-size', (11 * scale) + 'px');
}

function insertTag(startTag, endTag) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    
    textarea.value = text.substring(0, start) + startTag + selected + endTag + text.substring(end);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    
    const newPos = selected.length === 0 ? start + startTag.length : start + startTag.length + selected.length + endTag.length;
    textarea.setSelectionRange(newPos, newPos);
}

async function runSpellCheck($btn) {
    const textarea = document.getElementById('send_textarea');
    const text = textarea.value;
    if (!text.trim()) return;

    const settings = extension_settings[EXTENSION_NAME];
    if (!settings.openai_key && !settings.openrouter_key) {
        alert("Please set an API Key in Extension Settings > Quick Formatting");
        return;
    }

    lastInputState = text;
    isGenerating = true;
    abortController = new AbortController();
    $btn.text('■').addClass('generating');

    // Get Context
    const context = getContext();
    const history = context.chat ? context.chat.slice(-(settings.context_limit || 5)) : [];
    
    const messages = [
        { role: "system", content: "You are a specialized roleplay copy editor. Enhance the user's input for flow, grammar, and vivid description while maintaining their voice. Return ONLY the enhanced text." },
        ...history.map(msg => ({ 
            role: msg.is_user ? "user" : "assistant", 
            content: msg.mes 
        })),
        { role: "user", content: `ENHANCE THIS INPUT:

${text}`}
    ];

    const apiKey = settings.provider === 'openai' ? settings.openai_key : settings.openrouter_key;
    const url = settings.provider === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions' 
        : 'https://openrouter.ai/api/v1/chat/completions';

    log(`Starting Gen | Provider: ${settings.provider} | Temp: ${settings.temp}`, 'info');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...(settings.provider === 'openrouter' ? { 'HTTP-Referer': 'https://sillytavern.app' } : {})
            },
            body: JSON.stringify({
                model: settings.provider === 'openai' ? 'gpt-3.5-turbo' : 'openai/gpt-3.5-turbo',
                messages: messages,
                temperature: settings.temp,
                top_p: settings.top_p,
                stream: true
            }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        
        textarea.value = ""; // Clear for streaming
        let generatedText = "";
        let tokens = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content;
                        if (content) {
                            generatedText += content;
                            textarea.value = generatedText;
                            textarea.dispatchEvent(new Event('input', { bubbles: true })); // Trigger ST autosize
                            tokens++;
                        }
                    } catch (e) { }
                }
            }
        }
        
        log(`Generation Complete. Tokens received: ${tokens}`, 'success');
        $btn.text('↩️'); // Offer undo

    } catch (err) {
        if (err.name === 'AbortError') {
            log('Generation Aborted by User', 'info');
            textarea.value = lastInputState;
        } else {
            log(`Generation Failed: ${err.message}`, 'error');
            alert('Error: ' + err.message);
            textarea.value = lastInputState;
        }
    } finally {
        isGenerating = false;
        abortController = null;
        $btn.removeClass('generating');
        if (!isGenerating && $btn.text() === '■') $btn.text('🪄');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function abortGeneration() {
    if (abortController) abortController.abort();
}

// Init
(function() {
    try {
        loadSettings();
        const $toolbar = buildToolbar();
        const $textarea = $('#send_textarea');
        const $wrapper = $('<div class="st-format-wrapper"></div>');
        
        $textarea.before($wrapper);
        $wrapper.append($toolbar).append($textarea);
        
        log('QuickFormatting Extension Loaded', 'success');
    } catch (e) {
        console.error("QuickFormatting Init Error:", e);
    }
})();

