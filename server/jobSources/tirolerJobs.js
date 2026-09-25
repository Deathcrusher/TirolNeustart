import { extractMaxWeeklyHours, slugify, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://www.tirolerjobs.at';
const PAGE_SIZE = 30;

function buildSearchUrl({ query, location, page = 0 }) {
  const querySlug = slugify(query || 'Teilzeit') || 'teilzeit';
  const locationSlug = slugify(location || 'Tirol');
  const path = `/jobs/${querySlug}${locationSlug && locationSlug !== 'tirol' ? `/${locationSlug}` : ''}`;
  const url = new URL(path, BASE_URL);

  if (page > 0) {
    url.searchParams.set('page', String(page + 1));
  }

  return url.toString();
}

function extractFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? stripTags(match[1] || '') : '';
}

function extractRaw(value, pattern) {
  return value.match(pattern)?.[1] || '';
}

function extractAttribute(value, attribute) {
  return value.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function parseJobs(html, input) {
  const headings = [...html.matchAll(/<h2\b[^>]*class=["'][^"']*m-results__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/gi)];

  const jobs = headings.map((heading, index) => {
    const titleLink = heading[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (!titleLink) return null;

    const url = extractAttribute(titleLink[1], 'href');
    const title = stripTags(extractAttribute(titleLink[1], 'title') || titleLink[2]);
    if (!url || !title) return null;

    const nextHeading = headings[index + 1];
    const itemHtml = html.slice(heading.index, nextHeading?.index ?? html.length);
    const companyHtml = extractRaw(itemHtml, /<div[^>]+class=["'][^"']*m-results__company[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const companyLink = companyHtml.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const company = companyLink
      ? stripTags(extractAttribute(companyLink[1], 'title') || companyLink[2])
      : stripTags(companyHtml);
    const locationAndDate = extractFirst(itemHtml, /<div[^>]+class=["'][^"']*m-results__meta[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const dateMatch = locationAndDate.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/);
    const date = dateMatch?.[0] || 'Aktuell';
    const location = (dateMatch ? locationAndDate.replace(dateMatch[0], '') : locationAndDate).trim()
      || input.location
      || 'Tirol';
    const category = extractFirst(itemHtml, /<span[^>]+class=["'][^"']*m-results__category[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const details = extractFirst(itemHtml, /<details[^>]+class=["'][^"']*m-results__details[^"']*["'][^>]*>([\s\S]*?)<\/details>/i);
    const snippet = details.replace(/Zum Stellenangebot/gi, '').slice(0, 280) || category || 'Details im Inserat';
    const absoluteUrl = new URL(url, BASE_URL).toString();

    const pathname = new URL(absoluteUrl).pathname;
    return {
      id: `tirolerjobs-${pathname.split(',').pop() || slugify(title)}`,
      title,
      company: company || 'Unbekannt',
      location,
      snippet,
      url: absoluteUrl,
      source: 'tirolerjobs.at',
      date,
      category: category || 'Jobportal',
      maxWeeklyHours: extractMaxWeeklyHours(`${title} ${snippet}`),
    };
  }).filter(Boolean);

  return uniqueByUrl(jobs).slice(0, PAGE_SIZE);
}

export const tirolerJobsSource = {
  id: 'tirolerjobs',
  label: 'tirolerjobs.at',
  async search(input) {
    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      throw new Error(`tirolerjobs.at scraper failed: ${response.status}`);
    }

    const html = await response.text();
    const jobs = parseJobs(html, input);
    if (jobs.length === 0) {
      throw new Error('tirolerjobs.at returned no readable job cards.');
    }
    return jobs;
  },
};
