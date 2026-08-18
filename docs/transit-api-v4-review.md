# Transit API v4 Review: Workarounds vs. New Capabilities

**Date:** 2026-08-18
**Spec reviewed:** Transit API (Stable) v4.0.0 (OpenAPI spec supplied by user, not committed to this repo)
**Scope:** Static review only. This session had no Transit API key / live network access to `external.transitapp.com`, so nothing here has been verified against a real response. Every recommendation below needs to be validated live before being merged.

## Summary

Headsign makes exactly **one** live call to the Transit App API today: `GET https://external.transitapp.com/v4/public/nearby_routes` from `server/api/routes/routes.controller.js` (`exports.nearby`, ~lines 268–281). Every other piece of Transit-related code in the repo is compensating logic layered around that single response:

- A full **v4 → v3 response reshape** (the app's frontend types and logic still assume the older, flatter v3 shape).
- A **hand-rolled distance re-filter**, because a code comment asserts v4's `max_distance` isn't honored server-side.
- Several **client-side heuristics** in the SvelteKit frontend that merge, split, filter, and group itineraries/stops in ways the API doesn't do natively (or didn't, as of whenever this code was written).

The current v4 spec adds a few query parameters that look like they were built to solve exactly some of these problems — most notably `merge_platform_stops`. This document maps each workaround to what the spec now offers, and flags what can be tried immediately vs. what needs a live key to confirm vs. what would require a bigger architectural change.

## Current integration inventory

| What | Where | Notes |
|---|---|---|
| `nearby_routes` v4 call | `server/api/routes/routes.controller.js:270-280` | Only live Transit endpoint called anywhere in the codebase. Params sent today: `lat`, `lon`, `max_distance`, `max_num_departures=6`. Auth via `apiKey` header, reading `process.env.TRANSIT_API_KEY` directly (bypasses `config.transitApiKey` defined in `server/config/environment/index.js:201` — minor inconsistency, not urgent). |
| Transit icon CDN | `server/api/image/image.controller.js:34` | `https://transitapp-data.com/images/svgx/...` — a *different* host, not part of the `/v4/public/*` API surface in the supplied spec. Out of scope for this review; see note in Findings. |
| No other endpoints called | — | Grepped the whole repo: `nearby_stops`, `stop_departures`, `plan`, `estimate_plan_duration`, `search_stops`, `route_details`, etc. are not called anywhere. |

No `TRANSIT_API_BASE_URL` env var exists; the v4 base URL is hardcoded at `routes.controller.js:271`.

## Findings

