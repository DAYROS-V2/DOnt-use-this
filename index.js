// index.js
import { saveSettingsDebounced, getContext } from "../../../script.js";
import { extension_settings } from "../../../extensions.js";

const EXTENSION_NAME = "QuickFormatting";
const SETTINGS_PATH = `extensions/${EXTENSION_NAME}/settings.html`;

// Default Settings
const DEFAULT_SETTINGS = {
    provider: "openai",
    openai_key: "",
    openrouter_key: "",
    context_limit: 5,
    temp: 1.0,
    top_p: 1.0,
    top_k: 0,
    bar_scale: 1.0
};

let isGenerating = false;
let abortController = null;
let lastInputState = ""; // For Undo

async function loadSettings() {
    // Ensure extension settings object exists
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
    }
    
    // Inject Settings HTML
    const response = await fetch(SETTINGS_PATH);
    if (response.ok) {
        const html = await response.text();
        $('#extensions_settings').append(html);
        
        // Bind Settings UI
        $('#qf_provider').val(extension_settings[EXTENSION_NAME].provider).on('change', function() {
            extension_settings[EXTENSION_NAME].provider = this.value;
            toggleKeyFields();
            saveSettingsDebounced();
        });
        
        $('#qf_openai_key').val(extension_settings[EXTENSION_NAME].openai_key).on('input', function() {
            extension_settings[EXTENSION_NAME].openai_key = this.value;
            saveSettingsDebounced();
        });
        
        $('#qf_openrouter_key').val(extension_settings[EXTENSION_NAME].openrouter_key).on('input', function() {
            extension_settings[EXTENSION_NAME].openrouter_key = this.value;
            saveSettingsDebounced();
        });

        // Samplers
        ['context_limit', 'temp', 'top_p', 'top_k'].forEach(key => {
             $('#qf_' + key).val(extension_settings[EXTENSION_NAME][key]).on('input', function() {
                extension_settings[EXTENSION_NAME][key] = parseFloat(this.value);
                saveSettingsDebounced();
             });
        });

        toggleKeyFields();
    }
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
    const buttons = [
        { label: '**', start: '**', end: '**', title: 'Action' },
        { label: '""', start: '"', end: '"', title: 'Dialogue' },
        { label: '(OOC)', start: '(OOC: ', end: ')', title: 'OOC' },
        { label: 'code', start: '```\n', end: '\n```', title: 'Code Block' }
    ];

    // Standard Buttons
    buttons.forEach(btn => {
        const $btn = $('<button class="qf-btn">' + btn.label + '</button>');
        $btn.on('click', (e) => {
            if ($toolbar.hasClass('edit-mode')) return; // Disable in edit mode
            e.preventDefault();
            insertTag(btn.start, btn.end);
        });
        $toolbar.append($btn);
    });

    // Magic Wand (AI Spell Checker)
    const $magicBtn = $('<button class="qf-btn magic-wand" title="AI Spell Check">🪄</button>');
    $magicBtn.on('click', async (e) => {
        if ($toolbar.hasClass('edit-mode')) return;
        e.preventDefault();
        
        if (isGenerating) {
            abortGeneration();
        } else {
            // Check if we can undo
            if ($magicBtn.text() === '↩️') {
                $('#send_textarea').val(lastInputState).trigger('input');
                $magicBtn.text('🪄');
                return;
            }
            await runSpellCheck($magicBtn);
        }
    });
    $toolbar.append($magicBtn);

    // Edit Mode Toggle
    $toolbar.on('dblclick', function() {
        $(this).toggleClass('edit-mode');
        if ($(this).hasClass('edit-mode')) {
            injectEditControls($(this));
        } else {
            $('.qf-edit-controls').remove();
            // Save scale settings if needed
        }
    });

    return $toolbar;
}

function injectEditControls($toolbar) {
    if ($('.qf-edit-controls').length) return;
    
    const $controls = $('<div class="qf-edit-controls"></div>');
    
    const $plus = $('<button class="qf-edit-btn">[+]</button>').click((e) => {
        e.stopPropagation();
        changeScale(0.1);
    });
    
    const $minus = $('<button class="qf-edit-btn">[-]</button>').click((e) => {
        e.stopPropagation();
        changeScale(-0.1);
    });
    
    const $save = $('<button class="qf-edit-btn">[SAVE]</button>').click((e) => {
        e.stopPropagation();
        $toolbar.removeClass('edit-mode');
        $('.qf-edit-controls').remove();
    });

    $controls.append($plus, $minus, $save);
    $toolbar.append($controls);
}

function changeScale(delta) {
    const settings = extension_settings[EXTENSION_NAME];
    settings.bar_scale = Math.max(0.5, (settings.bar_scale || 1) + delta);
    $('.qf-btn').css('font-size', (11 * settings.bar_scale) + 'px');
    saveSettingsDebounced();
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

    lastInputState = text;
    isGenerating = true;
    abortController = new AbortController();
    
    $btn.text('■').addClass('generating');
    
    const settings = extension_settings[EXTENSION_NAME];
    const apiKey = settings.provider === 'openai' ? settings.openai_key : settings.openrouter_key;
    const url = settings.provider === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions' 
        : 'https://openrouter.ai/api/v1/chat/completions';

    console.log('[QuickFormatting] Starting Generation...');
    console.log(`[QuickFormatting] Provider: ${settings.provider} | Temp: ${settings.temp}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: settings.provider === 'openai' ? 'gpt-3.5-turbo' : 'openai/gpt-3.5-turbo', // Default fallback
                messages: [
                    { role: "system", content: "You are a copy editor. Fix spelling, grammar, and improve flow. Return ONLY the corrected text. Do not add conversational filler." },
                    { role: "user", content: text }
                ],
                temperature: settings.temp,
                top_p: settings.top_p,
                stream: true
            }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        
        textarea.value = ""; // Clear for streaming
        let generatedText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const token = data.choices[0].delta.content || "";
                        generatedText += token;
                        textarea.value = generatedText;
                        // Auto-scroll logic if needed
                    } catch (e) { }
                }
            }
        }
        
        $btn.text('↩️'); // Offer undo
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('[QuickFormatting] Generation Aborted');
            textarea.value = lastInputState; // Revert on abort
        } else {
            console.error(err);
            alert('Generation Failed: ' + err.message);
            textarea.value = lastInputState;
        }
    } finally {
        isGenerating = false;
        abortController = null;
        $btn.removeClass('generating');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function abortGeneration() {
    if (abortController) abortController.abort();
}

jQuery(document).ready(function () {
    loadSettings();
    const $toolbar = buildToolbar();
    const $textarea = $('#send_textarea');
    
    // Inject wrapper
    const $wrapper = $('<div class="st-format-wrapper"></div>');
    $textarea.before($wrapper);
    $wrapper.append($toolbar).append($textarea);
});
