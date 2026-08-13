# Geschützter GitHub-Sync

Der Worker schreibt den Canasta-Datenstand nach `data/canasta-state.json`. Der GitHub-Token wird ausschließlich als Cloudflare-Secret gespeichert und darf niemals in dieses Repository committed werden.

## 1. GitHub Fine-grained PAT

Erstelle einen Fine-grained Personal Access Token mit Zugriff nur auf das Repository `canasta-tracker`.

Minimale Repository-Berechtigung:
- Contents: Read and write

## 2. Cloudflare Worker

Worker-Code: `worker/index.js`
Konfiguration: `worker/wrangler.toml`

Als Secrets hinterlegen:
- `GITHUB_TOKEN`: der Fine-grained GitHub PAT
- `SYNC_KEY`: ein langer zufälliger persönlicher Schlüssel

Normale Variablen:
- `ALLOWED_ORIGIN=https://9v4kkqwws7-coder.github.io`
- `GITHUB_OWNER=9v4kkqwws7-coder`
- `GITHUB_REPO=canasta-tracker`
- `GITHUB_PATH=data/canasta-state.json`
- `GITHUB_BRANCH=main`

## 3. Tracker

In der PWA unter `Sync & Backup` eintragen:
- Worker-URL, z. B. `https://canasta-tracker-sync.<account>.workers.dev`
- denselben `SYNC_KEY`

Danach synchronisiert der Tracker lokale Änderungen automatisch nach GitHub. Die lokale Speicherung bleibt als Offline-Sicherheitsnetz bestehen.

## Datenschutz

Das aktuelle GitHub-Pages-Repository ist öffentlich. Dadurch wäre auch `data/canasta-state.json` öffentlich lesbar, jedoch nicht ohne GitHub-Berechtigung bzw. Worker-Schlüssel beschreibbar. Wenn die Ergebnisse auch nicht öffentlich lesbar sein sollen, verwende ein separates privates Repository und setze `GITHUB_REPO` auf dessen Namen.
