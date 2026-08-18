# Unattended Setup

Headsign includes a feature called Unattended Setup. Unattended Setup allows you to predefine a number of configuration settings ahead of time. This is useful if you're deploying it at scale and want to pre-customize your instance of Headsign with customizations for your agency.

## Enabling Unattended Setup

To enable Unattended Setup, you'll need to set the `UNATTENDED_SETUP` environment variable to `true`, then set the various Unattended Setup options.

### Cloud platforms (Railway, Render, Fly.io)

If you deploy Headsign using Railway or another cloud platform, this should be available in the "Variables" settings for the Headsign service. This is also where you'll set the options for each Unattended Setup option.

### Docker deployment

If you deploy Headsign manually using Docker Compose, you can either set it in your Compose file as an environment variable like so:

```yaml
services:
  headsign:
    image: jasonad123/headsign:latest
    # ...
    environment:
      # ...Other environment variables
      UNATTENDED_SETUP: true
    # ...then you can set up your other UNATTENDED_X options below
```

or you can add it to a linked `.env` file.

`compose.yaml`

```yaml
services:
  # Usage: docker compose up -d
  headsign:
    image: jasonad123/headsign:latest
    # ...
    environment:
    # ...
    # Add your environment variables here or use an env_file
    env_file:
      - .env -
```

`.env`

```bash
# ... other .env items
UNATTENDED_SETUP=true
# ...then you can set up your other UNATTENDED_X options below
```

If using Docker run to deploy, follow the instructions to set `UNATTENDED_SETUP` variables in the `.env` file.

### Local

If deploying locally, set `UNATTENDED_SETUP=true` in your `.env` file.

`.env`

```bash
# ... other .env items
UNATTENDED_SETUP=true
# ...then you can set up your other UNATTENDED_X options below
```

## Unattended Setup options

The following options are available for unattended setup. You can choose to control as few or as many as you like. These options mirror the options available in the UI configuration.

### UNATTENDED_TITLE

Header title.

The default is **Nearby Routes** in the selected UI language if not set.

### UNATTENDED_LOCATION

Location in lat, lng format (40.75426683398718, -73.98672703719805).

### UNATTENDED_TIME_FORMAT

Time display format for the clock in the upper right hand corner.

Options available:

- 24-hour - `HH:mm`
- 12-hour with AM/PM `hh:mm A`
- 12-hour without AM/PM `hh:mm`

The default is **24-hour** if not set.

### UNATTENDED_LANGUAGE

Set the language of the config UI and the Transit deeplink QR code (if enabled).

Options available:

- en - English
- fr - Français (French)
- es - Español (Spanish)
- de - Deutsch (German)

The default is **English** if not set.

### UNATTENDED_MAX_DISTANCE

Maximum distance in meters to search for nearby routes.

Options available: _250, 500, 750, 1000, 1250, 1500_

The default is **500 meters** if not set.

### UNATTENDED_COLUMNS

Number of columns of departure cards to display.

Options available are:

- auto (select best number of columns based on screen width)
- 1, 2, 3, 4, 5, 6, 7, 8

The default is **auto** if not set.

#### Note for version 1.5.0 and above

Column controls are disabled by default in Vertical mode.

### UNATTENDED_THEME

Theme for background. This will also adjust the shade of green used in the header if the header colour isn't adjusted manually.

Options available: _light, dark, auto_

The default is _auto_ if not set.

### UNATTENDED_HEADER_COLOR

Hex color code for header background
Format: "#RRGGBB" (e.g., #FF5733)

If not set, the header will default to a light green if the theme is _light_ or a dark green if the theme is _dark_.

### UNATTENDED_CUSTOM_LOGO

URL or local path to your organization's logo.
The logo will be displayed alongside the "Powered by Transit" logo in the header.

#### Local file paths (experimental)

To use a local file path, you'll need to add the image to the project. This often means adding it as an asset.

If using Docker Compose, you can do this by mounting it to the static assets directory:

```yaml
services:
  headsign:
    image: jasonad123/headsign:latest
    # ...
    environment:
      # ...Other environment variables
      UNATTENDED_SETUP: true
      UNATTENDED_CUSTOM_LOGO: /assets/images/logo.png
    volumes:
      - ./path/to/your/logo.png:/app/svelte-app/static/assets/images/logo.png:ro
```

### UNATTENDED_SHOW_QR_CODE

Show a QR code that opens a Transit "deeplink".

This deeplink is in the format of `transitapp.com/deep-links?url=transit://routes?q=${latitude},${longitude}`. If riders don't have Transit installed, it will prompt them to download Transit from their smartphone platform's app store. If they do have Transit installed, it will open Transit at the set coordinates.

Options available are _true_ or _false_.

The default is **false** if not set, which disables the QR code.

### UNATTENDED_GROUP_ITINERARIES (v1.3.0 or greater)

Group departures/destinations that serve the same parent station on a single card.

Options available are _true_ or _false_, which leaves departures ungrouped.

The default is **false** if not set.

#### Note for version 1.5.0 and above

Stop grouping/grouped itineraries are enabled by default in the Board mode and Vertical mode.

### UNATTENDED_FILTER_TERMINUS (v1.3.0 or greater)

When located at or near a terminus station, filter out redundant destination entries. For example, if you're already at "Waterfront Station", the display won't show "North to Waterfront" since you're already there.

Options available are _true_ or _false_.

The default is **false** if not set, which leaves termini unfiltered.

### UNATTENDED_SHOW_ROUTE_NAMES (v1.3.1 or greater)

For certain lines/routes that only use an icon as their identifier, show a text-based route name next to the icon. This is similar to the "Show line colours" feature available in Transit under 'Accessibility'.

Enabled (`UNATTENDED_SHOW_ROUTE_NAMES=true`)

<img width="720" height="110" alt="show_route_names_enabled" src="https://github.com/user-attachments/assets/0438ac94-ae3c-48de-8a3b-02e19e20fbed" />

Disabled (`UNATTENDED_SHOW_ROUTE_NAMES=false` or `UNATTENDED_SHOW_ROUTE_NAMES=`)

<img width="720" height="110" alt="show_route_names_disabled" src="https://github.com/user-attachments/assets/716f81c9-3dd2-4b3c-94e5-a32c9a226da4" />

Options available are _true_ or _false_.

The default is **false** if not set, which will not show the route name.
