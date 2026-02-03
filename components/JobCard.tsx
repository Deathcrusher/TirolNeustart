
import React from 'react';
import { JobListing } from '../types';

interface JobCardProps {
  job: JobListing;
}

const JobCard: React.FC<JobCardProps> = ({ job }) => {
  const getSourceIcon = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes('tt')) return 'fa-newspaper text-blue-600';
    if (s.includes('öh') || s.includes('oeh')) return 'fa-graduation-cap text-orange-500';
    if (s.includes('indeed')) return 'fa-briefcase text-blue-800';
    if (s.includes('tirol')) return 'fa-mountain text-emerald-600';
    return 'fa-external-link-alt text-gray-500';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden border border-slate-100 flex flex-col h-full">
      <div className="p-5 flex-grow">
        <div className="flex justify-between items-start mb-3">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 flex items-center gap-1.5`}>
            <i className={`fas ${getSourceIcon(job.source)} text-[10px]`}></i>
            {job.source}
          </span>
          {job.date && <span className="text-xs text-slate-400">{job.date}</span>}
        </div>
        
        <h3 className="text-lg font-bold text-slate-800 mb-1 leading-tight line-clamp-2">
          {job.title}
        </h3>
        
        <div className="flex items-center gap-2 text-slate-600 text-sm mb-3">
          <i className="fas fa-building text-slate-400"></i>
          <span className="font-medium">{job.company}</span>
        </div>

        <div className="flex items-center gap-2 text-slate-500 text-xs mb-4">
          <i className="fas fa-map-marker-alt text-red-400"></i>
          <span>{job.location}</span>
        </div>

        <p className="text-slate-600 text-sm line-clamp-3 leading-relaxed mb-4">
          {job.snippet}
        </p>
      </div>

      <div className="p-4 border-t border-slate-50 bg-slate-50/50 mt-auto">
        <a 
          href={job.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors duration-200"
        >
          Zum Stellenangebot
          <i className="fas fa-arrow-up-right-from-square text-xs"></i>
        </a>
      </div>
    </div>
  );
};

export default JobCard;
