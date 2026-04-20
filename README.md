# Tirol Neustart - Jobbörse für Quereinsteiger

Eine moderne React-App zur Jobsuche für Quereinsteiger in Tirol.

## Features

- **Jooble API Integration** (Standard) - Schnelle, kostenlose Jobsuche ohne API-Key
- **Google Gemini KI-Suche** (Optional) - Intelligente Suche mit KI-Unterstützung
- **Umschaltbare Suchmodi** - Wechsle zwischen Jooble und KI-Suche
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

### Jooble-Suche (Standard)
- Funktioniert sofort ohne Konfiguration
- Durchsucht Jooble.org nach Jobs in Tirol
- Keine API-Key erforderlich

### Gemini KI-Suche (Optional)
1. Klicke auf das Zahnrad-Icon oben rechts
2. Gib deinen Google Gemini API Key ein
3. Wechsle den Suchmodus auf "KI-Suche"
4. Die KI durchsucht mehrere Jobbörsen gleichzeitig

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
