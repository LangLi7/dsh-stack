---
name: deep-research
description: Deep multi-source web research — search broadly, read the sources, and synthesize a cited report. Use for comprehensive research tasks that need many sources and a written synthesis with citations, rather than one quick search.
whenToUse: When the task requires thorough, multi-source research and a synthesized, cited answer — multiple subtopics, competing claims, or a report deliverable — instead of a single quick search.
---

# Deep Research

You have web-search and web-scraping tools (the harness `web_search`, plus Firecrawl
`mcp__firecrawl__firecrawl_search`, `firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`).
Produce a thorough, **cited** synthesis rather than a list of links.

## Process

1. **Break down the question** into 2–4 sub-questions and list the source types you expect
   (docs, repos, forums, papers, news). Write the concrete questions before searching.

2. **Search broadly and redundantly.** Issue several calls with rephrased queries:
   - `web_search` with 3–4 related queries.
   - `firecrawl_search` with different phrasings, `includeDomains`/`excludeDomains` as useful.
   - For a known site: `firecrawl_map` to enumerate relevant pages, then scrape them.
   Search until you have **15–25 distinct, relevant sources**; remove exact-duplicate URLs.

3. **Read the important sources.** `firecrawl_scrape` the pages that carry the substance
   (`formats: ["markdown"]`); for structured facts use `firecrawl_scrape` with `jsonOptions`
   and a schema. Take notes per source, recording the author/title/date when present.

4. **Cross-check.** Compare claims across sources; flag contradictions, recency concerns, and
   anything only one source supports. Distinguish well-sourced facts from inference.

5. **Write the cited report.** Structure it with a short answer up front, then sections per
   sub-question. Every claim gets an inline citation as a markdown link to the source URL.
   Finish with: a bulleted source list, a short "limitations / uncertainty" note, and a
   "how to go deeper" line. Be explicit about what you could not confirm.

## Rules

- Cite the **source URL**, not a bare phrase. Prefer primary sources (official docs, repos, specs).
- If you cannot verify something, say so — never invent a citation.
- Respect source volume: prefer depth on the strongest sources over link-dropping.
- If a search returns nothing useful, rephrase rather than stopping.
