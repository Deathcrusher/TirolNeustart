import { JobListing } from '../types';

const JOOBLE_PROXY_BASE_URL = '/api/jooble';
const JOOBLE_DIRECT_BASE_URL = 'https://jooble.org/api';

export interface JoobleJob {
  id: string;
  title: string;
  company: string;
  location: string;
  snippet: string;
  url: string;
  source: string;
  date?: string;
}

export class JoobleService {
  private apiKeyOverride: string | null = null;

  setApiKey(apiKey: string) {
    const normalized = apiKey.trim();
    this.apiKeyOverride = normalized || null;
  }

  private resolveApiKey(): string {
    if (this.apiKeyOverride) return this.apiKeyOverride;

    try {
      const fromStorage = localStorage.getItem('jooble_api_key') || '';
      if (fromStorage.trim()) return fromStorage.trim();
    } catch (e) {}

    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        const fromEnv = import.meta.env.VITE_JOOBLE_API_KEY || import.meta.env.JOOBLE_API_KEY || '';
        if (fromEnv.trim()) return fromEnv.trim();
      }
    } catch (e) {}

    try {
      if (typeof process !== 'undefined' && process.env) {
        const fromProcess = process.env.JOOBLE_API_KEY || process.env.VITE_JOOBLE_API_KEY || '';
        if (fromProcess.trim()) return fromProcess.trim();
      }
    } catch (e) {}

    return '';
  }

  async searchJobs(query: string, location: string = 'Tirol', page: number = 0): Promise<JobListing[]> {
    try {
      const apiKey = this.resolveApiKey();
      if (!apiKey) {
        throw new Error('Jooble API Key fehlt. Bitte in den Einstellungen eintragen.');
      }

      const encodedApiKey = encodeURIComponent(apiKey);
      const requestBody = JSON.stringify({
        keywords: query,
        location: location,
        radius: 40,
        page: page + 1,
        ResultOnPage: 10,
      });

      let response = await fetch(`${JOOBLE_PROXY_BASE_URL}/${encodedApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      // Fallback für Deployments ohne aktiven Vite-Proxy (z. B. Produktion).
      if (response.status === 404) {
        response = await fetch(`${JOOBLE_DIRECT_BASE_URL}/${encodedApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBody,
        });
      }

      if (!response.ok) {
        throw new Error(`Jooble API Error: ${response.status} ${response.statusText}`.trim());
      }

      const data = await response.json();
      
      if (!data.jobs || !Array.isArray(data.jobs)) {
        return [];
      }

      return data.jobs.map((job: any, index: number) => ({
        id: job.id || `jooble-${Date.now()}-${index}`,
        title: job.title || 'Unbekannte Position',
        company: job.company || 'Vertraulich',
        location: job.location || location,
        snippet: job.snippet || 'Details im Inserat',
        url: job.link || job.url || '#',
        source: 'Jooble',
        date: job.posted ? this.formatDate(job.posted) : 'Aktuell',
        category: 'Quereinsteiger',
      }));
    } catch (error) {
      console.error('Jooble Search Error:', error);
      if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
        throw new Error('Jooble konnte nicht erreicht werden (Fetch-Fehler). Prüfe Netzwerk, CORS-Einstellungen und ob ggf. ein Proxy benötigt wird.');
      }
      throw error instanceof Error ? error : new Error('Unbekannter Jooble Fehler');
    }
  }

  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Heute';
      if (diffDays === 1) return 'Gestern';
      if (diffDays < 7) return `vor ${diffDays} Tagen`;
      if (diffDays < 30) return `vor ${Math.floor(diffDays / 7)} Wochen`;
      return date.toLocaleDateString('de-DE');
    } catch {
      return 'Aktuell';
    }
  }
}

export const joobleService = new JoobleService();
