function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeUrl(url = '') {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url).replace(/\/$/, '').toLowerCase();
  }
}

export function dedupeJobs(jobs) {
  const seen = new Set();

  return jobs.filter((job) => {
    const urlKey = normalizeUrl(job.url);
    const textKey = [
      normalize(job.title),
      normalize(job.company),
      normalize(job.location),
    ].join('|');
    const key = urlKey || textKey;

    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
