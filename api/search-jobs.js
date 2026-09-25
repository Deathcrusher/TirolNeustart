import { requireAuth } from '../lib/auth.js';
import { searchCustomSources } from '../server/jobSources/index.js';
import { dedupeJobs } from '../server/jobs/dedupe.js';

const JOOBLE_BASE_URL = 'https://jooble.org/api';
const RESULTS_PER_PAGE = 30;
const SOURCE_URIS = {
  'jobs.tt.com': 'https://jobs.tt.com/job',
  'tirolerjobs.at': 'https://www.tirolerjobs.at/jobs',
  'hokify.at': 'https://hokify.at/jobs',
  'ÖH Jobbörse': 'https://schwarzesbrett.oeh.ac.at/jobs/',
  'StepStone AT': 'https://www.stepstone.at/jobs',
  'karriere.at': 'https://www.karriere.at/jobs/tirol',
  'METAJob': 'https://www.metajob.at',
  'willhaben Jobs': 'https://www.willhaben.at/jobs',
  'AMS alle jobs': 'https://jobs.ams.at/public/emps/',
  'Indeed AT': 'https://at.indeed.com',
  'Jooble': 'https://jooble.org',
};

function sourceGroup(source = '') {
  const normalized = String(source).toLowerCase();
  if (normalized.includes('metajob')) return 'METAJob';
  if (normalized.includes('jooble')) return 'Jooble';
  return source || 'Unbekannt';
}

function classifyWorkMode(job = {}) {
  const text = [
    job.workMode,
    job.remote,
    job.workplaceType,
    job.title,
    job.location,
    job.snippet,
    job.description,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/hybrid|home[ -]?office\s+(?:möglich|option|anteilig)|mobiles arbeiten\s+möglich/.test(text)) return 'hybrid';
  if (/\bremote\b|home[ -]?office|ortsunabhängig|fully remote|100\s*%\s*(?:remote|homeoffice)/.test(text)) return 'remote';
  if (/vor ort|onsite|on-site|präsenzpflicht/.test(text)) return 'vor Ort';
  return 'unklar';
}

function diversifyBySource(jobs, limit) {
  const buckets = new Map();
  jobs.forEach((job) => {
    const key = sourceGroup(job.source);
    const bucket = buckets.get(key) || [];
    bucket.push(job);
    buckets.set(key, bucket);
  });

  const mixed = [];
  while (mixed.length < limit && [...buckets.values()].some((bucket) => bucket.length > 0)) {
    for (const bucket of buckets.values()) {
      const job = bucket.shift();
      if (job) mixed.push(job);
      if (mixed.length >= limit) break;
    }
  }

  return mixed;
}

async function fetchJooble({ apiKey, query, location, page, remoteOnly }) {
  if (!apiKey) return [];

  const response = await fetch(`${JOOBLE_BASE_URL}/${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keywords: remoteOnly ? `${query} remote homeoffice` : query,
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
    workMode: classifyWorkMode(job),
  }));
}

export default async function handler(request, response) {
  if (!requireAuth(request, response)) return;

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
    sourceFilter = '',
    remoteOnly = false,
  } = request.body || {};

  const cleanedQuery = String(query).trim();
  const cleanedLocation = String(location).trim() || 'Tirol';
  const numericPage = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;
  const cleanedSourceFilter = String(sourceFilter || '').trim();
  const cleanedRemoteOnly = remoteOnly === true;
  const sourceQuery = cleanedRemoteOnly ? `${cleanedQuery} Remote Homeoffice` : cleanedQuery;

  if (!cleanedQuery) {
    response.status(400).json({ error: 'Missing query' });
    return;
  }

  const [customResult, joobleResult] = await Promise.allSettled([
    searchCustomSources({
      query: sourceQuery,
      location: cleanedLocation,
      page: numericPage,
      sourceFilter: cleanedSourceFilter,
    }),
    cleanedSourceFilter && cleanedSourceFilter !== 'Jooble' ? Promise.resolve([]) : fetchJooble({
      apiKey: String(joobleApiKey || '').trim(),
      query: cleanedQuery,
      location: cleanedLocation,
      page: numericPage,
      remoteOnly: cleanedRemoteOnly,
    }),
  ]);

  const customJobs = customResult.status === 'fulfilled'
    ? customResult.value.jobs.map((job) => ({ ...job, workMode: job.workMode || classifyWorkMode(job) }))
    : [];
  const joobleJobs = joobleResult.status === 'fulfilled' ? joobleResult.value : [];
  const errors = [
    ...(customResult.status === 'fulfilled' ? customResult.value.errors : [customResult.reason?.message || String(customResult.reason)]),
    ...(joobleResult.status === 'rejected' ? [joobleResult.reason?.message || String(joobleResult.reason)] : []),
  ].filter(Boolean);
  const matchingJobs = dedupeJobs([...customJobs, ...joobleJobs]).filter((job) =>
    (!cleanedRemoteOnly || job.workMode === 'remote') &&
    !(Number.isFinite(job.maxWeeklyHours) && job.maxWeeklyHours > 20) &&
    job.saturdayWork !== 'ja' &&
    job.fridayAfternoonWork !== 'ja'
  );
  const jobs = diversifyBySource(matchingJobs, RESULTS_PER_PAGE);
  const sourceNames = [...new Set(jobs.map((job) => sourceGroup(job.source)))];
  const sourceSummary = sourceNames.length === 1 ? '1 Portal' : `${sourceNames.length} Portale`;

  response.status(200).json({
    jobs,
    summary: jobs.length
      ? `${jobs.length} Treffer aus ${sourceSummary} für "${cleanedQuery}" in ${cleanedLocation}${cleanedRemoteOnly ? ' · nur Remote' : ''}.`
      : `Keine Treffer für "${cleanedQuery}" in ${cleanedLocation}${cleanedRemoteOnly ? ' · nur Remote' : ''}.`,
    groundingSources: sourceNames.map((source) => ({
      title: source,
      uri: SOURCE_URIS[source] || 'https://jooble.org',
    })),
    warnings: errors.slice(0, 10),
    debug: {
      errors,
      customJobs: customJobs.length,
      joobleJobs: joobleJobs.length,
    },
  });
}
