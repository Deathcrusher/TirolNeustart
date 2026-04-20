# Scraper Strategy

## Short Version

Yes, TirolNeustart can have its own scraper system. It should not be one universal scraper for every job site. It should be a modular pipeline with one adapter per source.

The goal is:

```text
many job sites
  -> source adapters
  -> normalized job records
  -> dedupe
  -> cache/database
  -> fast search API
  -> Gemini enrichment in background
```

## Why Not One Scraper For Everything

Every job site is different:

- different HTML structure
- different search URLs
- different pagination
- different date formats
- different company/location fields
- some pages render jobs with JavaScript
- some pages block frequent requests
- some pages change markup often

A universal scraper would break often. A source-adapter approach is slower to build at the start, but much easier to repair and extend.

## Source Adapter Shape

Each scraper adapter should expose the same interface:

```ts
export interface JobSourceAdapter {
  id: string;
  label: string;
  search(input: JobSearchInput): Promise<RawJob[]>;
}

export interface JobSearchInput {
  query: string;
  location: string;
  page?: number;
}

export interface RawJob {
  title: string;
  company: string;
  location: string;
  snippet: string;
  url: string;
  source: string;
  date?: string;
}
```

The app should never care whether a result came from Jooble, AMS, Karriere.at, or a custom scraper. Everything becomes the same job object.

## First Sources To Target

Start with sources that are relevant for Tirol and likely to produce useful results:

- `jobs.tt.com`
- `tirolerjobs.at`
- `karriere.at`
- `ams.at`
- `hokify.at`
- `willhaben.at/jobs`
- `stepstone.at`
- employer career pages in Tirol

Do not try all sources at once. Build one adapter, normalize it, cache it, then add the next.

## Fetch-Based Scraper vs Browser Scraper

Use a simple fetch-based scraper when the job listings are visible in server-rendered HTML.

Use Playwright or Apify when:

- the site needs JavaScript to render results
- pagination is loaded dynamically
- filters require browser interaction
- the source blocks simple HTTP requests

Preferred order:

1. official API, feed, or sitemap
2. lightweight `fetch` scraper
3. Playwright/Apify actor

## Runtime Model

Do not scrape every site live on every user search. That will be slow.

Better:

```text
scheduled job every 15-60 minutes
  -> scrape configured sources
  -> normalize jobs
  -> remove duplicates
  -> save to database/cache

user searches
  -> query local cache/database
  -> return results fast
  -> optionally refresh one source in background
```

This makes the app feel fast and reduces blocking, rate limits, and failures.

## Dedupe Rules

Jobs often appear on multiple portals. Dedupe should use:

- canonical URL
- normalized title + company + location
- similar title matching
- source priority when duplicates exist

Example:

```text
Verkäuferin / Müller / Innsbruck
Verkäufer m/w/d / Müller GmbH / Innsbruck
```

These may be the same job and should be merged or ranked together.

## Gemini Role

Gemini should enrich structured jobs after scraping:

- classify category
- detect Quereinsteiger suitability
- summarize noisy snippets
- rank jobs for the user query
- mark suspicious or low-quality results

Gemini should not be the main live scraper because web-grounded search is slower and less predictable than cached structured data.

## Legal And Operational Checks

Before adding a source, check:

- robots.txt
- terms of service
- whether an official API/feed exists
- request frequency
- whether scraping personal data is avoided
- whether job links point to the original listing

The scraper should use conservative rate limits and identify itself clearly if possible.

## Suggested Project Structure

```text
api/
  search-jobs.js
  cron/
    scrape-jobs.js

server/
  jobSources/
    index.ts
    types.ts
    jobsTt.ts
    tirolerjobs.ts
    karriereAt.ts
    ams.ts
  normalizeJob.ts
  dedupeJobs.ts
  jobStore.ts
  enrichJobs.ts
```

The current project is mostly frontend plus small API proxy code. A real scraper pipeline will likely need a `server/` layer and a database/cache.

## Implementation Phases

1. Create shared job source types.
2. Add one lightweight source adapter, preferably the easiest source first.
3. Normalize all fields into the existing `JobListing` shape.
4. Add dedupe.
5. Add a cache or database.
6. Add `/api/search-jobs`.
7. Move the UI to call `/api/search-jobs`.
8. Add more source adapters one by one.
9. Add Gemini background enrichment.
10. Add monitoring/logging for broken sources.

## Practical Warning

"Scrape all job sites" is a product goal, not one implementation task. The maintainable version is:

```text
scrape many sources through controlled adapters
```

That gives the same user-facing result, but it is debuggable when one provider changes its layout or blocks requests.
