import { requireAuth } from '../lib/auth.js';

const MODEL = 'gpt-6-luna';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_RESULTS = 10;
const JOB_PROFILE = [
  'Teilzeit, höchstens 20 Wochenstunden.',
  'Keine Arbeit am Samstag.',
  'Freitag nur bis Mittag; keine Freitagnachmittagsarbeit.',
].join(' ');

const JOB_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          location: { type: 'string' },
          snippet: { type: 'string' },
          url: { type: 'string' },
          source: { type: 'string' },
          date: { type: 'string' },
          category: { type: 'string' },
          maxWeeklyHours: {
            anyOf: [{ type: 'number' }, { type: 'null' }],
          },
          saturdayWork: { type: 'string', enum: ['ja', 'nein', 'unklar'] },
          fridayAfternoonWork: { type: 'string', enum: ['ja', 'nein', 'unklar'] },
          workMode: { type: 'string', enum: ['remote', 'hybrid', 'vor Ort', 'unklar'] },
          scheduleEvidence: { type: 'string' },
        },
        required: [
          'title', 'company', 'location', 'snippet', 'url', 'source', 'date', 'category',
          'maxWeeklyHours', 'saturdayWork', 'fridayAfternoonWork', 'workMode', 'scheduleEvidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'jobs'],
  additionalProperties: false,
};

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/$/, '').toLowerCase()}`;
  } catch {
    return '';
  }
}

function responseText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

function collectSources(response) {
  const sources = new Map();
  for (const item of response.output || []) {
    if (item.type === 'web_search_call') {
      const actions = Array.isArray(item.action) ? item.action : [item.action];
      for (const action of actions) {
        for (const source of action?.sources || []) {
          if (source.url) sources.set(normalizeUrl(source.url), { title: source.title || source.url, uri: source.url });
        }
      }
    }
    if (item.type === 'message') {
      for (const part of item.content || []) {
        for (const annotation of part.annotations || []) {
          const citation = annotation.url_citation || annotation;
          if (citation.url) sources.set(normalizeUrl(citation.url), { title: citation.title || citation.url, uri: citation.url });
        }
      }
    }
  }
  return [...sources.values()].filter((source) => source.uri);
}

function errorMessage(status) {
  if (status === 401 || status === 403) return 'OpenAI hat den API-Schlüssel abgelehnt. Prüfe OPENAI_API_KEY in Vercel.';
  if (status === 429) return 'Das OpenAI-Limit ist erreicht. Prüfe Abrechnung und Limits deines OpenAI-Projekts.';
  if (status >= 500) return 'Die OpenAI-Suche ist vorübergehend nicht erreichbar. Bitte versuche es später erneut.';
  return 'Die KI-Suche konnte die Anfrage nicht verarbeiten.';
}

export default async function handler(request, response) {
  if (!requireAuth(request, response)) return;

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    response.status(503).json({ error: 'OPENAI_API_KEY fehlt in der Vercel-Umgebung.' });
    return;
  }

  const body = request.body || {};
  const query = String(body.query || '').trim().slice(0, 160);
  const location = String(body.location || 'Tirol').trim().slice(0, 80) || 'Tirol';
  const remoteOnly = body.remoteOnly === true;
  const searchProfile = `${JOB_PROFILE} ${remoteOnly
    ? 'Ausschließlich vollständig ortsunabhängige Remote-Stellen; keine Hybrid- oder Vor-Ort-Arbeit.'
    : 'Homeoffice oder Remote ist bevorzugt, aber kein Muss.'}`;
  const currentJobCount = Math.max(0, Math.min(500, Number(body.currentJobCount) || 0));
  const knownUrls = Array.isArray(body.knownUrls)
    ? body.knownUrls.map((url) => String(url)).filter(Boolean).slice(0, 40)
    : [];

  if (!query) {
    response.status(400).json({ error: 'Bitte gib einen Suchbegriff ein.' });
    return;
  }

  const instructions = [
    'Du bist eine sorgfältige Job-Suchassistentin für Tirol und Österreich.',
    'Führe mit der Websuche eine aktuelle Suche nach konkreten Stellenanzeigen durch.',
    'Das Suchprofil lautet: ' + searchProfile,
    'Behandle maximal 20 Wochenstunden, samstags frei und freitags spätestens mittags als feste Anforderungen.',
    'Schließe Inserate aus, die ausdrücklich mehr als 20 Wochenstunden, Samstagsarbeit oder Arbeit am Freitagnachmittag verlangen.',
    'Wenn die Arbeitszeit oder der Dienstplan im Inserat nicht klar erkennbar ist, darf der Treffer bleiben; kennzeichne die Angabe als unklar und erfinde keine Arbeitszeiten.',
    remoteOnly
      ? 'Es dürfen ausschließlich vollständig ortsunabhängige Remote-Stellen zurückkommen. Schließe Hybrid-, Vor-Ort- und Inserate mit unklarem Arbeitsort aus. Setze workMode nur dann auf remote, wenn das Inserat ausdrücklich eine vollständig remote oder ortsunabhängige Tätigkeit bestätigt.'
      : 'Remote/Homeoffice ist ein Pluspunkt und darf passende Vor-Ort-Stellen nicht ausschließen.',
    'Gib ausschließlich direkte, konkrete Inseratsseiten zurück, keine Suchseiten, Übersichtsseiten, Login-Seiten oder Formulare.',
    'Erfinde keine Unternehmen, Arbeitszeiten, Standorte oder URLs. Nutze nur URLs aus den Websuchtreffern.',
    'Bevorzuge aktuelle Inserate aus Tirol und nahegelegenen Orten; priorisiere Remote-Treffer, wenn sie sonst gleich gut passen.',
    'Gib eine knappe deutsche Zusammenfassung und höchstens ' + MAX_RESULTS + ' Treffer zurück.',
    'Wenn du eine Wochenstundenzahl nennen kannst, setze maxWeeklyHours auf die höchste im Inserat genannte Zahl; sonst auf null.',
    'Setze saturdayWork und fridayAfternoonWork nur dann auf ja/nein, wenn das Inserat dafür einen Beleg liefert; andernfalls auf unklar.',
    'Fasse in scheduleEvidence knapp zusammen, was das Inserat zu Wochenstunden und Dienstzeiten tatsächlich sagt.',
  ].join('\n');

  const userInput = [
    `Suchbegriff: ${query}`,
    `Ort: ${location}`,
    `Arbeitszeitprofil: ${searchProfile}`,
    remoteOnly ? 'Arbeitsortfilter: Nur ausdrücklich vollständig remote/ortsunabhängige Stellen; Hybrid, Vor-Ort und unklaren Arbeitsort ausschließen.' : '',
    remoteOnly ? 'Suchbegriffe für die Websuche: Remote, vollständig remote, 100% Homeoffice, ortsunabhängig.' : '',
    currentJobCount > 0 ? `Finde weitere Treffer nach den ersten ${currentJobCount}; wiederhole keine bereits angezeigten URLs.` : 'Finde die besten passenden aktuellen Treffer.',
    knownUrls.length > 0 ? `Diese URLs wurden bereits angezeigt und sind auszuschließen: ${knownUrls.join(', ')}` : '',
    'Suche bevorzugt bei tirolerjobs.at, jobs.tt.com, karriere.at, hokify.at, stepstone.at, jobs.at und direkt bei Arbeitgebern.',
  ].filter(Boolean).join('\n');

  let openAiResponse;
  try {
    openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: 'low' },
        store: false,
        instructions,
        input: userInput,
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        max_output_tokens: 5000,
        text: {
          format: {
            type: 'json_schema',
            name: 'tirol_job_search_results',
            strict: true,
            schema: JOB_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    console.error('OpenAI job search request failed:', error);
    response.status(502).json({ error: 'OpenAI konnte nicht erreicht werden.' });
    return;
  }

  if (!openAiResponse.ok) {
    console.error('OpenAI job search returned status:', openAiResponse.status);
    response.status(openAiResponse.status >= 500 ? 502 : openAiResponse.status).json({ error: errorMessage(openAiResponse.status) });
    return;
  }

  let completion;
  try {
    completion = await openAiResponse.json();
    const parsed = JSON.parse(responseText(completion));
    const groundingSources = collectSources(completion);
    const sourceUrls = new Set(groundingSources.map((source) => normalizeUrl(source.uri)));
    const excludedUrls = new Set(knownUrls.map(normalizeUrl).filter(Boolean));
    const seenUrls = new Set(excludedUrls);
    const jobs = (Array.isArray(parsed.jobs) ? parsed.jobs : [])
      .filter((job) => {
        const url = normalizeUrl(job.url);
        if (!url || !sourceUrls.has(url) || seenUrls.has(url)) return false;
        if (
          (!remoteOnly || job.workMode === 'remote') &&
          !(Number.isFinite(job.maxWeeklyHours) && job.maxWeeklyHours > 20) &&
          job.saturdayWork !== 'ja' && job.fridayAfternoonWork !== 'ja'
        ) {
          seenUrls.add(url);
          return true;
        }
        return false;
      })
      .slice(0, MAX_RESULTS)
      .map((job, index) => {
        const safeUrl = new URL(job.url);
        return {
          id: `gpt-${Date.now()}-${index}`,
          title: job.title || 'Stellenangebot',
          company: job.company || 'Unbekannter Arbeitgeber',
          location: job.location || location,
          snippet: job.snippet || 'Details im Inserat.',
          url: safeUrl.href,
          source: job.source || safeUrl.hostname.replace(/^www\./, ''),
          date: job.date || '',
          category: job.category || '',
          maxWeeklyHours: Number.isFinite(job.maxWeeklyHours) ? job.maxWeeklyHours : null,
          saturdayWork: job.saturdayWork,
          fridayAfternoonWork: job.fridayAfternoonWork,
          workMode: job.workMode,
          scheduleEvidence: job.scheduleEvidence || '',
        };
      });

    response.status(200).json({
      jobs,
      summary: parsed.summary || `Passende Stellenangebote in ${location}${remoteOnly ? ' (nur Remote)' : ''}.`,
      groundingSources,
    });
  } catch (error) {
    console.error('Could not parse OpenAI job search response:', error);
    response.status(502).json({ error: 'Die KI-Suche lieferte keine auswertbaren Jobdaten. Bitte versuche es erneut.' });
  }
}
