// --- popup/popup.js ---
const DEFAULT_WORD_COUNT = 200;
const DEFAULT_LANGUAGE = 'Français';
const DEFAULT_PROMPT = "Summarize the following text in approximately {count} words in {lang}. Use Markdown (bold, lists). Text: {text}";
const MODEL_NAME = "mistral-large-3";

// Utilisation de l'API standard WebExtensions (browser est natif sur Firefox)
const browserAPI = globalThis.browser || globalThis.chrome;

// --------- Persistence helpers (résumé persistant) ---------

/**
 * Hash simple et stable pour éviter de mettre des URLs (longues) en clé de storage.
 * (djb2)
 */
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0; // force 32-bit
  }
  // Convertit en non signé + hex
  return (h >>> 0).toString(16);
}

function summaryKeyForUrl(url) {
  return `summary_${hashString(url || '')}`;
}

async function getActiveTab() {
  const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] || null;
}

function renderSummaryMarkdown(rawSummary) {
  const outputElement = document.getElementById('summary-output');
  const copyBtn = document.getElementById('copy-btn');

  // Dépendances
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    outputElement.innerHTML =
      "<p style='color:red;'><b>Erreur :</b> Dépendances (marked ou DOMPurify) manquantes dans popup.html.</p>";
    copyBtn.style.display = 'none';
    return;
  }

  const dirtyHtml = (typeof marked.parse === 'function')
    ? marked.parse(rawSummary)
    : marked(rawSummary);

  const cleanHtml = DOMPurify.sanitize(dirtyHtml);

  outputElement.textContent = '';
  outputElement.insertAdjacentHTML('afterbegin', cleanHtml);

  copyBtn.style.display = 'block';
  copyBtn.onclick = () => copyToClipboard(rawSummary);
}

async function saveSummaryForActiveTab(rawSummary) {
  const tab = await getActiveTab();
  if (!tab?.url) return;

  const key = summaryKeyForUrl(tab.url);

  // Optionnel : maintenir un index pour éviter une croissance infinie (petit pruning)
  const { summary_index: index = [] } = await browserAPI.storage.local.get({ summary_index: [] });

  // Ajoute la clé si absente, et limite à 50 entrées
  const nextIndex = [key, ...index.filter(k => k !== key)].slice(0, 50);

  await browserAPI.storage.local.set({
    [key]: {
      url: tab.url,
      title: tab.title || '',
      rawSummary,
      savedAt: Date.now()
    },
    summary_index: nextIndex
  });
}

async function loadSummaryForActiveTabIfAny() {
  const statusElement = document.getElementById('status');
  const outputElement = document.getElementById('summary-output');
  const copyBtn = document.getElementById('copy-btn');

  const tab = await getActiveTab();
  if (!tab?.url) {
    statusElement.textContent = 'Ready';
    return;
  }

  const key = summaryKeyForUrl(tab.url);
  const stored = await browserAPI.storage.local.get({ [key]: null });
  const entry = stored?.[key];

  if (entry?.rawSummary) {
    renderSummaryMarkdown(entry.rawSummary);
    statusElement.textContent = 'Résumé restauré ✅';
  } else {
    // état par défaut
    outputElement.textContent = 'Click the button to generate a summary of this page...';
    copyBtn.style.display = 'none';
    statusElement.textContent = 'Ready';
  }
}

// --------- Clipboard ---------

/**
 * Gère la copie du résumé dans le presse-papier
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    const copyBtn = document.getElementById('copy-btn');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied! ✅';
    setTimeout(() => copyBtn.textContent = originalText, 2000);
  } catch (err) {
    console.error("Erreur de copie :", err);
  }
}

// --------- Restore persisted summary on popup open ---------

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSummaryForActiveTabIfAny();
  } catch (e) {
    console.error('Erreur restauration résumé :', e);
  }
});

// --------- Main summarize flow ---------

/**
 * Logique principale au clic sur le bouton de résumé
 */
