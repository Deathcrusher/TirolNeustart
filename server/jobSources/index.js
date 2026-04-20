import { karriereAtSource } from './karriereAt.js';

const SOURCES = [
  karriereAtSource,
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
