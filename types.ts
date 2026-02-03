
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
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface SearchResult {
  jobs: JobListing[];
  groundingSources: GroundingSource[];
  summary: string;
}

export enum JobPortal {
  TT = 'Tiroler Tageszeitung',
  OEH = 'ÖH Jobbörse',
  Indeed = 'Indeed',
  TirolJobs = 'TirolJobs',
  All = 'Alle Portale'
}
