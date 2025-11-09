#!/usr/bin/env node
import { context } from "esbuild";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { writeIndexHtml } from "./utils/write-index-html.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

async function ensureDistDir() {
  await fs.mkdir(distDir, { recursive: true });
}

function resolveEnvironment() {
  const environment =
    process.env.CSOUND_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
  const normalized = environment.toLowerCase();
  if (normalized !== "development" && normalized !== "staging" && normalized !== "production") {
    return "development";
  }
  return normalized;
}

function resolveTelemetrySampleRate() {
  const raw = process.env.CSOUND_TELEMETRY_SAMPLE_RATE;
  if (!raw) return 1;
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(value, 0), 1);
}

async function run() {
  const environment = resolveEnvironment();
  const isProduction = environment === "production";
  const telemetryEndpoint = process.env.CSOUND_TELEMETRY_ENDPOINT ?? "";
  const telemetrySampleRate = resolveTelemetrySampleRate();

  const entryPoint = path.join(rootDir, "src", "index.ts");
  try {
    await fs.access(entryPoint);
  } catch (error) {
    console.error(`[dev] Missing entry point: ${entryPoint}`);
    process.exitCode = 1;
    return;
  }

  await ensureDistDir();
  await writeIndexHtml(distDir);

  const requestedPort = Number.parseInt(
    process.env.PORT ?? process.env.DEV_SERVER_PORT ?? "5173",
    10,
  );
  const port = Number.isNaN(requestedPort) ? 5173 : requestedPort;

  const ctx = await context({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    splitting: true,
    sourcemap: true,
    minify: isProduction,
    target: ["es2020"],
    outdir: distDir,
    treeShaking: true,
    logLevel: "info",
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        isProduction ? "production" : "development",
      ),
      "import.meta.env.CSOUND_ENVIRONMENT": JSON.stringify(environment),
      "import.meta.env.CSOUND_TELEMETRY_ENDPOINT": JSON.stringify(
        telemetryEndpoint,
      ),
      "import.meta.env.CSOUND_TELEMETRY_SAMPLE_RATE": JSON.stringify(
        telemetrySampleRate,
      ),
    },
    plugins: [
      {
        name: "dev-logger",
        setup(build) {
          build.onStart(() => {
            console.log("[dev] Rebuilding...");
          });
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error(
                `[dev] Build finished with ${result.errors.length} error(s).`,
              );
            } else {
              console.log(
                `[dev] Build completed with ${result.warnings.length} warning(s).`,
              );
            }
          });
        },
      },
    ],
  });

  await ctx.watch();

  const server = await ctx.serve({
    servedir: distDir,
    host: "0.0.0.0",
    port,
  });

  const url = `http://${server.host}:${server.port}`;
  console.log(`[dev] Watching source files and serving at ${url}`);
  console.log("[dev] Press Ctrl+C to stop.");

  const shutdown = async () => {
    console.log("\n[dev] Shutting down...");
    await ctx.dispose();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

run().catch((error) => {
  console.error("[dev] Failed to start development server", error);
  process.exitCode = 1;
});
