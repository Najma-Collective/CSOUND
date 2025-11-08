#!/usr/bin/env bash
set -euo pipefail

CSD_FILE="${1:-nala_sinephro_ambient.csd}"
OUTPUT_PATH="${2:-build/output.wav}"
LOG_DIR="logs"
BUILD_DIR="$(dirname "$OUTPUT_PATH")"
mkdir -p "$LOG_DIR" "$BUILD_DIR"

TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_PATH="$LOG_DIR/render_${TIMESTAMP}.log"

EXPECTED_SR="${EXPECTED_SR:-48000}"
EXPECTED_CHANNELS="${EXPECTED_CHANNELS:-2}"
EXPECTED_DURATION="${EXPECTED_DURATION:-60}"
DURATION_TOLERANCE="${DURATION_TOLERANCE:-2.0}"
PEAK_LIMIT="${PEAK_LIMIT:-0.8}"
PEAK_TOLERANCE="${PEAK_TOLERANCE:-0.05}"

{
  echo "[render] $(date -Iseconds)"
  echo "Rendering $CSD_FILE"
  echo "Output file: $OUTPUT_PATH"
  echo "Command: csound -d -o \"$OUTPUT_PATH\" \"$CSD_FILE\""
  echo "------------------------------------------------------------"
  csound -d -o "$OUTPUT_PATH" "$CSD_FILE"
  echo "------------------------------------------------------------"
  echo "Validating rendered audio"
  python3 - "$OUTPUT_PATH" "$EXPECTED_SR" "$EXPECTED_CHANNELS" "$EXPECTED_DURATION" \
          "$DURATION_TOLERANCE" "$PEAK_LIMIT" "$PEAK_TOLERANCE" <<'PY'
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

import audioop
import math
import sys
import wave

path, expected_sr, expected_channels, expected_duration, duration_tol, peak_limit, peak_tol = sys.argv[1:8]
expected_sr = int(expected_sr)
expected_channels = int(expected_channels)
expected_duration = float(expected_duration)
duration_tol = float(duration_tol)
peak_limit = float(peak_limit)
peak_tol = float(peak_tol)

with wave.open(path, "rb") as wf:
    sr = wf.getframerate()
    channels = wf.getnchannels()
    frames = wf.getnframes()
    sampwidth = wf.getsampwidth()
    duration = frames / sr if sr else 0
    audio = wf.readframes(frames)

max_map = {1: 127, 2: 32767, 3: 8388607, 4: 2147483647}
if sampwidth not in max_map:
    raise SystemExit(f"Unsupported sample width: {sampwidth}")
max_possible = max_map[sampwidth]
peak = audioop.max(audio, sampwidth) if audio else 0
peak_ratio = peak / max_possible if max_possible else 0
peak_dbfs = 20 * math.log10(max(peak_ratio, 1e-12))

print("Audio metadata:")
print(f"  Sample rate     : {sr} Hz")
print(f"  Channels        : {channels}")
print(f"  Sample width    : {sampwidth * 8} bits")
print(f"  Frame count     : {frames}")
print(f"  Duration        : {duration:.3f} s")
print(f"  Peak amplitude  : {peak_ratio:.4f} ( {peak_dbfs:.2f} dBFS )")

issues = []
if sr != expected_sr:
    issues.append(f"Sample rate mismatch (expected {expected_sr}, found {sr})")
if channels != expected_channels:
    issues.append(f"Channel count mismatch (expected {expected_channels}, found {channels})")
if abs(duration - expected_duration) > duration_tol:
    issues.append(
        f"Duration {duration:.3f}s outside tolerance ±{duration_tol}s of expected {expected_duration}s"
    )
limit = peak_limit + peak_tol
if peak_ratio > limit:
    issues.append(
        f"Peak amplitude {peak_ratio:.4f} exceeds limit {limit:.4f} (limit={peak_limit} ± {peak_tol})"
    )

if issues:
    print("Validation FAILED:")
    for item in issues:
        print(f"  - {item}")
    sys.exit(1)

print("Validation PASSED with all checks inside expected bounds.")
PY
  echo
} 2>&1 | tee "$LOG_PATH"

exit "${PIPESTATUS[0]}"
