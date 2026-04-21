import { amsAtSource } from './amsAt.js';
import { hokifyAtSource } from './hokifyAt.js';
import { indeedAtSource } from './indeedAt.js';
import { jobsTtSource } from './jobsTt.js';
import { karriereAtSource } from './karriereAt.js';
import { metajobSource } from './metajob.js';
import { oehJobboerseSource } from './oehJobboerse.js';
import { stepstoneAtSource } from './stepstoneAt.js';
import { tirolerJobsSource } from './tirolerJobs.js';
import { willhabenJobsSource } from './willhabenJobs.js';

const SOURCES = [
  jobsTtSource,
  tirolerJobsSource,
  hokifyAtSource,
  oehJobboerseSource,
  stepstoneAtSource,
  karriereAtSource,
  metajobSource,
  willhabenJobsSource,
  amsAtSource,
  indeedAtSource,
];

const DEFAULT_SOURCE_TIMEOUT_MS = 3500;

function withTimeout(promise, label) {
  let timeoutId;
  const timeoutMs = label === 'StepStone AT' ? 5000 : DEFAULT_SOURCE_TIMEOUT_MS;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} scraper timed out.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function searchCustomSources(input) {
  const requestedSource = String(input.sourceFilter || '').trim();
  const activeSources = requestedSource
    ? SOURCES.filter((source) => source.label === requestedSource)
    : SOURCES;

  const settled = await Promise.allSettled(
    activeSources.map((source) =>
      withTimeout(
        source.search(input).then((jobs) => ({
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
