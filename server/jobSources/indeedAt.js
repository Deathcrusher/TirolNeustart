const BASE_URL = 'https://at.indeed.com';

function buildSearchUrl({ query, location, page = 0 }) {
  const url = new URL('/jobs', BASE_URL);
  url.searchParams.set('q', query || 'jobs');
  url.searchParams.set('l', location || 'Tirol');

  if (page > 0) {
    url.searchParams.set('start', String(page * 10));
  }

  return url.toString();
}

export const indeedAtSource = {
  id: 'indeed-at',
  label: 'Indeed AT',
  async search(input) {
    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
    });

    if (response.status === 403 || response.status === 429) {
      throw new Error('Indeed blocks automated server scraping for this request.');
    }

    if (!response.ok) {
      throw new Error(`Indeed scraper failed: ${response.status}`);
    }

    // Indeed currently returns a Cloudflare block page from this environment.
    // Keep this adapter registered so it can be upgraded to an official feed/API
    // or an approved provider integration without touching the aggregator.
    const html = await response.text();
    if (/Blocked - Indeed\.com|INDEED_CLOUDFLARE_STATIC_PAGE/i.test(html)) {
      throw new Error('Indeed returned a bot-protection page.');
    }

    return [];
  },
};
