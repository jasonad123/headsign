# Crowding indicators

Headsign can show vehicle occupancy icons on real-time departures.

## Requirements

- A Transit API key with access to the v4 API. Current keys are prefixed `transit_publicapi_v4_`. Keys in the older format may not have access to the vehicles endpoint.
- A transit agency that publishes occupancy data. Support varies by agency and route; where no data is available, no icon is shown.

## Enabling

Turn on **Show crowding indicators** in the configuration modal.

## How it works

For routes with real-time departures, Headsign polls Transit's `GET /v4/vehicles` endpoint and matches each vehicle's `occupancy_status` to departures by `rt_trip_id`. Results are cached server-side for 30 seconds.

| Status | Meaning       |
| ------ | ------------- |
| 1      | Not crowded   |
| 2      | Some crowding |
| 3      | Crowded       |

## Local testing

Set `VITE_MOCK_CROWDING=true` in a development build to generate placeholder occupancy data. The setting is ignored in production builds.