document.getElementById('summarize-btn').addEventListener('click', async () => {
  const statusElement = document.getElementById('status');
  const outputElement = document.getElementById('summary-output');
  const copyBtn = document.getElementById('copy-btn');

  // 1. Vérification des dépendances critiques (Sécurité AMO Firefox)
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    outputElement.innerHTML =
      "<p style='color:red;'><b>Erreur :</b> Dépendances (marked ou DOMPurify) manquantes dans popup.html.</p>";
    return;
  }

  statusElement.textContent = 'Traitement en cours...';
  outputElement.innerHTML = '<i>Réflexion de Mistral...</i>';
  copyBtn.style.display = 'none';

  try {
    // 2. Récupération des paramètres (Clé API et Prompt personnalisé)
    const settings = await new Promise(resolve => {
      browserAPI.storage.local.get({
        mistralApiKey: '',
        summaryWordCount: DEFAULT_WORD_COUNT,
        summaryLanguage: DEFAULT_LANGUAGE,
        summaryPrompt: DEFAULT_PROMPT,
        mistralModel: 'mistral-large-latest'
      }, resolve);
    });

    const apiKey = settings.mistralApiKey;
    const wordCount = Number(settings.summaryWordCount) || DEFAULT_WORD_COUNT;
    const lang = settings.summaryLanguage || DEFAULT_LANGUAGE;
    const customPrompt = settings.summaryPrompt || DEFAULT_PROMPT;
    const modelName = settings.mistralModel || 'mistral-large-latest';

    if (!apiKey) {
      statusElement.textContent = 'Clé API manquante.';
      outputElement.innerHTML = "Veuillez définir votre clé API dans les options de l’extension.";
      // Redirige vers la page d’options si possible
      outputElement.textContent = "";
      try {
        if (browserAPI.runtime.openOptionsPage) {
          browserAPI.runtime.openOptionsPage();
        }
      } catch (_) { /* noop */ }
      return;
    }

    // 3. Extraction du texte de la page active
    const tab = await getActiveTab();
    if (!tab?.id) {
      throw new Error("Impossible de trouver l’onglet actif.");
    }

    const scriptResults = await browserAPI.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText.replace(/\s+/g, ' ').substring(0, 15000)
    });

    const pageContent = scriptResults?.[0]?.result;
    if (!pageContent || typeof pageContent !== 'string') {
      throw new Error("Impossible d’extraire le texte de la page.");
    }

    // 4. Construction dynamique du prompt
    const finalPrompt = customPrompt
      .replaceAll('{count}', String(wordCount))
      .replaceAll('{lang}', String(lang))
      .replaceAll('{text}', pageContent);

    // 5. Appel API Mistral
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: finalPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Erreur API Mistral (${response.status}). ${errText}`);
    }

    const data = await response.json();

    // Structure de réponse Mistral : choices[0].message.content
    // content peut être une chaîne, ou un tableau de chunks (modèles à raisonnement) :
    // [{type:"thinking", thinking:[...]}, {type:"text", text:"..."}] → on ne garde que les chunks "text".
    const content = data.choices?.[0]?.message?.content;
    const rawSummary = Array.isArray(content)
      ? content.filter(c => c?.type === 'text').map(c => c.text).join('')
      : content;

    if (rawSummary) {
      // Affichage
      renderSummaryMarkdown(rawSummary);

      // ✅ Persistence : sauvegarde du résumé pour l’URL de l’onglet actif
      await saveSummaryForActiveTab(rawSummary);

      statusElement.textContent = 'Terminé !';
    } else {
      throw new Error("Format de réponse invalide reçu de Mistral.");
    }

  } catch (error) {
    console.error("Erreur de l'extension :", error);
    statusElement.textContent = 'Échec.';
    outputElement.textContent = `Erreur : ${error.message}`;
  }
});
