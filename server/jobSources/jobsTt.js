import { absolutizeUrl, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://jobs.tt.com';

function buildSearchUrl({ query, page = 0 }) {
  const url = new URL('/job', BASE_URL);
  url.searchParams.set('query', query || 'jobs');

  if (page > 0) {
    url.searchParams.set('page', String(page + 1));
  }

  return url.toString();
}

function extractFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? stripTags(match[1] || '') : '';
}

function parseJobs(html, sourceUrl) {
  const blocks = html
    .split(/<div[^>]+class="[^"]*job-card[^"]*"[^>]*itemscope[^>]*itemtype="http:\/\/schema\.org\/JobPosting"[^>]*>/)
    .slice(1);

  const jobs = blocks
    .map((block) => {
      const itemHtml = block.split(/<hr\s*\/?>/i)[0] || block;
      const id = extractFirst(itemHtml, /data-object-id="([^"]+)"/) || extractFirst(itemHtml, /job-id="([^"]+)"/);
      const title = extractFirst(itemHtml, /<span[^>]+itemprop="title"[^>]*>([\s\S]*?)<\/span>/);
      const hrefMatch = itemHtml.match(/<a[^>]+id="job_link_[^"]+"[^>]+href="([^"]+)"[^>]*>/);
      const url = hrefMatch ? absolutizeUrl(hrefMatch[1], sourceUrl) : '';
      const company = extractFirst(
        itemHtml,
        /itemprop="hiringOrganization"[\s\S]*?<span[^>]+itemprop="name"[^>]*>([\s\S]*?)<\/span>/
      );
      const location =
        extractFirst(itemHtml, /<span[^>]+class="[^"]*job-meta__location[^"]*"[^>]+title="([^"]+)"/) ||
        extractFirst(itemHtml, /<span[^>]+class="[^"]*job-meta__location[^"]*"[\s\S]*?<span[^>]+itemprop="name"[^>]*>([\s\S]*?)<\/span>/) ||
        'Tirol';
      const date = extractFirst(itemHtml, /<span[^>]+class="[^"]*job-meta__date[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      const snippet = extractFirst(itemHtml, /<span[^>]+itemprop="description"[^>]*>([\s\S]*?)<\/span>/);

      if (!title || !url) return null;

      return {
        id: `jobs-tt-${id || url.split('/').filter(Boolean).at(-2) || title}`,
        title,
        company: company || 'Unbekannt',
        location,
        snippet: snippet || 'Details im Inserat',
        url,
        source: 'jobs.tt.com',
        date: date || 'Aktuell',
        category: 'TT Jobs',
      };
    })
    .filter(Boolean);

  return uniqueByUrl(jobs).slice(0, 12);
}

export const jobsTtSource = {
  id: 'jobs-tt',
  label: 'jobs.tt.com',
  async search(input) {
    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
    });

    if (!response.ok) {
      throw new Error(`jobs.tt.com scraper failed: ${response.status}`);
    }

    const html = await response.text();
    return parseJobs(html, url);
  },
};
