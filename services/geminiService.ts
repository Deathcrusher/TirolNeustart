
import { GoogleGenAI } from "@google/genai";
import { SearchResult, JobListing, GroundingSource } from "../types";

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private selectedModel: string | null = null;
  private apiKeyOverride: string | null = null;
  private activeApiKey = '';
  private activeApiKeySource: 'manual' | 'localStorage' | 'env' | 'none' = 'none';
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = 3500;
  private readonly cacheTtlMs = 60000;
  private lastResultCache: { query: string; timestamp: number; result: SearchResult } | null = null;

  constructor() {
    // Keine Initialisierung hier - API Key wird bei jedem Request geprüft
  }

  setApiKey(apiKey: string) {
    const normalized = apiKey.trim();
    this.apiKeyOverride = normalized || null;

    // Client zurücksetzen, damit bei Key-Wechsel garantiert der neue Key verwendet wird.
    this.ai = null;
    this.activeApiKey = '';
    this.selectedModel = null;
  }

  private resolveApiKey(): { key: string; source: 'manual' | 'localStorage' | 'env' | 'none' } {
    if (this.apiKeyOverride) {
      return { key: this.apiKeyOverride, source: 'manual' };
    }

    let apiKey = '';

    // 1. Check localStorage (für Browser-Nutzung)
    try {
      apiKey = localStorage.getItem('gemini_api_key') || '';
    } catch (e) {}
    if (apiKey.trim()) {
      return { key: apiKey.trim(), source: 'localStorage' };
    }

    // 2. Check: Vite (import.meta.env)
    if (!apiKey) {
      try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
          // @ts-ignore
          apiKey = import.meta.env.VITE_GEMINI_KEY || import.meta.env.GEMINI_KEY || import.meta.env.GOOGLE_API_KEY || '';
        }
      } catch (e) {}
    }

    // 3. Check: Create React App / Webpack / Node (process.env)
    // WICHTIG: Kein Fallback auf generisches API_KEY, um versehentliche Shared-Keys zu vermeiden.
    if (!apiKey) {
      try {
        if (typeof process !== 'undefined' && process.env) {
          apiKey = process.env.GEMINI_KEY || 
                   process.env.GEMINI_API_KEY ||
                   process.env.GOOGLE_API_KEY ||
                   process.env.VITE_GEMINI_KEY || 
                   process.env.REACT_APP_GEMINI_KEY || '';
        }
      } catch (e) {}
    }

    if (apiKey.trim()) {
      return { key: apiKey.trim(), source: 'env' };
    }

    return { key: '', source: 'none' };
  }

  private getClient(): GoogleGenAI {
    const { key: apiKey, source } = this.resolveApiKey();

    if (this.ai && this.activeApiKey === apiKey) {
      return this.ai;
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.activeApiKey = apiKey;
    this.activeApiKeySource = source;
    return this.ai;
  }

  private async generateWithModelFallback(ai: GoogleGenAI, contents: string, systemInstruction: string) {
    const defaultCandidates = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    const modelCandidates = this.selectedModel
      ? [this.selectedModel, ...defaultCandidates.filter(m => m !== this.selectedModel)]
      : defaultCandidates;

    let lastError: unknown = null;

    for (const model of modelCandidates) {
      try {
        const response = await this.generateWithRetry(ai, model, contents, systemInstruction);
        this.selectedModel = model;
        return response;
      } catch (error: any) {
        const message = String(error?.message || '');
        const isMissingModel =
          message.includes('not found') ||
          message.includes('unsupported') ||
          message.includes('INVALID_ARGUMENT');
        const isRetryable =
          message.includes('429') ||
          message.includes('RESOURCE_EXHAUSTED') ||
          message.includes('503') ||
          message.includes('UNAVAILABLE');

        if (!isMissingModel && !isRetryable) {
          throw error;
        }

        lastError = error;
      }
    }

    throw lastError || new Error('Kein kompatibles Gemini-Modell verfügbar.');
  }

  private parseRetryDelayMs(message: string): number | null {
    const secMatch = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
    if (secMatch) {
      return Math.ceil(parseFloat(secMatch[1]) * 1000);
    }
    return null;
  }

  private async generateWithRetry(ai: GoogleGenAI, model: string, contents: string, systemInstruction: string) {
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });
      } catch (error: any) {
        lastError = error;
        const message = String(error?.message || '');
        const isRetryable =
          message.includes('429') ||
          message.includes('RESOURCE_EXHAUSTED') ||
          message.includes('503') ||
          message.includes('UNAVAILABLE');

        if (!isRetryable || attempt === maxAttempts) {
          throw error;
        }

        const parsedDelay = this.parseRetryDelayMs(message);
        const backoffMs = parsedDelay ?? attempt * 3000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError || new Error('Gemini Request fehlgeschlagen.');
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
    const trimmedQuery = query.trim();
    if (currentJobCount === 0 && this.lastResultCache && this.lastResultCache.query === trimmedQuery) {
      const cacheAge = Date.now() - this.lastResultCache.timestamp;
      if (cacheAge < this.cacheTtlMs) {
        return this.lastResultCache.result;
      }
    }

    const siteOperators = '(site:jobs.tt.com OR site:tirolerjobs.at OR site:karriere.at/j OR site:oehboerse.at OR site:amtsblatt.tirol.gv.at OR site:meinbezirk.at/jobs)';
    const cleanQuery = trimmedQuery.replace(/[^\w\säöüÄÖÜß]/g, '').trim(); 
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
      if (!this.activeApiKey) {
        throw new Error("API Key fehlt. Bitte gib deinen Gemini API Key in den Einstellungen ein.");
      }

      const response = await this.generateWithModelFallback(
        ai,
        `Suche die 10 besten Job-Links für: ${promptQuery}.`,
        systemInstruction
      );

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

      const result = {
        summary: rawJson.summary || "Aktuelle Jobangebote:",
        jobs: validatedJobs,
        groundingSources: sources
      };
      if (currentJobCount === 0) {
        this.lastResultCache = {
          query: trimmedQuery,
          timestamp: Date.now(),
          result
        };
      }
      return result;
    } catch (error) {
      console.error("Gemini Search Error:", error);
      const message = String((error as any)?.message || '');
      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(
          `429 RESOURCE_EXHAUSTED (Key-Quelle: ${this.activeApiKeySource}). Quota ist projektbasiert (nicht key-basiert). ` +
          `Bitte in Google AI Studio/Cloud Console genau dieses Projekt prüfen (Quota + Billing + erlaubte API-Key-Restriktionen). Original: ${message}`
        );
      }
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
