
import { GoogleGenAI } from "@google/genai";
import { SearchResult, JobListing, GroundingSource, SearchOptions } from "../types";

const SEARCH_GROUNDED_MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-preview',
  'gemini-3-flash-preview',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];

const PREFERRED_JOB_DOMAINS = [
  'jobs.tt.com',
  'tirolerjobs.at',
  'karriere.at',
  'jobs.at',
  'hokify.at',
  'stepstone.at',
  'willhaben.at',
  'at.indeed.com',
  'oehboerse.at',
  'ams.at',
  'meinbezirk.at',
  'amtsblatt.tirol.gv.at',
];

const TIROL_LOCATIONS = [
  'tirol',
  'innsbruck',
  'kufstein',
  'woergl',
  'wörgl',
  'schwaz',
  'hall in tirol',
  'kitzbuehel',
  'kitzbühel',
  'imst',
  'landeck',
  'lienz',
  'reutte',
  'telfs',
  'zillertal',
  'achensee',
  'osttirol',
];

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private selectedModel: string | null = null;
  private apiKeyOverride: string | null = null;
  private activeApiKey = '';
  private activeApiKeySource: 'manual' | 'localStorage' | 'env' | 'none' = 'none';
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = 900;
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
  }

  setModel(model: string) {
    const normalized = model.trim();
    this.selectedModel = normalized || null;
    this.lastResultCache = null;
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
    const modelCandidates = this.selectedModel
      ? [this.selectedModel, ...SEARCH_GROUNDED_MODEL_CANDIDATES.filter(m => m !== this.selectedModel)]
      : SEARCH_GROUNDED_MODEL_CANDIDATES;

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
    const maxAttempts = 2;
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
        const backoffMs = parsedDelay ? Math.min(parsedDelay, 4000) : attempt * 1500;
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
      const normalizedPath = u.pathname.replace(/\/$/, '');
      return (u.hostname + normalizedPath).toLowerCase();
    } catch (e) {
      return url.toLowerCase();
    }
  }

  private getHostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss');
  }

  private getQueryTokens(query: string): string[] {
    const stopWords = new Set([
      'job', 'jobs', 'stelle', 'stellen', 'stellenangebot', 'stellenangebote',
      'tirol', 'tyrol', 'oesterreich', 'osterreich', 'austria', 'in', 'im',
      'am', 'mit', 'ohne', 'und', 'oder', 'fuer', 'fur', 'für', 'als', 'der',
      'die', 'das', 'eine', 'einen', 'keine', 'kein', 'moeglich', 'moglich',
      'möglich'
    ]);

    return this.normalizeText(query)
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !stopWords.has(token));
  }

  private buildSearchVariants(query: string, location: string): string[] {
    const cleanedLocation = location || 'Tirol';
    const tokens = this.getQueryTokens(query);
    const compactQuery = tokens.length > 0 ? tokens.join(' ') : query;
    const isTirolWide = /^(tirol|tyrol|tirol gesamt)?$/i.test(cleanedLocation.trim());
    const locationTerms = isTirolWide
      ? ['Tirol', 'Innsbruck Tirol', 'Kufstein Tirol']
      : [cleanedLocation, `${cleanedLocation} Tirol`];

    const variants = [
      `"${query}" "${cleanedLocation}" jobs`,
      `${compactQuery} ${locationTerms[0]} stellenangebot`,
      `${compactQuery} ${locationTerms[0]} job`,
      ...locationTerms.slice(1).map(term => `${compactQuery} ${term} jobs`),
    ];

    return [...new Set(variants.map(v => v.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 4);
  }

  private getDomainPriority(url: string): number {
    const hostname = this.getHostname(url);
    const index = PREFERRED_JOB_DOMAINS.findIndex(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    return index === -1 ? PREFERRED_JOB_DOMAINS.length : index;
  }

  private hasTirolSignal(job: Partial<JobListing>): boolean {
    const haystack = this.normalizeText([
      job.title,
      job.company,
      job.location,
      job.snippet,
      job.url,
      job.source
    ].filter(Boolean).join(' '));

    return TIROL_LOCATIONS.some(place => haystack.includes(this.normalizeText(place)));
  }

  private scoreJob(job: Partial<JobListing>, query: string, location: string): number {
    const queryTokens = this.getQueryTokens(query);
    const title = this.normalizeText(job.title || '');
    const haystack = this.normalizeText([
      job.title,
      job.company,
      job.location,
      job.snippet,
      job.url,
      job.source
    ].filter(Boolean).join(' '));

    let score = 0;
    for (const token of queryTokens) {
      if (title.includes(token)) score += 5;
      else if (haystack.includes(token)) score += 2;
    }

    const normalizedLocation = this.normalizeText(location);
    if (normalizedLocation && haystack.includes(normalizedLocation)) score += 8;
    if (this.hasTirolSignal(job)) score += 6;

    const domainPriority = this.getDomainPriority(job.url || '');
    if (domainPriority < PREFERRED_JOB_DOMAINS.length) {
      score += Math.max(1, PREFERRED_JOB_DOMAINS.length - domainPriority);
    }

    const url = this.normalizeUrl(job.url || '');
    if (/\/(jobs?|stellenangebote?|karriere|jobboerse|vacancies|position)\//i.test(url)) score += 2;
    if (/suche|search|result|login|register|job-alarm|bewerbung/i.test(url)) score -= 20;
    if (!job.title || (job.title || '').length < 4) score -= 8;

    return score;
  }

  private inferCategory(job: Partial<JobListing>, query: string): string {
    const haystack = this.normalizeText(`${job.title || ''} ${job.snippet || ''} ${query}`);
    if (/verkauf|mode|retail|kassa|kasse/.test(haystack)) return 'Verkauf';
    if (/buro|buero|office|assistenz|verwaltung|rezeption|empfang/.test(haystack)) return 'Büro & Empfang';
    if (/gastro|service|kellner|kuche|kueche|hotel|tourismus/.test(haystack)) return 'Gastro & Tourismus';
    if (/lager|logistik|fahrer|zustell|transport/.test(haystack)) return 'Lager & Fahrer';
    if (/pflege|betreuung|sozial/.test(haystack)) return 'Pflege & Betreuung';
    if (/support|kundenservice|callcenter|homeoffice|remote/.test(haystack)) return 'Support';
    return 'Quereinstieg';
  }

  private isMeaningfulJobTitle(title: string): boolean {
    const normalized = this.normalizeText(title);
    if (!normalized || normalized.length < 4) return false;
    return !/(jobsuche|stellenangebote suchen|job search|login|registrieren|job alarm|suchergebnisse)/i.test(normalized);
  }

  private sortAndDedupeJobs(jobs: JobListing[], query: string, location: string, knownUrls: string[], limit: number): JobListing[] {
    const seen = new Set(knownUrls.map(url => this.normalizeUrl(url)));
    const domainCounts = new Map<string, number>();

    return jobs
      .filter(job => this.isMeaningfulJobTitle(job.title) && this.isValidJobUrl(job.url))
      .map(job => ({ job, score: this.scoreJob(job, query, location) }))
      .sort((a, b) => b.score - a.score)
      .filter(({ job, score }) => {
        if (score < -5) return false;
        const normalizedUrl = this.normalizeUrl(job.url);
        if (seen.has(normalizedUrl)) return false;
        seen.add(normalizedUrl);

        const hostname = this.getHostname(job.url);
        const count = domainCounts.get(hostname) || 0;
        if (count >= 5) return false;
        domainCounts.set(hostname, count + 1);
        return true;
      })
      .slice(0, limit)
      .map(({ job }) => job);
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

  async searchJobs(query: string, _portalPreference?: string, currentJobCount: number = 0, location: string = 'Tirol', options: SearchOptions = {}): Promise<SearchResult> {
    const trimmedQuery = query.trim();
    const cacheKey = `${this.selectedModel || 'auto'}|${location}|${trimmedQuery}`;
    const knownUrls = options.knownUrls || [];
    if (currentJobCount === 0 && this.lastResultCache && this.lastResultCache.query === cacheKey) {
      const cacheAge = Date.now() - this.lastResultCache.timestamp;
      if (cacheAge < this.cacheTtlMs) {
        return this.lastResultCache.result;
      }
    }

    const siteOperators = [
      'site:jobs.tt.com',
      'site:tirolerjobs.at',
      'site:karriere.at',
      'site:jobs.at',
      'site:hokify.at',
      'site:stepstone.at',
      'site:willhaben.at/jobs',
      'site:at.indeed.com',
      'site:oehboerse.at',
      'site:amtsblatt.tirol.gv.at',
      'site:meinbezirk.at/jobs',
      'site:ams.at',
    ].join(' OR ');
    const cleanQuery = trimmedQuery.replace(/[^\w\säöüÄÖÜß]/g, '').trim(); 
    const cleanLocation = location.replace(/[^\w\säöüÄÖÜß]/g, '').trim();
    const promptQuery = `"${cleanQuery}" jobs ${cleanLocation} tirol (${siteOperators})`;
    const searchVariants = this.buildSearchVariants(cleanQuery, cleanLocation || 'Tirol');
    const excludedUrls = knownUrls
      .map(url => this.normalizeUrl(url))
      .filter(Boolean)
      .slice(0, 30);
    const resultTarget = currentJobCount > 0 ? 12 : 10;
    const pagingInstruction = currentJobCount > 0
      ? `Finde weitere neue Treffer ab ungefähr Ergebnis ${currentJobCount + 1}. Wiederhole keine bekannten Top-Treffer und keine URL aus der Ausschlussliste.`
      : 'Finde die besten aktuellen Treffer.';

    const systemInstruction = `
      Du bist ein präziser Job-Such-Assistent für Tirol.
      AUFGABE: Finde konkrete, aktuelle und direkt anklickbare Stellenanzeigen in Tirol.
      WICHTIG: Nutze googleSearch. Übernimm URLs exakt aus Suchtreffern; erfinde keine URLs.
      Gib keine Suchseiten, Login-Seiten, Job-Alarme, Bewerbungsformulare ohne Inserat oder allgemeinen Portalseiten zurück.
      Bevorzuge echte Inseratsdetailseiten von etablierten Jobportalen und Arbeitgeberseiten.
      Sortiere nach: 1. Standortnähe zu Tirol bzw. zum gewählten Ort, 2. Relevanz zur Suchanfrage, 3. Aktualität, 4. Direktheit der Inserats-URL.
      Nutze die Suchanfrage wörtlich. Füge keine versteckten Zusatzkriterien hinzu, außer dem gewählten Ort und echten Job-/Stellenangebot-Begriffen.
      Liefere lieber weniger geprüfte Treffer als unsichere Treffer.
      ANTWORT NUR ALS JSON: { "summary": "...", "jobs": [{ "title": "...", "company": "...", "location": "...", "url": "...", "snippet": "...", "source": "...", "date": "...", "category": "..." }] }
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
        [
          pagingInstruction,
          `Suche bis zu ${resultTarget} Job-Links für: ${promptQuery}.`,
          `Ziel-Ort: ${cleanLocation || 'Tirol'}.`,
          `Suchvarianten, die du verwenden sollst:`,
          ...searchVariants.map((variant, index) => `${index + 1}. ${variant}`),
          excludedUrls.length > 0 ? `Ausschlussliste bereits angezeigter URLs: ${excludedUrls.join(', ')}` : '',
          `Diversifiziere die Quellen, aber priorisiere konkrete Inseratsseiten.`
        ].filter(Boolean).join('\n'),
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
        const fallbackJobs = this.sortAndDedupeJobs(sources
          .filter(s => this.isValidJobUrl(s.uri))
          .map((s, i) => ({
            title: s.title,
            company: 'Tiroler Arbeitgeber',
            location: cleanLocation || 'Tirol',
            snippet: 'Klicke hier um das Inserat zu öffnen.',
            url: s.uri,
            source: this.getHostname(s.uri) || 'Websuche',
            date: 'Aktuell',
            category: this.inferCategory({ title: s.title, url: s.uri }, cleanQuery),
            id: `fallback-${Date.now()}-${i}`
          })), cleanQuery, cleanLocation || 'Tirol', knownUrls, resultTarget);
        
        if (fallbackJobs.length > 0) {
          return {
            summary: `Direkte Suchtreffer für "${cleanQuery}" in ${cleanLocation || 'Tirol'}:`,
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

      const validatedJobs: JobListing[] = (rawJson.jobs || [])
        .map((j: any, index: number) => {
          let verifiedUrl: string | null = null;
          const candidateUrl = String(j.url || '');
          const normJ = this.normalizeUrl(candidateUrl);
          const match = sources.find(s => {
            const normS = this.normalizeUrl(s.uri);
            return normJ && (normS.includes(normJ) || normJ.includes(normS));
          });

          if (match) verifiedUrl = match.uri;
          else {
            const candidateTitle = String(j.title || '').toLowerCase();
            const titleMatch = sources.find(s => 
              candidateTitle.length >= 8 && s.title.toLowerCase().includes(candidateTitle.substring(0, 15))
            );
            if (titleMatch) verifiedUrl = titleMatch.uri;
          }

          if (!verifiedUrl && this.isValidJobUrl(candidateUrl)) verifiedUrl = candidateUrl;
          if (!verifiedUrl || !this.isValidJobUrl(verifiedUrl)) return null;

          return {
            title: String(j.title || '').trim(),
            company: j.company || 'Unbekannt',
            location: j.location || 'Tirol',
            snippet: j.snippet || 'Details im Inserat',
            url: verifiedUrl,
            source: j.source || this.getHostname(verifiedUrl) || 'Websuche',
            date: j.date || 'Aktuell',
            category: j.category || this.inferCategory({ title: j.title, snippet: j.snippet, url: verifiedUrl }, cleanQuery),
            id: `job-${Date.now()}-${index}`
          };
        })
        .filter((j: JobListing | null): j is JobListing => j !== null);

      const sourceFallbackJobs = sources
        .filter(s => this.isValidJobUrl(s.uri))
        .map((s, index) => ({
          title: s.title,
          company: 'Tiroler Arbeitgeber',
          location: cleanLocation || 'Tirol',
          snippet: 'Direkter Treffer aus der Websuche.',
          url: s.uri,
          source: this.getHostname(s.uri) || 'Websuche',
          date: 'Aktuell',
          category: this.inferCategory({ title: s.title, url: s.uri }, cleanQuery),
          id: `source-${Date.now()}-${index}`
        }));

      const combinedJobs = this.sortAndDedupeJobs(
        [...validatedJobs, ...sourceFallbackJobs],
        cleanQuery,
        cleanLocation || 'Tirol',
        knownUrls,
        resultTarget
      );

      const result = {
        summary: rawJson.summary || `Aktuelle Jobangebote für "${cleanQuery}" in ${cleanLocation || 'Tirol'}:`,
        jobs: combinedJobs,
        groundingSources: sources
      };
      if (currentJobCount === 0) {
        this.lastResultCache = {
          query: cacheKey,
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
