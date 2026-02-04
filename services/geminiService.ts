
import { GoogleGenAI } from "@google/genai";
import { SearchResult, JobListing, GroundingSource } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // ABSTURZSICHERER KEY-ZUGRIFF
    // Browser kennen oft 'process' nicht -> White Screen Fix
    let apiKey = '';

    // 1. Check: Vite (import.meta.env)
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            // @ts-ignore
            apiKey = import.meta.env.VITE_GEMINI_KEY || import.meta.env.GEMINI_KEY || '';
        }
    } catch (e) {}

    // 2. Check: Create React App / Webpack / Node (process.env)
    if (!apiKey) {
        try {
            if (typeof process !== 'undefined' && process.env) {
                apiKey = process.env.GEMINI_KEY || 
                         process.env.VITE_GEMINI_KEY || 
                         process.env.REACT_APP_GEMINI_KEY || 
                         process.env.API_KEY || '';
            }
        } catch (e) {}
    }

    // Fallback: Wenn kein Key da ist, nicht abstürzen, sondern leer initialisieren.
    // Der Fehler kommt dann erst beim Suchen (bessere UX als White Screen).
    this.ai = new GoogleGenAI({ apiKey: apiKey });
  }

  private extractJson(text: string): any {
    try {
      const jsonMatch = text.match(/```json\s?([\s\S]*?)\s?```/) || text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr.trim());
      }
      return null;
    } catch (e) {
      console.error("Failed to parse JSON from response:", e);
      return null;
    }
  }

  // Hilfsfunktion: URL bereinigen für den Vergleich (entfernt Parameter und Protokoll)
  private normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        // Wir vergleichen nur Hostname + Pfad, ohne Query-Params und ohne Trailing Slash
        return (u.hostname + u.pathname).replace(/\/$/, '').toLowerCase();
    } catch (e) {
        return url.toLowerCase();
    }
  }

  // Validierung: Filtert nur echte "Müll"-Seiten raus, ist aber toleranter bei Job-URLs
  private isValidJobUrl(url: string): boolean {
    if (!url || url.length < 10) return false; 
    
    const lower = url.toLowerCase();
    
    // Wir blockieren nur explizite Suchseiten, Login, Filter
    const badPatterns = [
      '/suche', '/search', 'query=', '?q=', 'keywords=', 
      'stellenangebote/suche', 'job-search', 'result', 
      'facets', 'sort=', 'page=', 'filter', 'login', 'register',
      'job-alarm', 'bewerbung', 'anmelden'
    ];
    
    if (badPatterns.some(p => lower.includes(p))) return false;

    // Keine harten Regeln mehr wie "muss /job/ enthalten", da das zu viele echte Treffer killt.
    // Aber wir checken, ob es eine valide URL ist
    try {
        const urlObj = new URL(url);
        if (urlObj.pathname === '/' || urlObj.pathname.length < 2) return false;
    } catch (e) {
        return false;
    }

    return true;
  }

  async searchJobs(query: string, portalPreference?: string, currentJobCount: number = 0): Promise<SearchResult> {
    const siteOperators = '(site:jobs.tt.com OR site:tirolerjobs.at OR site:karriere.at/j OR site:oehboerse.at OR site:amtsblatt.tirol.gv.at OR site:meinbezirk.at/jobs)';
    const cleanQuery = query.replace(/[^\w\säöüÄÖÜß]/g, '').trim(); 
    
    // Query etwas offener gestalten, damit wir mehr Ergebnisse bekommen
    const promptQuery = `"${cleanQuery}" jobs innsbruck tirol ${siteOperators}`;

    const systemInstruction = `
      Du bist ein Job-Such-Assistent.
      
      AUFGABE:
      Finde konkrete Stellenanzeigen.
      
      WICHTIG:
      - Nutze die 'googleSearch' Ergebnisse.
      - Extrahiere die URL exakt so, wie sie im Suchergebnis steht.
      - Ignoriere reine Übersichtsseiten (z.B. "Alle Jobs in Tirol").
      
      ANTWORT (JSON):
      {
        "summary": "Kurze Zusammenfassung",
        "jobs": [
          {
            "title": "Titel",
            "company": "Firma",
            "location": "Ort",
            "url": "URL",
            "snippet": "Beschreibung"
          }
        ]
      }
    `;

    try {
      // Key-Check vor dem Call
      if (!this.ai.apiKey) {
          throw new Error("API Key fehlt. Bitte VITE_GEMINI_KEY in Vercel setzen.");
      }

      const genAI = new GoogleGenAI({ apiKey: this.ai.apiKey });
      
      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: `Suche die 10 besten Job-Links für: ${promptQuery}.`,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      const responseText = response.text || '';
      const rawJson = this.extractJson(responseText);
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: GroundingSource[] = groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
          title: chunk.web.title,
          uri: chunk.web.uri
        }));

      // Fallback, falls JSON leer ist oder fehlschlägt, aber Quellen da sind
      if ((!rawJson || !rawJson.jobs || rawJson.jobs.length === 0) && sources.length > 0) {
          // Wir bauen provisorische Jobs aus den Quellen, wenn die KI das JSON verhauen hat
          const fallbackJobs = sources
            .filter(s => this.isValidJobUrl(s.uri))
            .slice(0, 8)
            .map((s, i) => ({
                title: s.title,
                company: 'Tiroler Arbeitgeber',
                location: 'Tirol',
                snippet: 'Klicke hier um das Inserat zu öffnen.',
                url: s.uri,
                source: new URL(s.uri).hostname.replace('www.', ''),
                id: `fallback-${i}`
            }));
            
          if (fallbackJobs.length > 0) {
             return {
                 summary: "Direkte Suchtreffer (KI-Verarbeitung übersprungen):",
                 jobs: fallbackJobs,
                 groundingSources: sources
             };
          }
      }

      if (!rawJson || !rawJson.jobs) {
        return {
          summary: "Keine Ergebnisse gefunden.",
          jobs: [],
          groundingSources: sources
        };
      }

      // "Fuzzy" Validierung
      const validatedJobs = (rawJson.jobs || [])
        .map((j: any, index: number) => {
            let verifiedUrl = null;
            const normJ = this.normalizeUrl(j.url);

            // Wir suchen in den echten Quellen nach einem Match
            const match = sources.find(s => {
                const normS = this.normalizeUrl(s.uri);
                // Ist die eine URL in der anderen enthalten? (deckt Parameter ab)
                return normS.includes(normJ) || normJ.includes(normS);
            });

            if (match) {
                verifiedUrl = match.uri; // Nimm IMMER die echte Source-URL
            } else {
                // Wenn kein URL Match, versuchen wir Titel-Match als letzten Ausweg
                const titleMatch = sources.find(s => 
                     s.title.toLowerCase().includes(j.title.toLowerCase().substring(0, 15))
                );
                if (titleMatch) verifiedUrl = titleMatch.uri;
            }

            // Wenn immer noch null, aber die URL sieht valide aus (kein Search), lassen wir sie durch
            // Das ist der Kompromiss: Lieber ein Ergebnis mehr als gar keines.
            if (!verifiedUrl && this.isValidJobUrl(j.url)) {
                verifiedUrl = j.url;
            }

            if (!verifiedUrl || !this.isValidJobUrl(verifiedUrl)) return null;

            return {
                title: j.title,
                company: j.company || 'Unbekannt',
                location: j.location || 'Tirol',
                snippet: j.snippet || 'Details im Inserat',
                url: verifiedUrl,
                source: j.source || new URL(verifiedUrl).hostname.replace('www.', ''),
                date: j.date || 'Aktuell',
                id: `job-${Date.now()}-${index}`
            };
        })
        .filter((j: any) => j !== null);

      return {
        summary: rawJson.summary || "Aktuelle Jobangebote:",
        jobs: validatedJobs,
        groundingSources: sources
      };
    } catch (error) {
      console.error("Gemini Search Error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
