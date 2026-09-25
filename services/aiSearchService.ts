import { SearchResult } from '../types';

class AiSearchService {
  async searchJobs(
    query: string,
    currentJobCount = 0,
    location = 'Tirol',
    knownUrls: string[] = [],
    remoteOnly = false,
  ): Promise<SearchResult> {
    const response = await fetch('/api/ai-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, currentJobCount, location, knownUrls, remoteOnly }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `KI-Suche fehlgeschlagen (${response.status}).`);
    }

    return result as SearchResult;
  }
}

export const aiSearchService = new AiSearchService();
