import { extractMaxWeeklyHours, slugify, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://www.jobs.at';
const PAGE_SIZE = 15;

function buildSearchUrl({ query, location }) {
  const querySlug = slugify(query || 'teilzeit') || 'teilzeit';
  const locationSlug = slugify(location || 'tirol') || 'tirol';
  return new URL(`/j/${querySlug}/${locationSlug}`, BASE_URL).toString();
}

function extractAttribute(value, attribute) {
  return value.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function extractFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? stripTags(match[1] || '') : '';
}

function parseJobs(html, sourceUrl, fallbackLocation) {
  const headings = [...html.matchAll(/<h2\b[^>]*data-job-title[^>]*>([\s\S]*?)<\/h2>/gi)];

  const jobs = headings.map((heading, index) => {
    const titleLink = heading[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (!titleLink) return null;

    const url = extractAttribute(titleLink[1], 'href');
    const title = stripTags(extractAttribute(titleLink[1], 'data-title') || titleLink[2]);
    if (!url || !title) return null;

    const nextHeading = headings[index + 1];
    const itemHtml = html.slice(heading.index, nextHeading?.index ?? html.length);
    const company = extractFirst(itemHtml, /<a\b[^>]*data-job-company[^>]*>([\s\S]*?)<\/a>/i);
    const location = extractFirst(itemHtml, /<ul\b[^>]*data-job-location[^>]*>([\s\S]*?)<\/ul>/i)
      || fallbackLocation
      || 'Tirol';
    const date = extractFirst(itemHtml, /<[^>]+class=["'][^"']*j-c-job-date[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const pills = [...itemHtml.matchAll(/<button\b[^>]*data-j-pill[^>]*>([\s\S]*?)<\/button>/gi)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);
    const snippet = pills.slice(0, 4).join(' · ') || 'Details im Inserat';
    const absoluteUrl = new URL(url, sourceUrl).toString();
    const id = extractAttribute(titleLink[1], 'data-c-id') || new URL(absoluteUrl).pathname.split('/').pop();

    return {
      id: `jobs-at-${id || slugify(title)}`,
      title,
      company: company || 'Unbekannt',
      location,
      snippet,
      url: absoluteUrl,
      source: 'jobs.at',
      date: date || 'Aktuell',
      category: 'Jobportal',
      maxWeeklyHours: extractMaxWeeklyHours(`${title} ${snippet}`),
    };
  }).filter(Boolean);

  return uniqueByUrl(jobs).slice(0, PAGE_SIZE);
}

export const jobsAtSource = {
  id: 'jobs-at',
  label: 'jobs.at',
  async search(input) {
    if ((input.page || 0) > 0) return [];

    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
      signal: AbortSignal.timeout(6500),
    });

    if (!response.ok) {
      throw new Error(`jobs.at scraper failed: ${response.status}`);
    }

    const html = await response.text();
    const jobs = parseJobs(html, url, input.location);
    if (jobs.length === 0) {
      throw new Error('jobs.at returned no readable job cards.');
    }
    return jobs;
  },
};
