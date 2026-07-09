#!/usr/bin/env bash
set -euo pipefail

#
# build.sh — Build and package Splunk custom visualization apps
#
# Auto-detects the framework track per app:
#   Track A (legacy SplunkVisualizationBase, AMD + webpack)
#     → expects examples/{app}/default/app.conf
#     → runs `npm run build` inside appserver/static/visualizations/{app}/
#     → packages a .tar.gz under dist/
#   Track B (Dashboard Studio Extension, ESM + esbuild)
#     → expects examples/{app}/package/app/app.conf
#     → runs `npm run build:prod && npm run package` at the app root
#     → copies the per-app .spl into dist/
#
# Usage:
#   ./build.sh                     # Build all viz apps in examples/
#   ./build.sh steampunk_gauge     # Build a specific viz app
#
# Output: dist/{app_name}-{version}.tar.gz (Track A)
#         dist/{app_name}-{version}-{git}.spl (Track B)
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLES_DIR="$SCRIPT_DIR/examples"
OUTPUT_DIR="$SCRIPT_DIR/dist"

# Optional: path to shared font CSS to prepend to legacy visualization.css.
# Track B inlines its own CSS via esbuild and ignores this.
FONT_CSS="$SCRIPT_DIR/shared/fonts.css"

mkdir -p "$OUTPUT_DIR"

# ---------------------------------------------------------------------------
# Track detection
# ---------------------------------------------------------------------------

detect_track() {
    local APP_DIR="$1"
    if [ -f "$APP_DIR/package/app/app.conf" ]; then
        echo "B"
    elif [ -f "$APP_DIR/default/app.conf" ]; then
        echo "A"
    else
        echo "unknown"
    fi
}

read_version() {
    # First `^version` line wins. Both Track A and Track B keep [id]/version
    # at the top of app.conf, so head -1 picks the canonical app version.
    grep -E '^version' "$1" | head -1 | cut -d= -f2 | tr -d ' '
}

# ---------------------------------------------------------------------------
# Track A — legacy SplunkVisualizationBase
# ---------------------------------------------------------------------------

build_app_legacy() {
    local APP_NAME="$1"
    local APP_DIR="$EXAMPLES_DIR/$APP_NAME"
    local VIZ_DIR="$APP_DIR/appserver/static/visualizations/$APP_NAME"

    local VERSION
    VERSION=$(read_version "$APP_DIR/default/app.conf")
    local TARBALL="$OUTPUT_DIR/${APP_NAME}-${VERSION}.tar.gz"

    echo "=== Building (Track A / legacy): $APP_NAME v$VERSION ==="
    echo ""

    if [ ! -d "$VIZ_DIR" ]; then
        echo "Error: legacy viz directory missing: $VIZ_DIR"
        return 1
    fi

    if [ ! -d "$VIZ_DIR/node_modules" ]; then
        echo "[1/3] Installing npm dependencies..."
        (cd "$VIZ_DIR" && npm install --silent)
    else
        echo "[1/3] Dependencies already installed, skipping."
    fi

    echo "[2/3] Building visualization bundle..."
    (cd "$VIZ_DIR" && npm run build --silent)

    local CSS_MODIFIED=false
    local ORIGINAL_CSS=""
    local VIZ_CSS="$VIZ_DIR/visualization.css"

    if [ -n "${FONT_CSS:-}" ] && [ -f "${FONT_CSS:-}" ] && [ -f "$VIZ_CSS" ] && ! grep -q "@font-face" "$VIZ_CSS"; then
        echo "       Prepending shared font CSS..."
        ORIGINAL_CSS=$(cat "$VIZ_CSS")
        cat "$FONT_CSS" "$VIZ_CSS" > "$VIZ_CSS.tmp" && mv "$VIZ_CSS.tmp" "$VIZ_CSS"
        CSS_MODIFIED=true
    fi

    echo "[3/3] Packaging $TARBALL..."

    local TAR_FLAGS=()
    if [[ "$(uname)" == "Darwin" ]]; then
        xattr -rc "$APP_DIR" 2>/dev/null || true
        export COPYFILE_DISABLE=1
        TAR_FLAGS+=(--disable-copyfile --no-xattrs --no-mac-metadata)
    fi

    tar "${TAR_FLAGS[@]}" \
        --exclude='.*' --exclude='._*' --exclude='__MACOSX' \
        --exclude="$APP_NAME/appserver/static/visualizations/$APP_NAME/node_modules" \
        --exclude="$APP_NAME/appserver/static/visualizations/$APP_NAME/src" \
        --exclude="$APP_NAME/appserver/static/visualizations/$APP_NAME/package.json" \
        --exclude="$APP_NAME/appserver/static/visualizations/$APP_NAME/package-lock.json" \
        --exclude="$APP_NAME/appserver/static/visualizations/$APP_NAME/webpack.config.js" \
        -czf "$TARBALL" \
        -C "$EXAMPLES_DIR" \
        "$APP_NAME"

    if [ "$CSS_MODIFIED" = true ]; then
        echo "$ORIGINAL_CSS" > "$VIZ_CSS"
    fi

    echo ""
    echo "Done! Install with:"
    echo "  \$SPLUNK_HOME/bin/splunk install app $TARBALL"
    echo ""
}

