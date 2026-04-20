import { amsAtSource } from './amsAt.js';
import { hokifyAtSource } from './hokifyAt.js';
import { indeedAtSource } from './indeedAt.js';
import { jobsTtSource } from './jobsTt.js';
import { karriereAtSource } from './karriereAt.js';
import { metajobSource } from './metajob.js';
import { tirolerJobsSource } from './tirolerJobs.js';

const SOURCES = [
  jobsTtSource,
  tirolerJobsSource,
  hokifyAtSource,
  karriereAtSource,
  metajobSource,
  amsAtSource,
  indeedAtSource,
];

export async function searchCustomSources(input) {
  const settled = await Promise.allSettled(
    SOURCES.map((source) =>
      source.search(input).then((jobs) => ({
        source: source.id,
        jobs,
      }))
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
    sources: SOURCES.map((source) => source.label),
    errors,
  };
}
