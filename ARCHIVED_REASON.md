# Parked: feature/micromobility

**Status:** Parked — API verification required before merge

## What this branch adds

- **Crowding indicators** — occupancy icons on departure cards using `occupancy_status`
  from `/v4/public/vehicles?global_route_id=X`
- **Micromobility display** — bike share and scooter availability cards using the
  placemarks endpoint (`/map_layers/placemarks?lat=X&lon=Y&distance=Z`)
- i18n strings for crowding and micromobility (en, de, es, fr)
- `showMicromobility` config flag with `VITE_MOCK_CROWDING` for local testing

## Why this branch is parked

**API verification failed (2026-04-28):** Both API features were tested against a
live Transit API key and confirmed not working:

- `occupancy_status` field not returned by `/v4/public/vehicles` for any tested agency
- Placemarks endpoint behavior unconfirmed for micromobility data

The mock data support (`VITE_MOCK_CROWDING`) was added precisely because production
testing had not been completed. This branch must not be merged until real API
responses are verified.

## Resuming this work

Before reviving:
1. Deploy a test instance with a real `TRANSIT_API_KEY`
2. Confirm `/v4/public/vehicles?global_route_id=X` returns `occupancy_status` for
   at least one agency
3. Confirm `/map_layers/placemarks` returns micromobility data for at least one city
4. Remove or properly gate `VITE_MOCK_CROWDING` — do not ship mock data in production
5. Rebase this branch onto the then-current `main` (expect conflicts in server files
   after the TypeScript backend migration lands)
6. Compare with `claude/add-micromobility-v4-api-2SrsW` if it still exists; keep
   the cleaner implementation
