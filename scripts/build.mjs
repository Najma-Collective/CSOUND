#!/usr/bin/env node
import { build } from "esbuild";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

async function ensureCleanDist() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
}

function resolveEnvironment() {
  const environment =
    process.env.CSOUND_ENVIRONMENT ?? process.env.NODE_ENV ?? "staging";
  const normalized = environment.toLowerCase();
  if (normalized !== "staging" && normalized !== "production") {
    return "staging";
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
    console.error(`[build] Missing entry point: ${entryPoint}`);
    process.exitCode = 1;
    return;
  }

  await ensureCleanDist();

  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    splitting: true,
    sourcemap: true,
    minify: isProduction,
    target: ["es2020"],
    outdir: distDir,
    treeShaking: true,
    metafile: true,
    logLevel: "info",
    define: {
      "process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development"),
      "import.meta.env.CSOUND_ENVIRONMENT": JSON.stringify(environment),
      "import.meta.env.CSOUND_TELEMETRY_ENDPOINT": JSON.stringify(telemetryEndpoint),
      "import.meta.env.CSOUND_TELEMETRY_SAMPLE_RATE": JSON.stringify(telemetrySampleRate),
    },
  });

  await fs.writeFile(
    path.join(distDir, "meta.json"),
    JSON.stringify(result.metafile, null, 2),
    "utf8",
  );

  console.log(`[build] Completed for ${environment} environment → ${distDir}`);
}

run().catch((error) => {
  console.error("[build] Failed to bundle application", error);
  process.exitCode = 1;
});