# ---------------------------------------------------------------------------
# Track B — Dashboard Studio Extension
# ---------------------------------------------------------------------------

build_app_studio() {
    local APP_NAME="$1"
    local APP_DIR="$EXAMPLES_DIR/$APP_NAME"

    local VERSION
    VERSION=$(read_version "$APP_DIR/package/app/app.conf")

    echo "=== Building (Track B / Studio Extension): $APP_NAME v$VERSION ==="
    echo ""

    if [ ! -f "$APP_DIR/package.json" ]; then
        echo "Error: $APP_DIR/package.json is missing — Track B requires it at the app root."
        return 1
    fi
    if [ ! -f "$APP_DIR/package.mjs" ] || [ ! -f "$APP_DIR/build.mjs" ]; then
        echo "Error: $APP_DIR is missing build.mjs or package.mjs."
        echo "       Copy the patched scripts from examples/steampunk_gauge_studio/."
        return 1
    fi

    if [ ! -d "$APP_DIR/node_modules" ]; then
        echo "[1/3] Installing npm dependencies..."
        (cd "$APP_DIR" && npm install --silent)
    else
        echo "[1/3] Dependencies already installed, skipping."
    fi

    echo "[2/3] Building production bundle (esbuild)..."
    (cd "$APP_DIR" && npm run build:prod --silent)

    echo "[3/3] Packaging .spl..."
    (cd "$APP_DIR" && npm run package --silent)

    # The Track B packager (package.mjs) writes .spl into the per-app
    # examples/{app}/dist/ directory and names the file with the git short
    # hash so multiple builds accumulate. Pick the newest one and copy it
    # to the repo-level dist/ so all build.sh output lives in one place.
    local LATEST_SPL=""
    if compgen -G "$APP_DIR/dist/*.spl" > /dev/null; then
        # shellcheck disable=SC2012
        LATEST_SPL=$(ls -t "$APP_DIR/dist/"*.spl | head -1)
    fi
    if [ -z "$LATEST_SPL" ] || [ ! -f "$LATEST_SPL" ]; then
        echo "Error: no .spl produced under $APP_DIR/dist/"
        return 1
    fi

    cp -f "$LATEST_SPL" "$OUTPUT_DIR/"
    local COPIED="$OUTPUT_DIR/$(basename "$LATEST_SPL")"

    echo ""
    echo "Done! Install with:"
    echo "  \$SPLUNK_HOME/bin/splunk install app $COPIED"
    echo ""
}

# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

build_app() {
    local APP_NAME="$1"
    local APP_DIR="$EXAMPLES_DIR/$APP_NAME"

    if [ ! -d "$APP_DIR" ]; then
        echo "Error: App directory not found: $APP_DIR"
        return 1
    fi

    local TRACK
    TRACK=$(detect_track "$APP_DIR")

    case "$TRACK" in
        A) build_app_legacy "$APP_NAME" ;;
        B) build_app_studio "$APP_NAME" ;;
        *)
            echo "Error: $APP_NAME has neither default/app.conf (Track A)"
            echo "       nor package/app/app.conf (Track B). Skipping."
            return 1
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if [ $# -gt 0 ]; then
    for app in "$@"; do
        build_app "$app"
    done
else
    echo "Building all visualization apps..."
    echo ""
    for app_dir in "$EXAMPLES_DIR"/*/; do
        app_name=$(basename "$app_dir")
        if [ -f "$app_dir/default/app.conf" ] || [ -f "$app_dir/package/app/app.conf" ]; then
            build_app "$app_name" || echo "(continuing with next app)"
            echo ""
        fi
    done
fi
