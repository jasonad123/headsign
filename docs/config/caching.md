# Caching

Headsign implements a multi-stage caching system to reduce unnecessary calls to the Transit API while still relatively fresh real-time data. The caching system relies on both server-side and client-side caching, both of which are
configurable using environment variables.

The default caching variables are pre-set to respect the Transit API's free tier restrictions (5 calls/min, 1500 calls/month), but if you are a paid API customer, you can adjust these at any time.

We also have two tiers for caching - one for real-time transit data (which _should_ get updated regularly), and another for static transit data (which should get updated but not as regularly).

## Configuration

As a reminder: a shorter TTL means fresher departure times but more API calls.

### Client-side cache

All client-side caching variables are prefixed with `VITE_`. These control how long the browser caches API responses.

#### VITE_REALTIME_CACHE_TTL

Cache duration for real-time prediction data (milliseconds).

For free tier (5 calls/min): 5000ms recommended

For paid tier (60+ calls/min): 3000ms for maximum freshness

Default value: `VITE_REALTIME_CACHE_TTL=5000`

#### VITE_STATIC_CACHE_TTL

Cache duration for schedule-only data (milliseconds).
Longer TTL for static schedules reduces API load when no real-time data available.

Recommended: 120000ms (2 minutes) for all tiers

Default value: `VITE_STATIC_CACHE_TTL=120000`

### VITE_CLIENT_POLLING_INTERVAL

How often to poll for updates (milliseconds).
This variable should be slightly higher than REALTIME_CACHE_TTL to ensure fresh fetches.

For free tier (5 calls/min): 10000ms recommended (~10-15s actual delay vs Transit app)

For paid tier (60+ calls/min): 5000-7000ms for maximum freshness (~5-10s delay)

Default value: `VITE_CLIENT_POLLING_INTERVAL=10000`

### Server-side cache

Server-side request caching ensures that repeated requests made to the backend from within the same/similar locations get cached. We recommend enabling server-side cache if you have multiple displays in a single location.
To enable server-side caching, make sure to set `ENABLE_SERVER_CACHE=true` in your environment variables. This enables all server-side caching.

### REALTIME_CACHE_TTL

Server cache duration for real-time predictions (milliseconds).
This value should match or be slightly lower than the client `REALTIME_CACHE_TTL`

Default value: `REALTIME_CACHE_TTL=3000`

#### STATIC_CACHE_TTL

Server cache duration for schedule data (milliseconds).
A longer TTL reduces upstream API calls for schedule-only locations

Default value: `STATIC_CACHE_TTL=120000`
