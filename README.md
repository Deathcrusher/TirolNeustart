# Tirol Neustart - Jobsuche für Connie

Eine React-App zur Jobsuche in Tirol. Die GPT-6-Luna-Suche berücksichtigt Connies Wünsche: Teilzeit bis 20 Wochenstunden, samstags frei, freitags nur bis Mittag und Homeoffice bevorzugt.

## Features

- **GPT-6 Luna KI-Suche** (Standard) - Sucht aktuelle Inserate über die OpenAI Responses API mit Websuche
- **Eigene Scraper-Pipeline** - Modulare Quellen für `jobs.tt.com`, `tirolerjobs.at`, `jobs.at`, `hokify.at`, `ÖH Jobbörse`, `StepStone AT`, `karriere.at` und `METAJob`
- **Umschaltbare Suchmodi** - Wechsle zwischen schneller Backend-Suche und KI-Suche
- **Nur-Remote-Filter** - Zeigt ausschließlich eindeutig als vollständig remote erkannte Stellen und startet eine laufende Suche beim Umschalten erneut
- **Serverseitiger API-Key** - `OPENAI_API_KEY` bleibt in der Vercel-Umgebung und wird nicht an den Browser ausgeliefert
- **Passwortschutz** - Ein gemeinsames Zugangspasswort sperrt die App sowie alle API-Endpunkte; angemeldet bleibt man sieben Tage
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

### Schnelle Suche
- Nutzt `/api/search-jobs`, um eigene Scraper und Jooble zu kombinieren
- Funktioniert auch ohne Jooble-Key über eigene Scraper (`jobs.tt.com`, `tirolerjobs.at`, `jobs.at`, `hokify.at`, `ÖH Jobbörse`, `StepStone AT`, `karriere.at`, `METAJob`)
- `AMS alle jobs` ist vorbereitet, blockiert aber aktuell unauthentifizierte Server-API-Anfragen
- `willhaben Jobs` ist vorbereitet, wird aber wegen robots.txt nicht automatisch gescraped
- Mit Jooble-Key werden zusätzlich Jooble-Ergebnisse gemischt und dedupliziert
- Verwendet im Dev-Modus für Jooble weiterhin einen Vite-Proxy (`/api/jooble`), um CORS-Fehler zu vermeiden
- Siehe auch `docs/scraper-strategy.md`

### GPT-6 Luna KI-Suche
Die KI-Suche verwendet GPT-6 Luna und die OpenAI Websuche. Sie kombiniert bis zu 15 belegte Webtreffer mit bis zu 30 direkten Ergebnissen aus den Portal-Scrapern. Portal-Treffer werden als ungeprüft bei den Arbeitszeiten markiert, wenn die Suchkarte keinen Dienstplan nennt. Der OpenAI-Key muss in Vercel als serverseitige Umgebungsvariable `OPENAI_API_KEY` gesetzt werden.

## Umgebungsvariablen

In Vercel unter **Settings → Environment Variables** folgende Secrets hinzufügen und danach neu deployen:

- `OPENAI_API_KEY` - OpenAI API-Key, ausschließlich serverseitig
- `APP_ACCESS_USER` - Login-Benutzername (optional; Standard ist `admin`)
- `APP_ACCESS_PASSWORD` - langes, eigenes Passwort für Connie und dich
- `AUTH_SECRET` - zufälliger Signaturschlüssel mit mindestens 32 zufälligen Bytes

Keinen dieser Werte mit `VITE_` prefixen. Ohne `APP_ACCESS_PASSWORD` und `AUTH_SECRET` bleiben alle Such-APIs gesperrt. Zum Abmelden oder Widerrufen aller bestehenden Sitzungen `AUTH_SECRET` ändern.

## Technologien

- React 18
- TypeScript
- Tailwind CSS
- Vite
- Jooble API
- OpenAI Responses API mit GPT-6 Luna

## Lizenz

MIT
