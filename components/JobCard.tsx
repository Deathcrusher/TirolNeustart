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
    if (s.includes('stepstone')) return 'fa-layer-group';
    if (s.includes('hokify')) return 'fa-bolt';
    if (s.includes('karriere')) return 'fa-chart-line';
    if (s.includes('metajob')) return 'fa-magnifying-glass';
    if (s.includes('tt')) return 'fa-newspaper';
    if (s.includes('öh') || s.includes('oeh')) return 'fa-graduation-cap';
    if (s.includes('indeed')) return 'fa-briefcase';
    if (s.includes('tirol')) return 'fa-mountain';
    return 'fa-arrow-up-right-from-square';
  };

  const workMode = job.workMode === 'remote'
    ? { label: 'Remote', icon: 'fa-house-laptop', className: 'job-tag--remote' }
    : job.workMode === 'hybrid'
      ? { label: 'Hybrid', icon: 'fa-arrows-left-right-to-line', className: 'job-tag--hybrid' }
      : job.workMode === 'vor Ort'
        ? { label: 'Vor Ort', icon: 'fa-location-dot', className: 'job-tag--onsite' }
        : job.workMode
          ? { label: 'Arbeitsort prüfen', icon: 'fa-circle-question', className: 'job-tag--unknown' }
          : null;
  const hasScheduleConflict = (job.maxWeeklyHours !== undefined && job.maxWeeklyHours !== null && job.maxWeeklyHours > 20)
    || job.saturdayWork === 'ja'
    || job.fridayAfternoonWork === 'ja';
  const scheduleConfirmed = job.maxWeeklyHours !== undefined && job.maxWeeklyHours !== null && job.maxWeeklyHours <= 20
    && job.saturdayWork === 'nein'
    && job.fridayAfternoonWork === 'nein';
  const scheduleLabel = hasScheduleConflict
    ? 'Zeitmodell weicht ab'
    : scheduleConfirmed
      ? 'Zeiten bestätigt'
      : 'Arbeitszeiten prüfen';
  const scheduleClass = hasScheduleConflict
    ? 'job-tag--conflict'
    : scheduleConfirmed
      ? 'job-tag--schedule'
      : 'job-tag--verify';

  return (
    <article className={`job-card ${darkMode ? 'is-dark' : ''}`}>
      <div className="job-card__top">
        <div className="job-card__source-line">
          <span className="job-card__source">
            <i className={`fas ${getSourceIcon(job.source)}`} aria-hidden="true"></i>
            {job.source}
          </span>
          {job.date && <span className="job-card__date">{job.date}</span>}
          {job.category && <span className="job-card__category">{job.category}</span>}
        </div>
        {onToggleSave && (
          <button
            type="button"
            onClick={() => onToggleSave(job)}
            className={`job-card__save ${isSaved ? 'is-saved' : ''}`}
            aria-label={isSaved ? 'Job aus der Merkliste entfernen' : 'Job in der Merkliste speichern'}
            aria-pressed={isSaved}
            title={isSaved ? 'Job entfernen' : 'Job speichern'}
          >
            <i className={`fas ${isSaved ? 'fa-bookmark' : 'fa-bookmark'}`} aria-hidden="true"></i>
          </button>
        )}
      </div>

      <h3>{job.title}</h3>

      <div className="job-card__meta">
        <span><i className="fas fa-building" aria-hidden="true"></i>{job.company}</span>
        <span><i className="fas fa-location-dot" aria-hidden="true"></i>{job.location}</span>
      </div>

      {job.snippet && <p className="job-card__snippet">{job.snippet}</p>}

      <div className="job-card__bottom">
        <div className="job-card__tags" aria-label="Eckdaten zur Stelle">
          <span className={`job-tag ${scheduleClass}`}>
            <i className={`fas ${hasScheduleConflict ? 'fa-circle-xmark' : scheduleConfirmed ? 'fa-circle-check' : 'fa-circle-question'}`} aria-hidden="true"></i>
            {scheduleLabel}
          </span>
          {job.maxWeeklyHours !== undefined && job.maxWeeklyHours !== null && (
            <span className="job-tag job-tag--hours"><i className="fas fa-clock" aria-hidden="true"></i>Bis {job.maxWeeklyHours} Std./Woche</span>
          )}
          {workMode && (
            <span className={`job-tag ${workMode.className}`}><i className={`fas ${workMode.icon}`} aria-hidden="true"></i>{workMode.label}</span>
          )}
          {job.saturdayWork === 'nein' && (
            <span className="job-tag job-tag--schedule"><i className="fas fa-calendar-check" aria-hidden="true"></i>Samstag frei</span>
          )}
          {job.fridayAfternoonWork === 'nein' && (
            <span className="job-tag job-tag--schedule"><i className="fas fa-calendar-check" aria-hidden="true"></i>Freitag nachmittags frei</span>
          )}
        </div>

        <div className="job-card__actions">
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="job-card__link">
            Stelle ansehen <i className="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </a>
        </div>
      </div>

      {job.scheduleEvidence && job.scheduleEvidence !== 'Details im Inserat' && (
        <p className="job-card__evidence"><strong>Hinweis zu den Arbeitszeiten:</strong> {job.scheduleEvidence}</p>
      )}
    </article>
  );
};

export default JobCard;
