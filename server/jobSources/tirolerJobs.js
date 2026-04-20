import { decodeHtml, slugify, stripTags, uniqueByUrl } from './utils.js';

const BASE_URL = 'https://www.tirolerjobs.at';
const SITEMAP_URL = `${BASE_URL}/sitemap.jobs.xml`;
const PAGE_SIZE = 10;
const IGNORED_TERMS = new Set(['job', 'jobs', 'tirol', 'innsbruck']);

function getTerms(value = '') {
  return slugify(value)
    .split('-')
    .filter((term) => term.length > 2 && !IGNORED_TERMS.has(term));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml',
      'User-Agent': 'TirolNeustartBot/0.1 (+https://github.com/Deathcrusher/TirolNeustart)',
    },
  });

  if (!response.ok) {
    throw new Error(`tirolerjobs.at scraper failed: ${response.status}`);
  }

  return response.text();
}

function extractJobUrls(xml) {
  return [...xml.matchAll(/<loc>(https:\/\/www\.tirolerjobs\.at\/jobs\/[^<]+)<\/loc>/g)]
    .map((match) => decodeHtml(match[1]))
    .filter(Boolean);
}

function scoreUrl(url, input) {
  const queryTerms = getTerms(input.query);
  if (queryTerms.length === 0) return 1;

  const slug = slugify(decodeURIComponent(url));
  return queryTerms.reduce((score, term) => score + (slug.includes(term) ? 1 : 0), 0);
}

function extractJobPosting(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)];

  for (const script of scripts) {
    for (const candidate of [script[1], decodeHtml(script[1])]) {
      try {
        const data = JSON.parse(candidate.trim());
        const items = Array.isArray(data) ? data : [data];
        const posting = items.find((item) => item?.['@type'] === 'JobPosting');
        if (posting) return posting;
      } catch {
        // Ignore malformed structured data from a single detail page.
      }
    }
  }

  return null;
}

function firstAddress(jobLocation) {
  const location = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
  return location?.address || {};
}

function normalizePosting(posting, fallbackUrl, fallbackLocation) {
  if (!posting) return null;

  const title = stripTags(posting.title || '');
  const url = posting.url || fallbackUrl;
  if (!title || !url) return null;

  const address = firstAddress(posting.jobLocation);
  const locality = stripTags(address.addressLocality || '');
  const postalCode = stripTags(address.postalCode || '');
  const company = stripTags(posting.hiringOrganization?.name || 'Unbekannt');
  const id = url.split(',').pop() || slugify(`${title}-${company}`);

  return {
    id: `tirolerjobs-${id}`,
    title,
    company,
    location: [postalCode, locality].filter(Boolean).join(' ') || fallbackLocation || 'Tirol',
    snippet: stripTags(posting.description || 'Details im Inserat').slice(0, 260),
    url,
    source: 'tirolerjobs.at',
    date: posting.datePosted ? String(posting.datePosted).split(' ')[0] : 'Aktuell',
    category: stripTags(posting.industry || 'Jobportal'),
  };
}

export const tirolerJobsSource = {
  id: 'tirolerjobs',
  label: 'tirolerjobs.at',
  async search(input) {
    const xml = await fetchText(SITEMAP_URL);
    const ranked = extractJobUrls(xml)
      .map((url) => ({ url, score: scoreUrl(url, input) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const start = (input.page || 0) * PAGE_SIZE;
    const candidates = ranked.slice(start, start + PAGE_SIZE);
    const settled = await Promise.allSettled(
      candidates.map(async ({ url }) => normalizePosting(extractJobPosting(await fetchText(url)), url, input.location))
    );

    return uniqueByUrl(settled
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter(Boolean));
  },
};
