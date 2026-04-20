# Job Search Pipeline Notes

## Goal

TirolNeustart should not rely on Gemini as the main live scraper. The faster long-term direction is a structured job-data pipeline:

1. Fetch jobs from APIs and scraper actors.
2. Normalize all results into one shared shape.
3. Cache/store the normalized jobs.
4. Search the cached data quickly from the app.
5. Use Gemini in the background for enrichment, ranking, summaries, and category detection.

## Candidate Architecture

```text
React App
  -> /api/search-jobs
    -> Jooble API
    -> Apify actors
    -> other job APIs/scrapers
    -> cache / database
    -> dedupe / ranking
    -> Gemini enrichment in background
```

For the detailed custom scraping plan, see `docs/scraper-strategy.md`.

## Why Apify Could Help

Apify can turn job portals into structured JSON sources through reusable or custom actors. This would make providers behave more like APIs and reduce the need for slow live Gemini web searches.

Useful targets:

- Indeed
- StepStone
- Karriere.at
- Hokify
- Willhaben Jobs
- AMS
- Tirol-specific portals and employer career pages

## Gemini Role

Gemini should not block the first results screen. It should enrich already structured jobs:

- detect if the job is suitable for Quereinsteiger
- infer category and seniority
- summarize the listing
- rank by user intent
- clean noisy snippets
- detect duplicate or suspicious listings

## Caching Strategy

Live scraping every user search will stay slow and brittle. Better:

- run scrapers every 15, 30, or 60 minutes
- store results in Postgres, Supabase, Redis, Vercel KV, or similar
- search against cached data
- use live fetching only as fallback or refresh action

## Migration Plan

1. Keep the current Jooble and Gemini modes working.
2. Add a backend `/api/search-jobs` endpoint.
3. Move provider calls out of React and behind that endpoint.
4. Add one Apify actor as a test source.
5. Normalize and dedupe Jooble plus Apify results.
6. Add cache/storage.
7. Move Gemini to background enrichment instead of primary live search.
