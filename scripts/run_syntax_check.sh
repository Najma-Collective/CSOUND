#!/usr/bin/env bash
set -euo pipefail

CSD_FILE="${1:-nala_sinephro_ambient.csd}"
LOG_DIR="logs"
mkdir -p "$LOG_DIR"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_PATH="$LOG_DIR/syntax_check_${TIMESTAMP}.log"

{
  echo "[syntax-check] $(date -Iseconds)"
  echo "Checking syntax for: $CSD_FILE"
  echo "Command: csound -c \"$CSD_FILE\""
  echo "------------------------------------------------------------"
  csound -c "$CSD_FILE"
} 2>&1 | tee "$LOG_PATH"

exit "${PIPESTATUS[0]}"
