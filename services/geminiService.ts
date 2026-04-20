
import { GoogleGenAI } from "@google/genai";
import { SearchResult, JobListing, GroundingSource } from "../types";

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = 1500;
  
  constructor() {
    // Keine Initialisierung hier - API Key wird bei jedem Request geprüft
  }

  private getClient(): GoogleGenAI {
    if (this.ai) return this.ai;

    let apiKey = '';

    // 1. Check localStorage (für Browser-Nutzung)
    try {
      apiKey = localStorage.getItem('gemini_api_key') || '';
    } catch (e) {}

    // 2. Check: Vite (import.meta.env)
    if (!apiKey) {
      try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
          // @ts-ignore
          apiKey = import.meta.env.VITE_GEMINI_KEY || import.meta.env.GEMINI_KEY || '';
        }
      } catch (e) {}
    }

    // 3. Check: Create React App / Webpack / Node (process.env)
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

    this.ai = new GoogleGenAI({ apiKey: apiKey });
    return this.ai;
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

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      return (u.hostname + u.pathname).replace(/\/$/, '').toLowerCase();
    } catch (e) {
      return url.toLowerCase();
    }
  }

  private isValidJobUrl(url: string): boolean {
    if (!url || url.length < 10) return false; 
    const lower = url.toLowerCase();
    const badPatterns = [
      '/suche', '/search', 'query=', '?q=', 'keywords=', 
      'stellenangebote/suche', 'job-search', 'result', 
      'facets', 'sort=', 'page=', 'filter', 'login', 'register',
      'job-alarm', 'bewerbung', 'anmelden'
    ];
    if (badPatterns.some(p => lower.includes(p))) return false;
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
    const promptQuery = `"${cleanQuery}" jobs innsbruck tirol ${siteOperators}`;

    const systemInstruction = `
      Du bist ein Job-Such-Assistent.
      AUFGABE: Finde konkrete Stellenanzeigen.
      WICHTIG: Nutze 'googleSearch' Ergebnisse. Extrahiere URLs exakt.
      ANTWORT (JSON): { "summary": "...", "jobs": [{ "title": "...", "company": "...", "location": "...", "url": "...", "snippet": "..." }] }
    `;

    try {
      const now = Date.now();
      const waitMs = this.minRequestIntervalMs - (now - this.lastRequestTime);
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      this.lastRequestTime = Date.now();

      const ai = this.getClient();
      
      // Expliziter Check für bessere UX Fehlermeldung
      if (!ai.apiKey) {
        throw new Error("API Key fehlt. Bitte gib deinen Gemini API Key in den Einstellungen ein.");
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp', 
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

      if ((!rawJson || !rawJson.jobs || rawJson.jobs.length === 0) && sources.length > 0) {
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

      const validatedJobs = (rawJson.jobs || [])
        .map((j: any, index: number) => {
          let verifiedUrl = null;
          const normJ = this.normalizeUrl(j.url);
          const match = sources.find(s => {
            const normS = this.normalizeUrl(s.uri);
            return normS.includes(normJ) || normJ.includes(normS);
          });

          if (match) verifiedUrl = match.uri;
          else {
            const titleMatch = sources.find(s => 
              s.title.toLowerCase().includes(j.title.toLowerCase().substring(0, 15))
            );
            if (titleMatch) verifiedUrl = titleMatch.uri;
          }

          if (!verifiedUrl && this.isValidJobUrl(j.url)) verifiedUrl = j.url;
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