| # | Workaround | Location | Compensates for | Relevant v4 capability | Verdict |
|---|---|---|---|---|---|
| 1 | `transformV4ToV3Format()` | `routes.controller.js:27-93` | v4's `nearby_routes` nests itineraries inside `merged_itineraries` (with `schedule_items` linked only via `internal_itinerary_id`); the rest of the app is written against the flatter v3 shape (`route.itineraries[].schedule_items[]`, `closest_stop` on each itinerary). | None — this is an architectural choice (never migrating the data model), not something a query param changes. | **Not fixable via API params.** This is *why* most of the other workarounds exist. Leave as-is unless/until there's appetite for a data-model migration off v3 shape entirely. |
| 2 | Client-side `max_distance` re-filter (`haversine()` + filter) | `routes.controller.js:6-25`, `324-343` | Code comment: *"Transit API v4 doesn't properly filter by max_distance, so we do it here."* | `max_distance` param still documented the same way in the v4 spec (integer meters, default 150, max 1500) — spec text doesn't confirm either way whether the enforcement bug is fixed. | **Needs live testing.** Re-run a `nearby_routes` call with a known lat/lon and a tight `max_distance`, and check whether any returned route's `closest_stop` falls outside that radius. If it no longer does, this ~20-line workaround (and the duplicated `haversine()` at line 6) can be deleted. |
| 3 | `mergeProximateStopGroups()` (client) | `svelte-app/src/lib/utils/sortingUtils.ts:29-112` | Some agencies don't set a shared `parent_station_global_stop_id` for physically co-located platforms/bays, so stops that should visually merge don't. Code merges stop groups sharing the same name within 50m (Haversine again, `sortingUtils.ts:15-23`). Used by `VerticalView.svelte:189` and `ListView.svelte:183`. | **`merge_platform_stops`** query param — new in this spec, on both `/v4/public/nearby_routes` and `/v4/public/stop_departures`: *"When true, platform stops of the same station are merged into a single merged itinerary per direction. When false (default), each platform stop gets its own merged itinerary."* This looks purpose-built for exactly this problem. | **Promising, additive, low-risk — try first.** Add `merge_platform_stops=true` to the `nearby_routes` URL in `routes.controller.js` (~line 271). Because `mergeProximateStopGroups()` is idempotent on already-merged data (merging an already-single group is a no-op), it's safe to add the param *and* leave the client fallback in place initially — then, with live data, check whether the fallback ever still fires. If it never does across a range of agencies/feeds, simplify it away. |
| 4 | `groupItinerariesByStop()` (client) | `svelte-app/src/lib/components/RouteItem.svelte:939-980` | Same general problem as #3 — groups itineraries by `parent_station_global_stop_id`/`global_stop_id` for the "group destinations with shared stop names" display option (`UNATTENDED_GROUP_ITINERARIES` / `groupItinerariesByStop` config). | Same `merge_platform_stops` param as #3. | Same verdict as #3 — this is a *display* toggle (user-controlled), not automatically equivalent to the server merging platforms, so keep this function regardless; just re-verify its behavior once #3 is tested live. |
| 5 | `isRedundantTerminus()` (client) | `svelte-app/src/lib/services/nearby.ts:187-199`, used in `applyFilters()` (`nearby.ts:201-237`) | No field in the API response says "this itinerary terminates at the stop you're standing at," so the code string-matches the merged headsign against the stop name via regex (gated by `filterRedundantTerminus` / `UNATTENDED_FILTER_TERMINUS`). | **`exclude_terminal_arrivals`** — new in this spec, but **only on `/v4/public/stop_departures`**, not on `/v4/public/nearby_routes` (confirmed: only one occurrence of this param name in the whole spec, under `stop_departures`). Description: *"schedule items where the queried stop is the final stop of the trip are removed... riders cannot ride toward the itinerary headsign."* This is exactly the concept `isRedundantTerminus` is trying to approximate with string matching. | **Not fixable in place.** The app would need to call `stop_departures` (per-stop) instead of, or in addition to, `nearby_routes` (per-area) to use this param — a real endpoint-shape change, not a one-line tweak. Flag as a candidate for a dedicated future effort (see Recommended Next Steps), not part of this pass. |
| 6 | `mergeItineraries()` (client) | `svelte-app/src/lib/utils/itineraryUtils.ts:153-201` | v4 sometimes splits itineraries by variant/branch that the UI wants shown as one destination card (same `direction_id` + `merged_headsign`, e.g. two physical routes both terminating at "Ashburn"). | No corresponding query param found. This looks inherent to how GTFS branches/variants are modeled by the underlying feed, not a toggle. | **Unrelated to this spec version.** Keep as-is. |
| 7 | `demergeItineraries()` (client) — **dead code** | `svelte-app/src/lib/utils/itineraryUtils.ts:45-119` | Opposite problem from #6: splits itineraries back apart using a "variant ID" parsed out of `trip_search_key` (3rd colon-separated segment), for cases where v4 *over*-merges branches that should be separate cards (comment cites the DC Silver Line: Largo vs. New Carrollton). | N/A — this function is exported but **not called anywhere else in the codebase** (confirmed by grep). | **Not an API-version question — flag as a separate product decision.** Either this was a real fix that stopped being wired up (a regression worth investigating — git log shows it landed alongside the v4 migration in PR #58, "heading demerge") or it was abandoned in favor of `mergeItineraries()`. Worth a decision independent of anything in this spec: reinstate it, or delete it as dead code. |
| 8 | Icon SVG recoloring via string replace, plus `routeOverrides.ts` hardcoded tables | `server/api/image/image.controller.js:32-34,60-67`; `svelte-app/src/lib/constants/routeOverrides.ts` | Transit's static icon CDN (`transitapp-data.com`) only serves two fixed-palette colors (`#010101`/`#FEFEFE`); no dynamic-color param exists there. | N/A — this CDN isn't part of the `/v4/public/*` surface described in the supplied spec at all. | **Out of scope for this review.** Not addressed by anything in api1.json. |
| 9 | Duplicated Haversine (client + server), dual real-time-detection heuristics (`hasRealTimeData` in both `routes.controller.js:108-140` and `svelte-app/src/lib/utils/apiCache.ts`), in-memory server cache + in-flight de-dup (`routes.controller.js:142-266`) | multiple | Downstream consequences of #2 (distance filtering) and of the API not exposing a single "is this response real-time" flag, plus mitigating Transit's free-tier rate limits (5 calls/min). | None directly — not workarounds for a missing v4 feature, just engineering built around v4's shape/limits. | **No action from this review.** |

