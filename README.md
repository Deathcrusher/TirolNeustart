# Tirol Neustart - Jobbörse für Quereinsteiger

Eine moderne React-App zur Jobsuche für Quereinsteiger in Tirol.

## Features

- **Schnelle Suche** (Standard) - Kombiniert eigene Backend-Scraper mit Jooble
- **Eigene Scraper-Pipeline** - Modulare Quellen für `jobs.tt.com`, `karriere.at`, `METAJob` und weitere Adapter
- **Google Gemini KI-Suche** (Optional) - Intelligente Suche mit KI-Unterstützung
- **Umschaltbare Suchmodi** - Wechsle zwischen schneller Backend-Suche und KI-Suche
- **Lokale API-Key Speicherung** - Gemini Key wird sicher im Browser gespeichert
- **Responsives Design** - Optimiert für Mobile und Desktop
- **Kategorien-Filter** - Vorgefertigte Suchen für verschiedene Berufsfelder

## Installation

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Nutzung

### Schnelle Suche (Standard)
- Nutzt `/api/search-jobs`, um eigene Scraper und Jooble zu kombinieren
- Funktioniert auch ohne Jooble-Key über eigene Scraper (`jobs.tt.com`, `karriere.at`, `METAJob`)
- Mit Jooble-Key werden zusätzlich Jooble-Ergebnisse gemischt und dedupliziert
- Verwendet im Dev-Modus für Jooble weiterhin einen Vite-Proxy (`/api/jooble`), um CORS-Fehler zu vermeiden
- Siehe auch `docs/scraper-strategy.md`

### Gemini KI-Suche (Optional)
1. Klicke auf das Zahnrad-Icon oben rechts
2. Gib deinen Google Gemini API Key ein
3. Wechsle den Suchmodus auf "KI-Suche"
4. Die KI durchsucht mehrere Jobbörsen gleichzeitig
5. Das System versucht automatisch aktuelle Flash-Modelle (beginnend mit `gemini-3.1-flash-lite-preview`) und fällt bei Bedarf auf kompatible Modelle zurück

API Key holen: https://aistudio.google.com/app/apikey

## Umgebungsvariablen (Optional)

Für die Verwendung eines festen API Keys (statt Eingabe im UI):

```bash
cp .env.example .env.local
# Bearbeite .env.local und füge deinen Key ein
```

## Technologien

- React 18
- TypeScript
- Tailwind CSS
- Vite
- Jooble API
- Google Gemini AI (optional)

## Lizenz

MIT
