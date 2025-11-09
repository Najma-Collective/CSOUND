# CSOUND

CSOUND is a WebGL experience built with TypeScript and bundled via [esbuild](https://esbuild.github.io/). This repository contains the core runtime, build tooling, and deployment scripts.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [npm](https://www.npmjs.com/) 9 or newer

> **Tip:** Use a version manager such as [`nvm`](https://github.com/nvm-sh/nvm) to keep Node.js up to date.

## Installation

Install dependencies after cloning the repository:

```bash
npm install
```

This will pull down the client runtime, TypeScript tooling, and deployment helpers.

## Development workflow

Start the local development server with hot rebuilds:

```bash
npm run dev
```

The script wraps esbuild in watch mode and serves the generated assets from `dist/`. By default it listens on [http://localhost:5173](http://localhost:5173). Override the port by setting `PORT` or `DEV_SERVER_PORT` before running the command.

Source changes to files under `src/` trigger incremental rebuilds that immediately update the served bundle.

## Build for production

Create an optimized build by running:

```bash
npm run build
```

The build output is written to `dist/` and includes sourcemaps and environment-specific constants.

## Deploy

The project ships with a Netlify deployment helper:

```bash
npm run deploy [staging|production] [--dry-run]
```

- The first argument selects the target environment (defaults to `staging`).
- Pass `--dry-run` to exercise the build without publishing to Netlify.

Behind the scenes the script installs dependencies, runs the production build, optimizes assets, and invokes the Netlify CLI with the credentials you supply.

## Environment variables

The application reads the following environment variables during development, build, and deployment:

| Variable | Description |
| --- | --- |
| `CSOUND_ENVIRONMENT` | Overrides the target environment (`development`, `staging`, or `production`). Defaults to `development` for `npm run dev` and `staging` for `npm run build`. |
| `CSOUND_TELEMETRY_ENDPOINT` | Endpoint that receives telemetry events. Required in production. |
| `CSOUND_TELEMETRY_SAMPLE_RATE` | Floating point value between `0` and `1` representing the probability of recording telemetry. |
| `NETLIFY_SITE_ID` | Netlify site identifier used by `npm run deploy`. |
| `NETLIFY_AUTH_TOKEN` | Netlify access token used by `npm run deploy`. |
| `NETLIFY_DEPLOY_ALIAS` | Optional alias for staging deployments. |
| `PORT` / `DEV_SERVER_PORT` | Port override for the `npm run dev` server. |

Consider creating a `.env` file or using your shell profile to export these values during development.

## Additional scripts

- `npm run optimize:assets` – Post-processes assets after a production build.
- `npm test` – Runs the Vitest suite.

Refer to [`docs/`](docs/) for design documents, release plans, and additional context.
