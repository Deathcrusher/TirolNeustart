import { slugify, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://www.metajob.at';

function buildSearchUrl({ query, location, page = 0 }) {
  const querySlug = slugify(query || 'jobs');
  const locationSlug = slugify(location || 'tirol') || 'tirol';
  const path = `/${querySlug}/${locationSlug}`;
  const url = new URL(path, BASE_URL);

  if (page > 0) {
    url.searchParams.set('p', String(page + 1));
  }

  return url.toString();
}

function extractPreloadedState(html) {
  const match = html.match(/window\.__PRELOADED_STATE_joseroot__\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function buildResultUrl(job, location) {
  const titleSlug = slugify(stripTags(job.c || 'job'));
  const locationSlug = slugify(Array.isArray(job.i) ? job.i[0] : location || 'tirol') || 'tirol';
  return `${BASE_URL}/${titleSlug}/${locationSlug}`;
}

function parseJobs(state, location) {
  const jobs = state?.e?.b;
  if (!Array.isArray(jobs)) return [];

  return uniqueByUrl(jobs
    .map((job) => {
      const title = stripTags(job.c || '');
      if (!title) return null;

      return {
        id: `metajob-${job.a || title}`,
        title,
        company: stripTags(job.u || 'Unbekannt'),
        location: Array.isArray(job.i) && job.i.length > 0 ? job.i.join(', ') : location || 'Tirol',
        snippet: stripTags(job.g || job.y || 'Details im Inserat'),
        url: buildResultUrl(job, location),
        source: job.v ? `METAJob / ${stripTags(job.v)}` : 'METAJob',
        date: job.r ? `vor ${job.r} Tagen` : 'Aktuell',
        category: 'Jobportal',
      };
    })
    .filter(Boolean))
    .slice(0, 15);
}

export const metajobSource = {
  id: 'metajob',
  label: 'METAJob',
  async search(input) {
    const url = buildSearchUrl(input);
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
      },
    });

    if (!response.ok) {
      throw new Error(`METAJob scraper failed: ${response.status}`);
    }

    const html = await response.text();
    const state = extractPreloadedState(html);
    return parseJobs(state, input.location);
  },
};
