import { absolutizeUrl, slugify, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://hokify.at';
const PAGE_SIZE = 10;
const KNOWN_TIROL_LOCATIONS = [
  'Innsbruck',
  'Kufstein',
  'Wörgl',
  'Woergl',
  'Schwaz',
  'Hall in Tirol',
  'Telfs',
  'Imst',
  'Landeck',
  'Reutte',
  'Kitzbühel',
  'Kitzbuehel',
  'Lienz',
  'Vomp',
  'Wattens',
  'Zirl',
  'Rum',
  'Jenbach',
  'Fügen',
  'Fuegen',
  'Mayrhofen',
  'Sölden',
  'Soelden',
];

function buildSearchUrl({ query, location, page = 0 }) {
  const querySlug = slugify(query || 'jobs') || 'jobs';
  const locationSlug = slugify(location || 'tirol') || 'tirol';
  const url = new URL(`/jobs/m/${querySlug}/${locationSlug}`, BASE_URL);

  if (page > 0) {
    url.searchParams.set('page', String(page + 1));
  }

  return url.toString();
}

function extractFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? stripTags(match[1] || '') : '';
}

function extractLocation(text, fallbackLocation) {
  const lowerText = text.toLowerCase();
  const knownLocation = KNOWN_TIROL_LOCATIONS.find((location) => lowerText.includes(location.toLowerCase()));
  return knownLocation || fallbackLocation || 'Tirol';
}

function cleanSnippet(text, title, company) {
  return text
    .replace(title, '')
    .replace(company, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || 'Details im Inserat';
}

function parseJobs(html, sourceUrl, fallbackLocation) {
  const listHtml = html.match(/<ul[^>]+id=["']joblist-online["'][\s\S]*?<\/ul>/)?.[0] || html;
  const blocks = listHtml
    .split(/<li[^>]+class=["'][^"']*border-b-2[^"']*["'][^>]*>/)
    .slice(1);

  const jobs = blocks
    .map((block) => {
      const itemHtml = block.split(/<\/li>/i)[0] || block;
      const titleLink = itemHtml.match(/<a[^>]+href=["'](\/job\/\d+)["'][^>]*>([\s\S]*?)<\/a>/);
      const title = titleLink ? stripTags(titleLink[2]) : '';
      const url = titleLink ? absolutizeUrl(titleLink[1], sourceUrl) : '';
      const company = extractFirst(itemHtml, /<a[^>]+data-cy=["']companyName["'][^>]*>([\s\S]*?)<\/a>/);
      const text = stripTags(itemHtml);

      if (!title || !url) return null;

      return {
        id: `hokify-${url.split('/').filter(Boolean).pop() || slugify(title)}`,
        title,
        company: company || 'Unbekannt',
        location: extractLocation(text, fallbackLocation),
        snippet: cleanSnippet(text, title, company),
        url,
        source: 'hokify.at',
        date: 'Aktuell',
        category: 'Hokify',
      };
    })
    .filter(Boolean);

  return uniqueByUrl(jobs).slice(0, PAGE_SIZE);
}

export const hokifyAtSource = {
  id: 'hokify-at',
  label: 'hokify.at',
  async search(input) {
    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
    });

    if (!response.ok) {
      throw new Error(`hokify.at scraper failed: ${response.status}`);
    }

    const html = await response.text();
    return parseJobs(html, url, input.location);
  },
};
