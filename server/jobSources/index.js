import { hokifyAtSource } from './hokifyAt.js';
import { jobsAtSource } from './jobsAt.js';
import { jobsTtSource } from './jobsTt.js';
import { karriereAtSource } from './karriereAt.js';
import { metajobSource } from './metajob.js';
import { oehJobboerseSource } from './oehJobboerse.js';
import { stepstoneAtSource } from './stepstoneAt.js';
import { tirolerJobsSource } from './tirolerJobs.js';
import { simplifyJobQuery } from './utils.js';

const SOURCES = [
  jobsTtSource,
  tirolerJobsSource,
  jobsAtSource,
  hokifyAtSource,
  oehJobboerseSource,
  stepstoneAtSource,
  karriereAtSource,
  metajobSource,
];

const DEFAULT_SOURCE_TIMEOUT_MS = 5000;

function withTimeout(promise, label) {
  let timeoutId;
  const timeoutMs = label === 'StepStone AT' ? 5500
    : label === 'tirolerjobs.at' ? 7500
      : label === 'jobs.at' ? 7000
        : DEFAULT_SOURCE_TIMEOUT_MS;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} scraper timed out.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function searchCustomSources(input) {
  const requestedSource = String(input.sourceFilter || '').trim();
  const sourceInput = {
    ...input,
    query: simplifyJobQuery(input.query, input.location),
  };
  const activeSources = requestedSource
    ? SOURCES.filter((source) => source.label === requestedSource)
    : SOURCES;

  const settled = await Promise.allSettled(
    activeSources.map((source) =>
      withTimeout(
        source.search(sourceInput).then((jobs) => ({
          source: source.id,
          jobs,
        })),
        source.label
      )
    )
  );

  const jobs = [];
  const errors = [];

  settled.forEach((result) => {
    if (result.status === 'fulfilled') {
      jobs.push(...result.value.jobs);
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  });

  return {
    jobs,
    sources: activeSources.map((source) => source.label),
    errors,
  };
}
