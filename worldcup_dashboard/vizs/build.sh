#!/usr/bin/env bash
# Build, merge, and package custom visualizations into {app_name}.
#
# Usage: ./vizs/build.sh [viz_name]
#
# With no arguments, builds and merges all vizs. Pass a name for one:
#   ./vizs/build.sh my_viz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_APP="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="$(basename "$TARGET_APP")"
PARENT_DIR="$(dirname "$TARGET_APP")"

APPS=(
    single_value_delta
    top_markets
    category_breakdown
)

if [ ! -d "$TARGET_APP/default" ]; then
    echo "ERROR: Target app not found at $TARGET_APP"
    exit 1
fi

shopt -s nullglob
BUILT=()
MERGED=0

# ── Spinner ────────────────────────────────────────────────────────────

spin() {
    local pid=$1
    local msg=$2
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r  ${frames[$i]} %s" "$msg"
        i=$(( (i + 1) % ${#frames[@]} ))
        sleep 0.08
    done
    wait "$pid" 2>/dev/null
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        printf "\r  ✓ %s\n" "$msg"
    else
        printf "\r  ✗ %s\n" "$msg"
    fi
    return $exit_code
}

run_with_spinner() {
    local msg=$1
    shift
    "$@" > /dev/null 2>&1 &
    spin $! "$msg"
}

# ── Helper: remove a conf stanza by exact name ────────────────────────

remove_stanza() {
    local file="$1"
    local stanza="$2"
    [ -f "$file" ] || return 0
    grep -qF "[$stanza]" "$file" || return 0
    awk -v s="[$stanza]" 'BEGIN{skip=0} /^\[/{skip=($0==s)?1:0} !skip{print}' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# ── Build ──────────────────────────────────────────────────────────────

build_viz() {
    local VIZ_NAME="$1"
    local SRC_APP="$SCRIPT_DIR/$VIZ_NAME"
    local SRC_VIZ="$SRC_APP/appserver/static/visualizations/$VIZ_NAME"

    if [ ! -d "$SRC_APP" ]; then
        printf "  ✗ %s (not found)\n" "$VIZ_NAME"
        return 1
    fi

    if [ ! -d "$SRC_VIZ/node_modules" ]; then
        run_with_spinner "$VIZ_NAME → npm install" bash -c "cd '$SRC_VIZ' && npm install" || return 1
    fi

    run_with_spinner "$VIZ_NAME → webpack build" bash -c "cd '$SRC_VIZ' && npm run build" || return 1

    # Prepend shared font CSS if it exists
    local FONT_CSS="$SCRIPT_DIR/shared/fonts.css"
    local VIZ_CSS="$SRC_VIZ/visualization.css"
    if [ -f "$FONT_CSS" ] && [ -f "$VIZ_CSS" ]; then
        if ! grep -q "@font-face" "$VIZ_CSS"; then
            cat "$FONT_CSS" "$VIZ_CSS" > "$VIZ_CSS.tmp"
            mv "$VIZ_CSS.tmp" "$VIZ_CSS"
        fi
    fi

    if [ ! -f "$SRC_VIZ/visualization.js" ]; then
        printf "  ✗ %s → build failed\n" "$VIZ_NAME"
        return 1
    fi

    BUILT+=("$VIZ_NAME")
    return 0
}

# ── Merge ──────────────────────────────────────────────────────────────

merge_viz() {
    local VIZ_NAME="$1"
    local SRC_APP="$SCRIPT_DIR/$VIZ_NAME"
    local SRC_VIZ="$SRC_APP/appserver/static/visualizations/$VIZ_NAME"

    # Copy visualization files
    local VIZ_DEST="$TARGET_APP/appserver/static/visualizations/$VIZ_NAME"
    mkdir -p "$VIZ_DEST"
    for f in "$SRC_VIZ"/*.{js,css,html,json,png,svg}; do
        [ -f "$f" ] || continue
        local fname
        fname=$(basename "$f")
        case "$fname" in
            package.json|package-lock.json|webpack.config.js|harness.json|preview.png) continue ;;
        esac
        cp "$f" "$VIZ_DEST/"
    done

    # Update visualizations.conf
    local VIZ_CONF="$TARGET_APP/default/visualizations.conf"
    remove_stanza "$VIZ_CONF" "$VIZ_NAME"
    { echo ""; cat "$SRC_APP/default/visualizations.conf"; } >> "$VIZ_CONF"

    # Update saved searches
    local SAVED_SEARCH_FILE="$TARGET_APP/default/savedsearches.conf"
    local SRC_SAVED="$SRC_APP/default/savedsearches.conf"
    if [ -f "$SRC_SAVED" ]; then
        while IFS= read -r line; do
            local sname="${line#[}"
            sname="${sname%]}"
            remove_stanza "$SAVED_SEARCH_FILE" "$sname"
        done < <(grep '^\[' "$SRC_SAVED")
        { echo ""; cat "$SRC_SAVED"; } >> "$SAVED_SEARCH_FILE"
    fi

    # Merge spec entries
    local SPEC_SRC="$SRC_APP/README/savedsearches.conf.spec"
    local SPEC_DEST="$TARGET_APP/README/savedsearches.conf.spec"
    if [ -f "$SPEC_SRC" ]; then
        mkdir -p "$TARGET_APP/README"
        if [ -f "$SPEC_DEST" ]; then
            # Spec lines are namespaced with the parent app id:
            # display.visualizations.custom.{app}.{viz}.{setting}
            # Match the viz name after the app segment, else old entries are
            # never removed and every rebuild appends another full copy.
            grep -v "^display\\.visualizations\\.custom\\..*\\.$VIZ_NAME\\." "$SPEC_DEST" \
                > "$SPEC_DEST.tmp" || true
            mv "$SPEC_DEST.tmp" "$SPEC_DEST"
        fi
        { echo ""; cat "$SPEC_SRC"; } >> "$SPEC_DEST"
    fi

    # Update metadata
    local META_FILE="$TARGET_APP/metadata/default.meta"
    if ! grep -q "visualizations/$VIZ_NAME" "$META_FILE"; then
        { echo ""; echo "[visualizations/$VIZ_NAME]"; echo "export = system"; } >> "$META_FILE"
    fi

    MERGED=$((MERGED + 1))
    return 0
}

# ── Run ────────────────────────────────────────────────────────────────

echo ""
echo "  worldcup_dashboard build"

# Phase 1: Build all visualizations
echo ""
echo "  Building..."
if [ $# -ge 1 ]; then
    build_viz "$1" || true
else
    for app in "${APPS[@]}"; do
        build_viz "$app" || true
    done
fi

# Phase 2: Merge all successfully built visualizations
if [ ${#BUILT[@]} -gt 0 ]; then
    echo ""
    echo "  Merging..."
    for app in "${BUILT[@]}"; do
        merge_viz "$app" > /dev/null 2>&1 && printf "  ✓ %s\n" "$app" || printf "  ✗ %s\n" "$app"
    done
fi

# Clean up conf files — collapse multiple blank lines
for f in \
    "$TARGET_APP/README/savedsearches.conf.spec" \
    "$TARGET_APP/default/savedsearches.conf" \
    "$TARGET_APP/default/visualizations.conf"; do
    if [ -f "$f" ]; then
        awk 'NF{blank=0; print; next} !blank++{print}' "$f" \
            | sed '/./,$!d' > "$f.tmp"
        mv "$f.tmp" "$f"
    fi
done

# Bump patch version (updates both [id] and [launcher] stanzas)
if [ "$MERGED" -gt 0 ]; then
    CURRENT_VERSION=$(grep '^version' "$TARGET_APP/default/app.conf" | head -1 | cut -d= -f2 | tr -d ' ')
    MAJOR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
    MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f2)
    PATCH=$(echo "$CURRENT_VERSION" | cut -d. -f3)
    NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
    sed -i '' "s/^version = .*/version = ${NEW_VERSION}/" "$TARGET_APP/default/app.conf"
    echo ""
    printf "  ✓ Version bump: %s → %s\n" "$CURRENT_VERSION" "$NEW_VERSION"
fi

# Phase 3: Package
echo ""
echo "  Packaging..."
# Strip macOS cruft that fails Splunk Cloud vetting (check_for_prohibited_files):
# clear extended attributes, then PHYSICALLY delete any AppleDouble (._*) and
# .DS_Store files. The tar --exclude='._*' pattern is anchored at the path root,
# so it misses nested files like static/._appIconAlt.png — deleting them is the
# reliable fix.
xattr -rc "$TARGET_APP" 2>/dev/null || true
find "$TARGET_APP" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true

mkdir -p "$PARENT_DIR/dist"

run_with_spinner "dist/$APP_NAME.tar.gz" bash -c "
    COPYFILE_DISABLE=1 tar --disable-copyfile --no-xattrs --no-mac-metadata \
        --exclude='.git*' \
        --exclude='.DS_Store' --exclude='*/.DS_Store' \
        --exclude='._*' --exclude='*/._*' \
        --exclude='__MACOSX' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='vizs' \
        --exclude='local' \
        --exclude='README.md' \
        --exclude='node_modules' \
        -czf '$PARENT_DIR/dist/$APP_NAME.tar.gz' \
        -C '$PARENT_DIR' \
        '$APP_NAME'
"

# Bulletproof clean-up: bsdtar can STILL emit AppleDouble (._*) members from the
# protected com.apple.provenance xattr, which `xattr -c` cannot remove. Repack the
# tarball through Python (which never writes AppleDouble) to drop any ._* /
# .DS_Store / __MACOSX member regardless of how bsdtar behaved.
if command -v python3 >/dev/null 2>&1; then
    python3 - "$PARENT_DIR/dist/$APP_NAME.tar.gz" <<'PYCLEAN'
import sys, os, tarfile, tempfile
src = sys.argv[1]
def keep(name):
    parts = name.split('/'); base = parts[-1]
    return not (base.startswith('._') or base == '.DS_Store' or '__MACOSX' in parts)
fd, tmp = tempfile.mkstemp(suffix='.tgz', dir=os.path.dirname(src)); os.close(fd)
# GNU format, NOT the Python default (PAX) — Splunk App Inspect cannot process
# PAX-format archives ("Could not validate package / Unable to process package").
with tarfile.open(src, 'r:gz') as tin, tarfile.open(tmp, 'w:gz', format=tarfile.GNU_FORMAT) as tout:
    for m in tin.getmembers():
        if keep(m.name):
            m.pax_headers = {}
            tout.addfile(m, tin.extractfile(m) if m.isfile() else None)
os.replace(tmp, src)
PYCLEAN
fi

# Vetting guard: abort if any prohibited macOS file slipped into the tarball.
if tar -tzf "$PARENT_DIR/dist/$APP_NAME.tar.gz" | grep -qE '(^|/)\._|__MACOSX'; then
    echo "  ✗ Prohibited macOS files in tarball — aborting:"
    tar -tzf "$PARENT_DIR/dist/$APP_NAME.tar.gz" | grep -E '(^|/)\._|__MACOSX'
    exit 1
fi

# Phase 4: Vet — run Splunk AppInspect (cloud checks) against the final tarball
# so a failing package is never handed over for upload. Skips with a notice if
# AppInspect isn't installed (pip install splunk-appinspect in the repo .venv).
APPINSPECT="$PARENT_DIR/.venv/bin/splunk-appinspect"
[ -x "$APPINSPECT" ] || APPINSPECT="$(command -v splunk-appinspect 2>/dev/null || true)"
if [ -n "$APPINSPECT" ] && [ -x "$APPINSPECT" ]; then
    echo ""
    REPORT="$PARENT_DIR/dist/appinspect-report.txt"
    run_with_spinner "AppInspect cloud vetting" bash -c "'$APPINSPECT' inspect '$PARENT_DIR/dist/$APP_NAME.tar.gz' --included-tags cloud > '$REPORT' 2>&1" || true
    AI_FAIL=$(awk '/^[[:space:]]*failure:/ {gsub(/[^0-9]/,"",$2); print $2}' "$REPORT" | tail -1)
    AI_ERR=$(awk '/^[[:space:]]*error:/ {gsub(/[^0-9]/,"",$2); print $2}' "$REPORT" | tail -1)
    if [ -z "$AI_FAIL" ] || [ -z "$AI_ERR" ]; then
        echo "  ⚠ AppInspect report could not be parsed — review $REPORT"
    elif [ "$AI_FAIL" -gt 0 ] || [ "$AI_ERR" -gt 0 ]; then
        echo "  ✗ AppInspect: $AI_ERR error(s), $AI_FAIL failure(s) — aborting. Details:"
        grep -E "FAILURE:|ERROR:" "$REPORT" | sed 's/^/      /'
        echo "      Full report: $REPORT"
        exit 1
    else
        echo "  ✓ AppInspect: 0 errors, 0 failures (report: dist/appinspect-report.txt)"
    fi
else
    echo "  ⚠ AppInspect not found — skipping vetting (pip install splunk-appinspect)"
fi

echo ""
# Phase 5: Ship — Slack-safe transfer artifact + checksums. CLI zip (unlike
# Finder "Compress") never adds a __MACOSX folder; -X strips extended attrs.
# The zip wraps the .spl (NOT the .tar.gz): extractors auto-expand a nested
# .tar.gz all the way to a bare folder, but nothing recognises .spl, so the
# recipient reliably gets a single Splunk-uploadable file.
cp "$PARENT_DIR/dist/$APP_NAME.tar.gz" "$PARENT_DIR/dist/$APP_NAME.spl"
if command -v zip >/dev/null 2>&1; then
    rm -f "$PARENT_DIR/dist/$APP_NAME.zip"
    (cd "$PARENT_DIR/dist" && zip -X -q "$APP_NAME.zip" "$APP_NAME.spl")
    echo "  ✓ Slack-safe zip (contains $APP_NAME.spl): dist/$APP_NAME.zip"
fi
if command -v shasum >/dev/null 2>&1; then SHACMD="shasum -a 256"; else SHACMD="sha256sum"; fi
(cd "$PARENT_DIR/dist" && $SHACMD "$APP_NAME.tar.gz" "$APP_NAME.spl" "$APP_NAME.zip" 2>/dev/null > SHA256SUMS)
echo "  ✓ Checksums: dist/SHA256SUMS"

echo ""
echo "  📦 $PARENT_DIR/dist/$APP_NAME.tar.gz"
echo ""
