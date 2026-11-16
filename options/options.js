// --- options/options.js ---
const browserAPI = globalThis.browser || globalThis.chrome;

const DEFAULT_PROMPT = "Summarize the following text in approximately {count} words in {lang}. Use Markdown (bold, lists). Text: {text}";

function saveOptions() {
    const apiKey = document.getElementById('mistralApiKey').value.trim();
    const wordCount = parseInt(document.getElementById('summaryWordCount').value, 10);
    const language = document.getElementById('summaryLanguage').value;
    const prompt = document.getElementById('customPrompt').value;

    const model = document.getElementById('mistralModel').value;

    browserAPI.storage.local.set({
        mistralApiKey: apiKey,
        summaryWordCount: wordCount,
        summaryLanguage: language,
        summaryPrompt: prompt || DEFAULT_PROMPT,
        mistralModel: model
    }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Configuration enregistrée !';
        setTimeout(() => { status.textContent = ''; }, 2000);
    });
}

function restoreOptions() {
    browserAPI.storage.local.get({
        mistralApiKey: '',
        summaryWordCount: 200,
        summaryLanguage: 'Français',
        summaryPrompt: DEFAULT_PROMPT,
        mistralModel: 'mistral-large-latest'
    }, (items) => {
        document.getElementById('mistralApiKey').value = items.mistralApiKey;
        document.getElementById('summaryWordCount').value = items.summaryWordCount;
        document.getElementById('summaryLanguage').value = items.summaryLanguage;
        document.getElementById('customPrompt').value = items.summaryPrompt;
        document.getElementById('mistralModel').value = items.mistralModel;
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save-button').addEventListener('click', saveOptions);