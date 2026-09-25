
export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  snippet: string;
  url: string;
  source: string;
  date?: string;
  category?: string;
  maxWeeklyHours?: number | null;
  saturdayWork?: 'ja' | 'nein' | 'unklar';
  fridayAfternoonWork?: 'ja' | 'nein' | 'unklar';
  workMode?: 'remote' | 'hybrid' | 'vor Ort' | 'unklar';
  scheduleEvidence?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface SearchResult {
  jobs: JobListing[];
  groundingSources: GroundingSource[];
  summary: string;
  warnings?: string[];
}

export interface SearchOptions {
  knownUrls?: string[];
}

export enum JobPortal {
  TT = 'Tiroler Tageszeitung',
  OEH = 'ÖH Jobbörse',
  Indeed = 'Indeed',
  TirolJobs = 'TirolJobs',
  All = 'Alle Portale'
}