## Recommended next steps (for a session with a live API key)

Ordered by expected value / lowest risk first:

1. **Test `merge_platform_stops=true` on `nearby_routes`.** Add it to the request URL in `routes.controller.js:271`. Confirm `transformV4ToV3Format()` still works unchanged (it iterates `merged_itineraries` generically, so it should), then compare output with/without the flag at a station known to have multiple platforms/bays without a shared parent station.
2. **With that live data, check whether `mergeProximateStopGroups()` (`sortingUtils.ts`) and `groupItinerariesByStop()` (`RouteItem.svelte`) still need to do anything**, or whether `merge_platform_stops` now covers those cases. Test across more than one agency/feed before deciding to simplify — GTFS data quality varies a lot by agency.
3. **Re-test the `max_distance` behavior.** Send a `nearby_routes` request with a small `max_distance` at a location with known stops both inside and outside that radius. If it's honored now, delete the client-side re-filter and the duplicated `haversine()` in `routes.controller.js`.
4. **Decide on `demergeItineraries()`** — reinstate it (and figure out where it should be called, likely alongside `mergeItineraries()` in `nearby.ts`) or delete it as dead code. This doesn't depend on live API access, just a product call.
5. **Scope (separately, not as a quick fix) whether to add `stop_departures` as a second endpoint** to get `exclude_terminal_arrivals`, replacing the `isRedundantTerminus()` string-matching heuristic. This is a bigger change — `nearby_routes` returns routes-near-a-point in one call, while `stop_departures` needs specific `global_stop_id`s (which would first need `nearby_stops`), so it's a two-call architecture change, not a drop-in replacement.

## Appendix: v4 endpoints/params relevant to this app

Pulled from the supplied spec so a future session doesn't need to re-read the whole file.

### `/v4/public/nearby_routes` (currently used)
Params sent today: `lat`, `lon`, `max_distance`, `max_num_departures`.
Available but unused: `locale`, `Accept-Language`, `should_update_realtime` (default `true`), `merge_platform_stops` (default `false`), `time`, `include_stops_and_shapes` (default `false`), `stop_detailed` (default `false`).

### `/v4/public/stop_departures` (not currently used)
Requires `global_stop_ids` (comma-separated, max 100). Notable params not available on `nearby_routes`: **`exclude_terminal_arrivals`** (default `false`), `remove_cancelled` (default `false`). Also has `merge_platform_stops`, `max_num_departures`, `stop_detailed`, `should_update_realtime`, same as `nearby_routes`.

### `/v4/public/nearby_stops` (not currently used)
Would be the first call needed if migrating toward `stop_departures`. Has `stop_filter` (Routable / EntrancesAndStopsOutsideStations / Entrances / Any), `stop_detailed`, `include_beta_feeds`.

### Key parameter reference
- **`merge_platform_stops`** (boolean, default `false`, on `nearby_routes` and `stop_departures`): merges platform stops of the same station into one merged itinerary per direction.
- **`exclude_terminal_arrivals`** (boolean, default `false`, on `stop_departures` only): drops schedule items where the queried stop is the final stop of the trip.
- **`remove_cancelled`** (boolean, default `false`, on `stop_departures` only): drops cancelled schedule items server-side. Not currently relevant — Headsign intentionally displays cancelled departures with a strikethrough style (`is_cancelled` class in `VerticalView.svelte`/`ListView.svelte`) rather than hiding them.
- **`stop_detailed`** (boolean, default `false`): returns `StopDetailed` instead of `Stop` objects (adds timezone, network info, TTS name, bike boarding). Not currently used; could reduce need for any future stop-metadata lookups but no current workaround depends on it.
- **`include_stops_and_shapes`** (boolean, default `false`): controls whether shape polylines/stop lists are included in itineraries, to reduce response size. Not currently sent (so already defaulting to the smaller response).
