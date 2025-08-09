#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
README="$ROOT_DIR/README.MD"
OUT_DIR="$ROOT_DIR/downloads/CAR"
mkdir -p "$OUT_DIR"

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
REFERER="https://www.aviation.govt.nz/rules/rule-part/"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$TMP_URLS_FILE"' EXIT

echo "Reading URLs from: $README"

TMP_URLS_FILE=$(mktemp)
REPORT="$OUT_DIR/report.csv"

# Extract CAR consolidation PDF URLs from README (portable)
grep -Eo 'https://www\.aviation\.govt\.nz/assets/rules/consolidations/Part_[0-9]{3}_Consolidation\.pdf' "$README" | sort -u > "$TMP_URLS_FILE"

if ! [ -s "$TMP_URLS_FILE" ]; then
  echo "No CAR consolidation URLs found in README.MD" >&2
  exit 1
fi

total_urls=$(wc -l < "$TMP_URLS_FILE" | tr -d ' ')
printf "Found %d URLs\n" "$total_urls"

# Warm up session to obtain cookies
curl -sSLA "$UA" -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$REFERER" -o /dev/null || true

success_count=0
fail_count=0

# Initialize report
echo "part,url,status,mime,size,output_path" > "$REPORT"

while IFS= read -r url; do
  file_name="${url##*/}"            # Part_XXX_Consolidation.pdf
  part_code="${file_name#Part_}"     # XXX_Consolidation.pdf
  part_code="${part_code%%_*}"       # XXX
  part_dir="$OUT_DIR/Part_$part_code"

  mkdir -p "$part_dir"

  tmp_file="$part_dir/$file_name.tmp"

  # Attempt 1: download with UA, cookies, referer
  curl -sSL --compressed -A "$UA" -e "$REFERER" -b "$COOKIE_JAR" -c "$COOKIE_JAR" -o "$tmp_file" "$url" || true

  mime=$(file -b --mime-type "$tmp_file" 2>/dev/null || echo unknown)
  size=$(stat -f%z "$tmp_file" 2>/dev/null || echo 0)

  # If not a PDF, attempt a second try with explicit Accept header
  if [[ "$mime" != "application/pdf" || "$size" -lt 10240 ]]; then
    curl -sSL --compressed -A "$UA" -e "$REFERER" -H 'Accept: application/pdf' -b "$COOKIE_JAR" -c "$COOKIE_JAR" -o "$tmp_file" "$url" || true
    mime=$(file -b --mime-type "$tmp_file" 2>/dev/null || echo unknown)
    size=$(stat -f%z "$tmp_file" 2>/dev/null || echo 0)
  fi

  if [[ "$mime" == "application/pdf" && "$size" -ge 10240 ]]; then
    mv -f "$tmp_file" "$part_dir/$file_name"
    echo "[OK]   $url -> Saved: $part_dir/$file_name ($size bytes)"
    echo "$part_code,$url,ok,$mime,$size,$part_dir/$file_name" >> "$REPORT"
    ((success_count++))
  else
    echo "[FAIL] $url -> mime=$mime size=$size"
    rm -f "$tmp_file"
    echo "$part_code,$url,fail,$mime,$size," >> "$REPORT"
    ((fail_count++))
  fi
done < "$TMP_URLS_FILE"

echo
echo "Summary: $success_count succeeded, $fail_count failed"
echo "Output directory: $OUT_DIR"


