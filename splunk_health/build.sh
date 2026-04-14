#!/usr/bin/env bash
# Build, merge, and package Splunk Health visualizations.
#
# Usage: ./splunk_health/build.sh [viz_name]
#
# With no arguments, builds and merges all 5 vizzes.
# Pass a name to build just one:
#   ./splunk_health/build.sh license_gauge

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLES_DIR="$REPO_ROOT/examples"
TARGET_APP="$SCRIPT_DIR"
APP_NAME="splunk_health"
FONT_CSS="$REPO_ROOT/shared/fonts.css"

APPS=(
    indexing_pipeline_flow
    splunk_status_board
    license_gauge
    forwarder_heatmap
    resource_gauge
    search_activity
    index_storage
    scheduler_health
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
    local SRC_APP="$EXAMPLES_DIR/$VIZ_NAME"
    local SRC_VIZ="$SRC_APP/appserver/static/visualizations/$VIZ_NAME"

    if [ ! -d "$SRC_APP" ]; then
        printf "  ✗ %s (not found at %s)\n" "$VIZ_NAME" "$SRC_APP"
        return 1
    fi

    if [ ! -d "$SRC_VIZ/node_modules" ]; then
        run_with_spinner "$VIZ_NAME → npm install" bash -c "cd '$SRC_VIZ' && npm install" || return 1
    fi

    run_with_spinner "$VIZ_NAME → webpack build" bash -c "cd '$SRC_VIZ' && npm run build" || return 1

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
    local SRC_APP="$EXAMPLES_DIR/$VIZ_NAME"
    local SRC_VIZ="$SRC_APP/appserver/static/visualizations/$VIZ_NAME"

    # Copy visualization assets into parent app
    local VIZ_DEST="$TARGET_APP/appserver/static/visualizations/$VIZ_NAME"
    mkdir -p "$VIZ_DEST"
    for f in "$SRC_VIZ"/*.{js,css,html,json,png,svg}; do
        [ -f "$f" ] || continue
        local fname
        fname=$(basename "$f")
        case "$fname" in
            package.json|package-lock.json|webpack.config.js|harness.json) continue ;;
        esac
        cp "$f" "$VIZ_DEST/"
    done

    # Prepend shared font CSS if available
    local VIZ_CSS="$VIZ_DEST/visualization.css"
    if [ -f "$FONT_CSS" ] && [ -f "$VIZ_CSS" ]; then
        if ! grep -q "@font-face" "$VIZ_CSS"; then
            cat "$FONT_CSS" "$VIZ_CSS" > "$VIZ_CSS.tmp"
            mv "$VIZ_CSS.tmp" "$VIZ_CSS"
        fi
    fi

    # Merge visualizations.conf
    local VIZ_CONF="$TARGET_APP/default/visualizations.conf"
    remove_stanza "$VIZ_CONF" "$VIZ_NAME"
    { echo ""; cat "$SRC_APP/default/visualizations.conf"; } >> "$VIZ_CONF"

    # Merge savedsearches.conf — rewrite namespace from {viz}.{viz} to splunk_health.{viz}
    local SAVED_SEARCH_FILE="$TARGET_APP/default/savedsearches.conf"
    local SRC_SAVED="$SRC_APP/default/savedsearches.conf"
    if [ -f "$SRC_SAVED" ]; then
        # Remove existing stanzas for this viz
        while IFS= read -r line; do
            local sname="${line#[}"
            sname="${sname%]}"
            remove_stanza "$SAVED_SEARCH_FILE" "$sname"
        done < <(grep '^\[' "$SRC_SAVED")

        # Rewrite namespace: {viz_name}.{viz_name} → splunk_health.{viz_name}
        sed "s/${VIZ_NAME}\\.${VIZ_NAME}/splunk_health.${VIZ_NAME}/g" "$SRC_SAVED" >> "$SAVED_SEARCH_FILE"
        echo "" >> "$SAVED_SEARCH_FILE"
    fi

    # Merge spec entries — same namespace rewrite
    local SPEC_SRC="$SRC_APP/README/savedsearches.conf.spec"
    local SPEC_DEST="$TARGET_APP/README/savedsearches.conf.spec"
    if [ -f "$SPEC_SRC" ]; then
        mkdir -p "$TARGET_APP/README"
        # Remove existing entries for this viz
        if [ -f "$SPEC_DEST" ]; then
            grep -v "display\\.visualizations\\.custom\\..*$VIZ_NAME\\." "$SPEC_DEST" \
                > "$SPEC_DEST.tmp" 2>/dev/null || true
            mv "$SPEC_DEST.tmp" "$SPEC_DEST"
        fi
        # Rewrite namespace and append
        sed "s/${VIZ_NAME}\\.${VIZ_NAME}/splunk_health.${VIZ_NAME}/g" "$SPEC_SRC" >> "$SPEC_DEST"
        echo "" >> "$SPEC_DEST"
    fi

    # Update metadata — add export stanza
    local META_FILE="$TARGET_APP/metadata/default.meta"
    if ! grep -q "visualizations/$VIZ_NAME" "$META_FILE"; then
        { echo ""; echo "[visualizations/$VIZ_NAME]"; echo "export = system"; } >> "$META_FILE"
    fi

    MERGED=$((MERGED + 1))
    return 0
}

# ── Run ────────────────────────────────────────────────────────────────

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║        Splunk Health — Builder         ║"
echo "  ╚═══════════════════════════════════════╝"

# Reset merged config files
> "$TARGET_APP/default/visualizations.conf"
> "$TARGET_APP/default/savedsearches.conf"
> "$TARGET_APP/README/savedsearches.conf.spec"

# Remove stale viz export stanzas from metadata (keep everything up to first [visualizations/])
awk '/^\[visualizations\//{exit} {print}' "$TARGET_APP/metadata/default.meta" > "$TARGET_APP/metadata/default.meta.tmp"
mv "$TARGET_APP/metadata/default.meta.tmp" "$TARGET_APP/metadata/default.meta"

# Remove stale appserver directory
rm -rf "$TARGET_APP/appserver"

# Phase 1: Build
echo ""
echo "  Building..."
if [ $# -ge 1 ]; then
    build_viz "$1" || true
else
    for app in "${APPS[@]}"; do
        build_viz "$app" || true
    done
fi

# Phase 2: Merge
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

# Bump patch version
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
xattr -rc "$TARGET_APP" 2>/dev/null || true

TARBALL="$REPO_ROOT/dist/$APP_NAME.tar.gz"
mkdir -p "$REPO_ROOT/dist"

run_with_spinner "$APP_NAME.tar.gz" bash -c "
    COPYFILE_DISABLE=1 tar --disable-copyfile \
        --exclude='.git' \
        --exclude='.git*' \
        --exclude='.DS_Store' \
        --exclude='._*' \
        --exclude='local' \
        --exclude='build.sh' \
        -czf '$TARBALL' \
        -C '$(dirname "$TARGET_APP")' \
        '$APP_NAME'
"

echo ""
echo "  📦 $TARBALL"

# Show what's inside
echo ""
echo "  Visualizations included:"
for app in "${BUILT[@]}"; do
    printf "    • %s\n" "$app"
done

echo ""
echo "  Upload via: Splunk Cloud → Apps → Install app from file"
echo ""
