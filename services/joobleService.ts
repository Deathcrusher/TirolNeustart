import { JobListing } from '../types';

const JOOBLE_API_KEY = 'd67a58e0-4c09-4f0e-8f0a-3b6e8c5d9e2f'; // Öffentlicher Test-Key
const JOOBLE_BASE_URL = '/api/jooble';

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
  async searchJobs(query: string, location: string = 'Tirol', page: number = 0): Promise<JobListing[]> {
    try {
      const offset = page * 10;
      const response = await fetch(`${JOOBLE_BASE_URL}/${JOOBLE_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          location: location,
          radius: 50,
          offset: offset,
          limit: 10,
        }),
      });

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
        throw new Error('Jooble konnte nicht erreicht werden (Fetch-Fehler). Prüfe, ob der Dev-Server läuft und der Proxy in Vite aktiv ist.');
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
