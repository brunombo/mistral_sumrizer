# Mistral Summarizer

Extension de navigateur (Manifest V3) qui résume la page web active avec l'API de Mistral AI. Le résumé s'affiche en Markdown dans le popup et peut être copié en un clic.

Version actuelle : **1.4**

## Fonctionnement

1. Le popup extrait le texte visible de l'onglet actif (`document.body.innerText`), en compactant les espaces et en le limitant à 15 000 caractères.
2. Il construit le prompt à partir du modèle de prompt configuré, en remplaçant `{count}`, `{lang}` et `{text}`.
3. Il envoie la requête à `https://api.mistral.ai/v1/chat/completions` avec le modèle choisi.
4. La réponse Markdown est convertie en HTML par [marked](https://github.com/markedjs/marked), assainie par [DOMPurify](https://github.com/cure53/DOMPurify), puis affichée.
5. Le résumé est enregistré localement pour l'URL de la page. À la réouverture du popup sur la même page, il est restauré (« Résumé restauré ✅ »). Les 50 derniers résumés sont conservés.

## Installation

### Firefox (version 140 ou plus)

- **Temporaire (développement)** : ouvrir `about:debugging#/runtime/this-firefox`, cliquer sur « Charger un module complémentaire temporaire… » et choisir `manifest.json`.
- **Permanente** : zipper le contenu du dépôt (avec `manifest.json` à la racine de l'archive) et le soumettre sur [addons.mozilla.org](https://addons.mozilla.org/developers/) pour signature.

### Chrome / Chromium

Ouvrir `chrome://extensions`, activer le mode développeur, puis « Charger l'extension non empaquetée » et choisir le dossier du dépôt. Le code utilise `browser` ou, à défaut, `chrome`. La section `browser_specific_settings` du manifeste est propre à Firefox : Chrome l'ignore en affichant un avertissement.

## Configuration

La page d'options s'ouvre automatiquement si aucune clé API n'est définie. Elle propose :

| Réglage | Valeurs |
|---|---|
| Clé API Mistral | à créer sur la [console Mistral AI](https://console.mistral.ai/) |
| Nombre de mots | 50 à 500 (200 par défaut) |
| Langue de sortie | Français (par défaut), English, Español, Deutsch, Italiano |
| Modèle | `mistral-large-latest`, `mistral-large-3`, `mistral-medium-latest`, `mistral-small-latest`, `open-mistral-nemo` |
| Prompt personnalisé | variables `{count}` (mots), `{lang}` (langue), `{text}` (contenu de la page) |

Prompt par défaut :

```
Summarize the following text in approximately {count} words in {lang}. Use Markdown (bold, lists). Text: {text}
```

## Structure

```
manifest.json          Manifeste MV3 (permissions : activeTab, storage, scripting)
icon.png               Icône de l'extension
popup/
  popup.html           Interface du popup
  popup.js             Extraction, appel API, rendu, persistance, copie
  marked.min.js        marked 17.0.1 (Markdown → HTML)
  purify.min.js        DOMPurify 3.3.1 (assainissement HTML)
options/
  options.html         Page de configuration
  options.js           Lecture et enregistrement des réglages
```

Les bibliothèques sont embarquées localement, sans CDN, pour respecter la politique de sécurité du contenu `script-src 'self'` exigée par AMO.

## Confidentialité

- La clé API et les résumés sont stockés uniquement dans `storage.local` du navigateur.
- Le texte de la page résumée est envoyé à l'API de Mistral AI, et à elle seule.
- Aucune autre collecte de données (`data_collection_permissions: none`).

## Historique

- **1.4** — Valeurs par défaut harmonisées entre la page d'options et le popup : 200 mots, `Français`.
- **1.3** — Correctif : certains modèles Mistral renvoient `message.content` sous forme de tableau de chunks (`thinking` + `text`) au lieu d'une chaîne. Seuls les chunks `text` sont désormais extraits. Cela supprime l'erreur `marked(): input parameter is of type [object Array], string expected`.
- **1.2** — Version précédente.

## Limites connues

- Seuls les 15 000 premiers caractères de la page sont résumés.
- L'extraction de texte ne fonctionne pas sur les pages internes du navigateur (`about:`, `chrome://`, AMO), où l'injection de script est interdite.
