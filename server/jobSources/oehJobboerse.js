import { absolutizeUrl, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://schwarzesbrett.oeh.ac.at';
const SEARCH_URL = `${BASE_URL}/jobs/liste.html`;
const PAGE_SIZE = 10;
const TIROL_LOCATIONS = [
  'Innsbruck',
  'Kufstein',
  'Wörgl',
  'Schwaz',
  'Telfs',
  'Imst',
  'Landeck',
  'Kitzbühel',
  'Lienz',
];

function getLocations(location = '') {
  const normalized = location.trim().toLowerCase();
  if (!normalized || normalized === 'tirol') return TIROL_LOCATIONS;
  return [location];
}

async function fetchSearchPage({ query, location, page = 0 }) {
  if (page === 0) {
    const body = new URLSearchParams();
    body.set('search_job_by_was', query || 'jobs');
    body.set('search_job_by_wo', location || '');

    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`ÖH Jobbörse scraper failed: ${response.status}`);
    }

    return response.text();
  }

  const url = new URL('/jobs/liste.html', BASE_URL);
  url.searchParams.set('current_page', String(page + 1));
  url.searchParams.set('was_filter', query || 'jobs');
  url.searchParams.set('wo_filter', location || '');

  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
    },
  });

  if (!response.ok) {
    throw new Error(`ÖH Jobbörse scraper failed: ${response.status}`);
  }

  return response.text();
}

function extractFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? stripTags(match[1] || '') : '';
}

function parseJobs(html, sourceUrl, fallbackLocation) {
  const listHtml = html.match(/<ul[^>]+class=["']contentList["'][\s\S]*?<\/ul>/)?.[0] || '';
  const blocks = listHtml.split(/<li>/).slice(1);

  const jobs = blocks
    .map((block) => {
      const itemHtml = block.split(/<\/li>/i)[0] || block;
      const titleLink = itemHtml.match(/<a[^>]+class=["'][^"']*blockLink[^"']*greyarrow[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/);
      const url = titleLink ? absolutizeUrl(titleLink[1], BASE_URL) : '';
      const title = titleLink ? stripTags(titleLink[2]) : '';
      const company = extractFirst(itemHtml, /<div[^>]+class=["']content["'][^>]*>\s*<p>([\s\S]*?)<\/p>/);
      const location = extractFirst(itemHtml, /<div[^>]+class=["']additionalInfo["'][^>]*>([\s\S]*?)<\/div>/);
      const date = extractFirst(itemHtml, /<span[^>]+class=["']date["'][^>]*>([\s\S]*?)<\/span>/);

      if (!title || !url) return null;

      return {
        id: `oeh-${url.split('/').filter(Boolean).pop() || title}`,
        title,
        company: company || 'Unbekannt',
        location: location || fallbackLocation || 'Österreich',
        snippet: company ? `${company} · ${location || fallbackLocation || 'Österreich'}` : 'Details im Inserat',
        url,
        source: 'ÖH Jobbörse',
        date: date || 'Aktuell',
        category: 'ÖH Schwarzes Brett',
      };
    })
    .filter(Boolean);

  return uniqueByUrl(jobs);
}

export const oehJobboerseSource = {
  id: 'oeh-jobboerse',
  label: 'ÖH Jobbörse',
  async search(input) {
    const locations = getLocations(input.location);
    const settled = await Promise.allSettled(
      locations.map(async (location) => parseJobs(await fetchSearchPage({ ...input, location }), SEARCH_URL, location))
    );

    return uniqueByUrl(settled
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value))
      .slice(0, PAGE_SIZE);
  },
};
