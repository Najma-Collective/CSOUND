#!/usr/bin/env node
import { createReadStream, createWriteStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import {
  constants as zlibConstants,
  createBrotliCompress,
  createGzip,
} from "zlib";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const compressibleExtensions = new Set([".js", ".css", ".html", ".json", ".svg", ".txt", ".wasm"]);

async function* walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function compressFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!compressibleExtensions.has(extension)) {
    return;
  }

  const brotliTarget = `${filePath}.br`;
  const gzipTarget = `${filePath}.gz`;

  const sourceStat = await fs.stat(filePath);
  if (sourceStat.size === 0) {
    return;
  }

  await Promise.all([
    pipeline(
      createReadStream(filePath),
      createBrotliCompress({
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        },
      }),
      createWriteStream(brotliTarget),
    ),
    pipeline(
      createReadStream(filePath),
      createGzip({ level: zlibConstants.Z_BEST_COMPRESSION }),
      createWriteStream(gzipTarget),
    ),
  ]);
}

async function run() {
  try {
    await fs.access(distDir);
  } catch (error) {
    console.warn(`[optimize] Dist directory not found at ${distDir}. Did you run the build?`);
    return;
  }

  const files = [];
  for await (const file of walk(distDir)) {
    files.push(file);
  }

  await Promise.all(files.map((file) => compressFile(file)));
  console.log(`[optimize] Generated Brotli & gzip assets for ${files.length} files.`);
}

run().catch((error) => {
  console.error("[optimize] Failed to optimize assets", error);
  process.exitCode = 1;
});
