
import React from 'react';
import { JobListing } from '../types';

interface JobCardProps {
  job: JobListing;
}

const JobCard: React.FC<JobCardProps> = ({ job }) => {
  const getSourceIcon = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes('stepstone')) return 'fa-layer-group text-cyan-700';
    if (s.includes('hokify')) return 'fa-bolt text-amber-500';
    if (s.includes('karriere')) return 'fa-chart-line text-emerald-600';
    if (s.includes('metajob')) return 'fa-magnifying-glass text-zinc-500';
    if (s.includes('tt')) return 'fa-newspaper text-blue-600';
    if (s.includes('öh') || s.includes('oeh')) return 'fa-graduation-cap text-orange-500';
    if (s.includes('indeed')) return 'fa-briefcase text-blue-800';
    if (s.includes('tirol')) return 'fa-mountain text-emerald-600';
    return 'fa-external-link-alt text-gray-500';
  };

  return (
    <article className="bg-white rounded-lg border border-zinc-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-700">
                <i className={`fas ${getSourceIcon(job.source)} text-[10px]`}></i>
                {job.source}
              </span>
              {job.date && <span className="text-xs font-semibold text-zinc-400">{job.date}</span>}
              {job.category && (
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  {job.category}
                </span>
              )}
            </div>

            <h3 className="mb-2 text-lg font-black leading-snug text-zinc-900">
              {job.title}
            </h3>

            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-zinc-600">
              <span className="inline-flex min-w-0 items-center gap-2">
                <i className="fas fa-building text-zinc-400"></i>
                <span className="truncate">{job.company}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-2">
                <i className="fas fa-location-dot text-rose-500"></i>
                <span className="truncate">{job.location}</span>
              </span>
            </div>

            <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600">
              {job.snippet}
            </p>
          </div>

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
          >
            Anzeigen
            <i className="fas fa-arrow-up-right-from-square text-xs"></i>
          </a>
        </div>
      </div>
    </article>
  );
};

export default JobCard;
