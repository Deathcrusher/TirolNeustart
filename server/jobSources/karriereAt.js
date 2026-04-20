import { absolutizeUrl, slugify, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://www.karriere.at';

function buildSearchUrl({ query, location, page = 0 }) {
  const querySlug = slugify(query || 'jobs');
  const locationSlug = slugify(location || 'tirol') || 'tirol';
  const url = new URL(`/jobs/${querySlug}/${locationSlug}`, BASE_URL);

  if (page > 0) {
    url.searchParams.set('page', String(page + 1));
  }

  return url.toString();
}

function extractBetween(value, startPattern, endPattern) {
  const start = value.search(startPattern);
  if (start === -1) return '';

  const rest = value.slice(start);
  const end = rest.search(endPattern);
  return end === -1 ? rest : rest.slice(0, end);
}

function extractFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? stripTags(match[1] || '') : '';
}

function parseJobs(html, sourceUrl) {
  const blocks = html
    .split(/<li[^>]+class="[^"]*m-jobsList__item[^"]*"[^>]*>/)
    .slice(1);

  const jobs = blocks
    .map((block) => {
      const itemHtml = block.split('</li>')[0] || block;
      const titleLink = itemHtml.match(/<a[^>]+class="[^"]*m-jobsListItem__titleLink[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const title = titleLink ? stripTags(titleLink[2]) : '';
      const url = titleLink ? absolutizeUrl(titleLink[1], sourceUrl) : '';
      const company = extractFirst(itemHtml, /<[^>]+class="[^"]*m-jobsListItem__companyName[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      const date = extractFirst(itemHtml, /<span[^>]+class="[^"]*m-jobsListItem__date[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      const locationBlock = extractBetween(
        itemHtml,
        /<span[^>]+class="[^"]*m-jobsListItem__locations[^"]*"/,
        /<\/span>/
      );
      const location = stripTags(locationBlock) || 'Tirol';
      const pills = [...itemHtml.matchAll(/<span[^>]+class="[^"]*m-jobsListItem__pill[^"]*"[^>]*>([\s\S]*?)<\/span>/g)]
        .map((match) => stripTags(match[1]))
        .filter(Boolean)
        .slice(1, 3);

      if (!title || !url) return null;

      return {
        id: `karriere-at-${url.split('/').filter(Boolean).pop() || title}`,
        title,
        company: company || 'Unbekannt',
        location,
        snippet: pills.length > 0 ? pills.join(' · ') : 'Details im Inserat',
        url,
        source: 'karriere.at',
        date: date || 'Aktuell',
        category: 'Jobportal',
      };
    })
    .filter(Boolean);

  return uniqueByUrl(jobs).slice(0, 15);
}

export const karriereAtSource = {
  id: 'karriere-at',
  label: 'karriere.at',
  async search(input) {
    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
    });

    if (!response.ok) {
      throw new Error(`karriere.at scraper failed: ${response.status}`);
    }

    const html = await response.text();
    return parseJobs(html, url);
  },
};
