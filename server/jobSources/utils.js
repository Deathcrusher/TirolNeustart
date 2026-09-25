export function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&auml;/g, 'ä')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function stripTags(value = '') {
  return decodeHtml(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function absolutizeUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

export function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const GENERIC_SEARCH_TERMS = new Set([
  'job', 'jobs', 'jobangebot', 'jobangebote', 'stelle', 'stellen', 'stellenangebot', 'stellenangebote',
  'arbeitsplatz', 'arbeitsplatze', 'arbeitsplaetze', 'arbeit', 'suche', 'finden', 'osterreich', 'oesterreich', 'tirol',
  'in', 'im', 'am', 'mit', 'und', 'als', 'fuer', 'fur',
]);

export function simplifyJobQuery(query = '', location = 'Tirol') {
  const locationTerms = new Set(slugify(location).split('-').filter(Boolean));
  locationTerms.add('tirol');
  const queryTerms = String(query).normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
  const terms = queryTerms.filter((term) => {
    const normalizedTerm = slugify(term);
    return normalizedTerm && !GENERIC_SEARCH_TERMS.has(normalizedTerm) && !locationTerms.has(normalizedTerm);
  });

  return terms.join(' ') || 'Teilzeit';
}

export function extractMaxWeeklyHours(value = '') {
  const text = String(value).replace(/\u00a0/g, ' ');
  const number = '(\\d{1,2}(?:[.,]\\d+)?)';
  const unit = '(?:wochenstunden|wochenstd\\.?|wst\\.?|stunden(?:\\s+pro\\s+woche)?|std\\.?|h(?:\\s*\\/\\s*woche)?)';
  const range = text.match(new RegExp(`${number}\\s*(?:-|–|—|bis)\\s*${number}\\s*${unit}`, 'i'));
  if (range) return Number(range[2].replace(',', '.'));

  const exact = text.match(new RegExp(`${number}\\s*${unit}`, 'i'));
  if (!exact) return undefined;

  const prefix = text.slice(0, exact.index).trimEnd();
  if (/\b(?:ab|mindestens)\s*$/i.test(prefix)) return undefined;
  return Number(exact[1].replace(',', '.'));
}

export function uniqueByUrl(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = String(job.url || '').replace(/\/$/, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
