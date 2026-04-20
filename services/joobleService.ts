import { JobListing } from '../types';

const JOOBLE_PROXY_BASE_URL = '/api/jooble';
const JOOBLE_DIRECT_BASE_URL = 'https://jooble.org/api';
const RESULTS_PER_PAGE = 10;

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
      const searchQueries = this.getSearchQueries(query);
      const searchLocations = this.getSearchLocations(location);
      const requestPairs = this.getRequestPairs(searchQueries, searchLocations, page);
      const jobsByUrl = new Map<string, any>();
      const debugResults: string[] = [];

      const responses = await Promise.allSettled(
        requestPairs.map(({ query: searchQuery, location: searchLocation }) =>
          this.fetchJooble(encodedApiKey, searchQuery, searchLocation, page)
            .then(data => ({ data, searchQuery, searchLocation }))
        )
      );

      const rejectedResponses = responses.filter((response): response is PromiseRejectedResult => response.status === 'rejected');

      responses.forEach((response) => {
        if (response.status === 'fulfilled') {
          const { data, searchQuery, searchLocation } = response.value;
          const jobs = Array.isArray(data.jobs) ? data.jobs : [];
          debugResults.push(`${searchQuery} / ${searchLocation}: ${jobs.length} von ${data.totalCount ?? '?'}`);

          jobs.forEach((job: any) => {
            const key = job.link || job.url || job.id || `${job.title}-${job.company}-${job.location}`;
            if (key && !jobsByUrl.has(key)) {
              jobsByUrl.set(key, job);
            }
          });
        }
      });

      if (jobsByUrl.size === 0 && rejectedResponses.length === responses.length && rejectedResponses[0]) {
        throw rejectedResponses[0].reason;
      }

      if (jobsByUrl.size === 0) {
        console.info('Jooble returned no jobs for all search variants:', debugResults);
      }
      
      const jobs = [...jobsByUrl.values()].slice(0, RESULTS_PER_PAGE);

      if (jobs.length === 0) {
        return [];
      }

      return jobs.map((job: any, index: number) => ({
        id: job.id || `jooble-${Date.now()}-${index}`,
        title: job.title || 'Unbekannte Position',
        company: job.company || 'Vertraulich',
        location: job.location || location,
        snippet: job.snippet || 'Details im Inserat',
        url: job.link || job.url || '#',
        source: 'Jooble',
        date: job.updated ? this.formatDate(job.updated) : job.posted ? this.formatDate(job.posted) : 'Aktuell',
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

  private async fetchJooble(encodedApiKey: string, query: string, location: string, page: number) {
    const requestBody = JSON.stringify({
      keywords: query.trim(),
      location,
      radius: '40',
      page: String(page + 1),
      ResultOnPage: String(RESULTS_PER_PAGE),
      companysearch: 'false',
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
      try {
        response = await fetch(`${JOOBLE_DIRECT_BASE_URL}/${encodedApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBody,
        });
      } catch (error) {
        throw new Error(
          'Jooble konnte nicht über den App-Proxy erreicht werden und der direkte Browser-Fallback wurde blockiert. ' +
          'Falls das in Produktion passiert, fehlt wahrscheinlich der /api/jooble Proxy im Deployment.'
        );
      }
    }

    if (!response.ok) {
      throw new Error(`Jooble API Error: ${response.status} ${response.statusText}`.trim());
    }

    return response.json();
  }

  private getSearchLocations(location: string): string[] {
    const normalized = location.trim();
    const isWholeTirol = !normalized || /^(tirol|tyrol|tirol gesamt)$/i.test(normalized);
    const locations = isWholeTirol
      ? [
          'Tirol',
          'Tyrol',
          'Tyrol, Austria',
          'Innsbruck, Tirol',
          'Innsbruck',
          'Kufstein',
          'Wörgl',
          'Schwaz',
          'Hall in Tirol',
          'Kitzbühel',
          'Imst',
          'Landeck',
          'Lienz',
          'Reutte',
          'Telfs',
        ]
      : [
          normalized,
          `${normalized}, Tirol`,
          `${normalized}, Austria`,
        ];

    return [...new Set(locations)];
  }

  private getRequestPairs(searchQueries: string[], searchLocations: string[], page: number): Array<{ query: string; location: string }> {
    const maxRequests = page === 0 ? 6 : 10;
    const pairs: Array<{ query: string; location: string }> = [];

    for (const searchQuery of searchQueries) {
      for (const searchLocation of searchLocations) {
        pairs.push({ query: searchQuery, location: searchLocation });
        if (pairs.length >= maxRequests) return pairs;
      }
    }

    return pairs;
  }

  private getSearchQueries(query: string): string[] {
    const normalized = query.trim();
    const simplified = normalized
      .replace(/\b(jobs?|stellenangebote?|stelle|tirol|tyrol|innsbruck|österreich|austria)\b/gi, ' ')
      .replace(/\b(ohne|mit|und|oder|für|fuer|als|in|im|am|der|die|das|eine?|keine?)\b/gi, ' ')
      .replace(/\b(erfahrung|vorkenntnisse|ausbildung|quereinstieg|möglich|moeglich)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const queries = [
      normalized,
      simplified,
    ].filter(Boolean);

    return [...new Set(queries)];
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
