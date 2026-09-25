# Job Search Pipeline Notes

## Goal

TirolNeustart combines structured job sources with a separate AI search path for fresh listings:

1. Fetch jobs from APIs and scraper actors.
2. Normalize all results into one shared shape.
3. Cache/store the normalized jobs.
4. Search the cached data quickly from the app.
5. Use GPT-6 Luna with web search for fresh listings and summaries when AI search is selected.

## Candidate Architecture

```text
React App
  -> /api/search-jobs
    -> Jooble API
    -> Apify actors
    -> other job APIs/scrapers
    -> cache / database
    -> dedupe / ranking
    -> GPT-6 Luna web search when requested
```

For the detailed custom scraping plan, see `docs/scraper-strategy.md`.

## Why Apify Could Help

Apify can turn job portals into structured JSON sources through reusable or custom actors. This would make providers behave more like APIs and reduce the number of live web searches needed.

Useful targets:

- Indeed
- StepStone
- Karriere.at
- Hokify
- Willhaben Jobs
- AMS
- Tirol-specific portals and employer career pages

## GPT-6 Luna Role

GPT-6 Luna is called through the server-side Vercel route and should:

- search for direct, current job listings
- prioritize Connie's preferences: up to 20 hours per week, no Saturday work, Friday only until noon, and remote work preferred
- report schedule details only when supported by the listing
- avoid inventing URLs or work-hour details

## Caching Strategy

Live scraping every user search will stay slow and brittle. Better:

- run scrapers every 15, 30, or 60 minutes
- store results in Postgres, Supabase, Redis, Vercel KV, or similar
- search against cached data
- use live fetching only as fallback or refresh action

## Migration Plan

1. Keep the scraper/Jooble search path for fast results.
2. Keep GPT-6 Luna behind `/api/ai-search` with `OPENAI_API_KEY` stored in Vercel.
3. Move any future provider credentials out of React and behind server routes.
4. Add more structured job sources as needed.
5. Normalize and dedupe results across sources.
6. Add cache/storage when live requests become a bottleneck.
