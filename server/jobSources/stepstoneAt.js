import { absolutizeUrl, slugify, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://www.stepstone.at';

function buildSearchUrl({ query, location }) {
  const querySlug = slugify(query || 'jobs') || 'jobs';
  const locationSlug = slugify(location || 'tirol') || 'tirol';
  return `${BASE_URL}/jobs/${querySlug}/in-${locationSlug}`;
}

function segmentAfter(value, marker, endMarker) {
  const start = value.indexOf(marker);
  if (start === -1) return '';

  const tagEnd = value.indexOf('>', start);
  const rest = value.slice(tagEnd === -1 ? start + marker.length : tagEnd + 1);
  if (!endMarker) return rest;

  const end = rest.indexOf(endMarker);
  return end === -1 ? rest : rest.slice(0, end);
}

function extractTitleLink(block, sourceUrl) {
  const titleLink = block.match(/<a[^>]+href=["']([^"']+)["'][^>]+data-testid=["']job-item-title["'][^>]*>([\s\S]*?)<\/a>/);
  if (!titleLink) return { title: '', url: '' };

  return {
    title: stripTags(titleLink[2]),
    url: absolutizeUrl(titleLink[1], sourceUrl),
  };
}

function cleanSegment(value) {
  return stripTags(value).replace(/\s*<[^>]*$/g, '').trim();
}

function parseJobs(html, sourceUrl, fallbackLocation) {
  const resultStart = html.indexOf('data-at="unified-resultlist"');
  const resultEnd = resultStart === -1 ? -1 : html.indexOf('id="app-footer"', resultStart);
  const resultHtml = resultStart === -1 ? html : html.slice(resultStart, resultEnd === -1 ? undefined : resultEnd);
  const blocks = [...resultHtml.matchAll(/<article[^>]+data-at=["']job-item["'][^>]*>[\s\S]*?(?=<article[^>]+data-at=["']job-item["'][^>]*>|<\/main>|$)/g)]
    .map((match) => match[0]);

  const jobs = blocks
    .map((block) => {
      const itemHtml = block.split(/<\/article>/i)[0] || block;
      const { title, url } = extractTitleLink(itemHtml, sourceUrl);
      const company = cleanSegment(segmentAfter(itemHtml, 'data-at="job-item-company-name"', 'data-at="job-item-location"'));
      const location = cleanSegment(segmentAfter(itemHtml, 'data-at="job-item-location"', 'data-at="job-item-middle"'));
      const snippet = cleanSegment(segmentAfter(itemHtml, 'data-at="jobcard-content"', 'data-at="text-snippet-expand-button"'));
      const date = cleanSegment(segmentAfter(itemHtml, 'data-at="job-item-timeago"', '</span>'));
      const id = itemHtml.match(/id=["']job-item-([^"']+)["']/)?.[1] || url.split('--').pop()?.replace(/-inline\.html$/, '');

      if (!title || !url) return null;

      return {
        id: `stepstone-${id || slugify(`${title}-${company}`)}`,
        title,
        company: company || 'Unbekannt',
        location: location || fallbackLocation || 'Tirol',
        snippet: (snippet || 'Details im Inserat').slice(0, 280),
        url,
        source: 'StepStone AT',
        date: date || 'Aktuell',
        category: 'StepStone',
      };
    })
    .filter(Boolean);

  return uniqueByUrl(jobs).slice(0, 10);
}

export const stepstoneAtSource = {
  id: 'stepstone-at',
  label: 'StepStone AT',
  async search(input) {
    if ((input.page || 0) > 0) {
      return [];
    }

    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      throw new Error(`StepStone AT scraper failed: ${response.status}`);
    }

    const html = await response.text();
    return parseJobs(html, url, input.location);
  },
};
