import { SearchResult } from '../types';
import { joobleService } from './joobleService';

function isClearlyRemote(job: { title?: string; location?: string; snippet?: string; workMode?: string }): boolean {
  const text = [job.workMode, job.title, job.location, job.snippet].filter(Boolean).join(' ').toLowerCase();
  if (/hybrid|home[ -]?office\s+(?:möglich|option|anteilig)|mobiles arbeiten\s+möglich/.test(text)) return false;
  return /\bremote\b|home[ -]?office|ortsunabhängig|fully remote|100\s*%\s*(?:remote|homeoffice)/.test(text);
}

class JobSearchService {
  private resolveJoobleApiKey(): string {
    try {
      return localStorage.getItem('jooble_api_key') || '';
    } catch {
      return '';
    }
  }

  async searchJobs(query: string, location: string = 'Tirol', page: number = 0, sourceFilter: string = '', remoteOnly = false): Promise<SearchResult> {
    let response: Response;
    try {
      response = await fetch('/api/search-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          location,
          page,
          sourceFilter,
          remoteOnly,
          joobleApiKey: this.resolveJoobleApiKey(),
        }),
      });
    } catch (error) {
      console.warn('Falling back to direct Jooble service:', error);
      const jobs = await joobleService.searchJobs(query, location, page);
      const filteredJobs = remoteOnly ? jobs.filter(isClearlyRemote) : jobs;
      return {
        jobs: filteredJobs,
        summary: `Jooble Ergebnisse für "${query}" in ${location}${remoteOnly ? ' (nur Remote)' : ''}:`,
        groundingSources: [],
      };
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Search API Error: ${response.status} ${response.statusText}`.trim());
    }

    return result as SearchResult;
  }
}

export const jobSearchService = new JobSearchService();
