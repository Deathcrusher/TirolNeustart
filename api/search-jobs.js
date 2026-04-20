import { searchCustomSources } from '../server/jobSources/index.js';
import { dedupeJobs } from '../server/jobs/dedupe.js';

const JOOBLE_BASE_URL = 'https://jooble.org/api';
const RESULTS_PER_PAGE = 20;
const SOURCE_URIS = {
  'jobs.tt.com': 'https://jobs.tt.com/job',
  'karriere.at': 'https://www.karriere.at/jobs/tirol',
  'METAJob': 'https://www.metajob.at',
  'Indeed AT': 'https://at.indeed.com',
  'Jooble': 'https://jooble.org',
};

async function fetchJooble({ apiKey, query, location, page }) {
  if (!apiKey) return [];

  const response = await fetch(`${JOOBLE_BASE_URL}/${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keywords: query,
      location,
      radius: '40',
      page: String(page + 1),
      ResultOnPage: '10',
      companysearch: 'false',
    }),
  });

  if (!response.ok) {
    throw new Error(`Jooble API Error: ${response.status} ${response.statusText}`.trim());
  }

  const data = await response.json();
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  return jobs.map((job, index) => ({
    id: job.id || `jooble-${Date.now()}-${index}`,
    title: job.title || 'Unbekannte Position',
    company: job.company || 'Vertraulich',
    location: job.location || location,
    snippet: job.snippet || 'Details im Inserat',
    url: job.link || job.url || '#',
    source: 'Jooble',
    date: job.updated || job.posted || 'Aktuell',
    category: 'Jobportal',
  }));
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    query = '',
    location = 'Tirol',
    page = 0,
    joobleApiKey = '',
  } = request.body || {};

  const cleanedQuery = String(query).trim();
  const cleanedLocation = String(location).trim() || 'Tirol';
  const numericPage = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;

  if (!cleanedQuery) {
    response.status(400).json({ error: 'Missing query' });
    return;
  }

  const [customResult, joobleResult] = await Promise.allSettled([
    searchCustomSources({
      query: cleanedQuery,
      location: cleanedLocation,
      page: numericPage,
    }),
    fetchJooble({
      apiKey: String(joobleApiKey || '').trim(),
      query: cleanedQuery,
      location: cleanedLocation,
      page: numericPage,
    }),
  ]);

  const customJobs = customResult.status === 'fulfilled' ? customResult.value.jobs : [];
  const joobleJobs = joobleResult.status === 'fulfilled' ? joobleResult.value : [];
  const errors = [
    ...(customResult.status === 'fulfilled' ? customResult.value.errors : [customResult.reason?.message || String(customResult.reason)]),
    ...(joobleResult.status === 'rejected' ? [joobleResult.reason?.message || String(joobleResult.reason)] : []),
  ].filter(Boolean);
  const sourceNames = [
    ...(customResult.status === 'fulfilled' ? customResult.value.sources : ['Custom scrapers']),
    ...(joobleJobs.length > 0 ? ['Jooble'] : []),
  ];
  const jobs = dedupeJobs([...customJobs, ...joobleJobs]).slice(0, RESULTS_PER_PAGE);

  response.status(200).json({
    jobs,
    summary: `${jobs.length} Treffer aus ${sourceNames.join(', ') || 'eigenen Quellen'} für "${cleanedQuery}" in ${cleanedLocation}.`,
    groundingSources: sourceNames.map((source) => ({
      title: source,
      uri: SOURCE_URIS[source] || 'https://jooble.org',
    })),
    debug: {
      errors,
      customJobs: customJobs.length,
      joobleJobs: joobleJobs.length,
    },
  });
}
