# Job Search Pipeline Notes

## Goal

TirolNeustart combines structured job sources with GPT-6 Luna web search for fresh listings:

1. Fetch current results from the configured job portals.
2. Normalize and deduplicate the listings.
3. Combine direct portal results with GPT-6 Luna web-search results in the default search mode.
4. Return results to the app; no persistent job cache is configured yet.
5. Use the separate fast mode to combine portal results with Jooble when a key is configured.

## Candidate Architecture

```text
React App
  -> /api/ai-search (default)
    -> GPT-6 Luna web search
    -> direct portal adapters
    -> dedupe / ranking
  -> /api/search-jobs (fast mode)
    -> Jooble API
    -> direct portal adapters
    -> dedupe / ranking
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

GPT-6 Luna is called through the server-side Vercel route alongside direct portal adapters and should:

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

1. Keep the scraper/Jooble search path available for fast results.
2. Keep GPT-6 Luna behind `/api/ai-search` with `OPENAI_API_KEY` stored in Vercel; the default mode also fetches portal results.
3. Move any future provider credentials out of React and behind server routes.
4. Add more structured job sources as needed.
5. Normalize and dedupe results across sources.
6. Add cache/storage when live requests become a bottleneck.
