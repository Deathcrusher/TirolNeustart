import React from 'react';
import { JobListing } from '../types';

interface JobCardProps {
  job: JobListing;
  darkMode?: boolean;
  isSaved?: boolean;
  onToggleSave?: (job: JobListing) => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, darkMode = false, isSaved = false, onToggleSave }) => {
  const getSourceIcon = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes('stepstone')) return 'fa-layer-group text-cyan-700 dark:text-cyan-400';
    if (s.includes('hokify')) return 'fa-bolt text-amber-500 dark:text-amber-400';
    if (s.includes('karriere')) return 'fa-chart-line text-emerald-600 dark:text-emerald-400';
    if (s.includes('metajob')) return 'fa-magnifying-glass text-zinc-500 dark:text-zinc-400';
    if (s.includes('tt')) return 'fa-newspaper text-blue-600 dark:text-blue-400';
    if (s.includes('öh') || s.includes('oeh')) return 'fa-graduation-cap text-orange-500 dark:text-orange-400';
    if (s.includes('indeed')) return 'fa-briefcase text-blue-800 dark:text-blue-400';
    if (s.includes('tirol')) return 'fa-mountain text-emerald-600 dark:text-emerald-400';
    return 'fa-external-link-alt text-gray-500 dark:text-gray-400';
  };

  return (
    <article className={`rounded-lg border shadow-sm hover:border-emerald-300 hover:shadow-md transition-all overflow-hidden ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
      <div className="p-3 sm:p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${darkMode ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-100 text-zinc-700'}`}>
                <i className={`fas ${getSourceIcon(job.source)} text-[10px]`}></i>
                {job.source}
              </span>
              {job.date && <span className="text-xs font-semibold text-zinc-400">{job.date}</span>}
              {job.category && (
                <span className={`rounded-md px-2 py-1 text-xs font-bold ${darkMode ? 'bg-emerald-900 text-emerald-200' : 'bg-emerald-50 text-emerald-700'}`}>
                  {job.category}
                </span>
              )}
            </div>

            <h3 className={`mb-2 text-base font-black leading-snug sm:text-lg ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              {job.title}
            </h3>

            <div className={`mb-3 flex flex-col gap-2 text-sm font-semibold sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2 ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <span className="inline-flex min-w-0 items-center gap-2">
                <i className="fas fa-building text-zinc-400"></i>
                <span className="truncate">{job.company}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-2">
                <i className="fas fa-location-dot text-rose-500"></i>
                <span className="truncate">{job.location}</span>
              </span>
            </div>

            <p className={`line-clamp-2 text-sm leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {job.snippet}
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            {onToggleSave && (
              <button
                onClick={() => onToggleSave(job)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors md:w-auto ${
                  isSaved
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                }`}
                title={isSaved ? 'Job entfernen' : 'Job speichern'}
              >
                <i className="fas fa-bookmark"></i>
                <span className="hidden sm:inline">{isSaved ? 'Gespeichert' : 'Speichern'}</span>
              </button>
            )}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 md:w-auto"
            >
              Anzeigen
              <i className="fas fa-arrow-up-right-from-square text-xs"></i>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
};

export default JobCard;