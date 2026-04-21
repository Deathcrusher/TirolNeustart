import { SearchResult } from '../types';
import { joobleService } from './joobleService';

class JobSearchService {
  private resolveJoobleApiKey(): string {
    try {
      return localStorage.getItem('jooble_api_key') || '';
    } catch {
      return '';
    }
  }

  async searchJobs(query: string, location: string = 'Tirol', page: number = 0, sourceFilter: string = ''): Promise<SearchResult> {
    try {
      const response = await fetch('/api/search-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          location,
          page,
          sourceFilter,
          joobleApiKey: this.resolveJoobleApiKey(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Search API Error: ${response.status} ${response.statusText}`.trim());
      }

      return response.json();
    } catch (error) {
      console.warn('Falling back to direct Jooble service:', error);
      const jobs = await joobleService.searchJobs(query, location, page);
      return {
        jobs,
        summary: `Jooble Ergebnisse für "${query}" in ${location}:`,
        groundingSources: [],
      };
    }
  }
}

export const jobSearchService = new JobSearchService();
