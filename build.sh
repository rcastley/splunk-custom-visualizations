#!/usr/bin/env bash
set -euo pipefail

#
# build.sh — Build and package Splunk custom visualization apps
#
# Usage:
#   ./build.sh                    # Build all viz apps in examples/
#   ./build.sh custom_single_value # Build a specific viz app
#
# Output: {app_name}-{version}.tar.gz in the dist/ directory
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLES_DIR="$SCRIPT_DIR/examples"
OUTPUT_DIR="$SCRIPT_DIR/dist"

# Optional: path to shared font CSS to prepend to visualization.css
# Uncomment and set this if you have a shared font file:
# FONT_CSS="$SCRIPT_DIR/shared/fonts.css"

mkdir -p "$OUTPUT_DIR"

build_app() {
    local APP_NAME="$1"
    local APP_DIR="$EXAMPLES_DIR/$APP_NAME"
    local VIZ_DIR="$APP_DIR/appserver/static/visualizations/$APP_NAME"

    if [ ! -d "$APP_DIR" ]; then
        echo "Error: App directory not found: $APP_DIR"
        return 1
    fi

    if [ ! -f "$APP_DIR/default/app.conf" ]; then
        echo "Error: No app.conf found in $APP_DIR/default/"
        return 1
    fi

    local VERSION
    VERSION=$(grep '^version' "$APP_DIR/default/app.conf" | cut -d= -f2 | tr -d ' ')
    local TARBALL="$OUTPUT_DIR/${APP_NAME}-${VERSION}.tar.gz"

    echo "=== Building: $APP_NAME v$VERSION ==="
    echo ""

    # Step 1: Install dependencies
    if [ ! -d "$VIZ_DIR/node_modules" ]; then
        echo "[1/3] Installing npm dependencies..."
        (cd "$VIZ_DIR" && npm install --silent)
    else
        echo "[1/3] Dependencies already installed, skipping."
    fi

    # Step 2: Build webpack bundle
    echo "[2/3] Building visualization bundle..."
    (cd "$VIZ_DIR" && npm run build --silent)

    # Step 3: Optionally prepend shared font CSS
    local CSS_MODIFIED=false
    local ORIGINAL_CSS=""
    local VIZ_CSS="$VIZ_DIR/visualization.css"

    if [ -n "${FONT_CSS:-}" ] && [ -f "${FONT_CSS:-}" ] && [ -f "$VIZ_CSS" ] && ! grep -q "@font-face" "$VIZ_CSS"; then
        echo "       Prepending shared font CSS..."
        ORIGINAL_CSS=$(cat "$VIZ_CSS")
        cat "$FONT_CSS" "$VIZ_CSS" > "$VIZ_CSS.tmp" && mv "$VIZ_CSS.tmp" "$VIZ_CSS"
        CSS_MODIFIED=true
    fi

    # Step 4: Package tarball
    echo "[3/3] Packaging $TARBALL..."

    # Build tar flags (macOS needs extra flags to suppress resource forks)
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

    # Restore original CSS if we modified it
    if [ "$CSS_MODIFIED" = true ]; then
        echo "$ORIGINAL_CSS" > "$VIZ_CSS"
    fi

    echo ""
    echo "Done! Install with:"
    echo "  \$SPLUNK_HOME/bin/splunk install app $TARBALL"
    echo ""
}

# Main
if [ $# -gt 0 ]; then
    # Build specific app(s)
    for app in "$@"; do
        build_app "$app"
    done
else
    # Build all apps in examples/
    echo "Building all visualization apps..."
    echo ""
    for app_dir in "$EXAMPLES_DIR"/*/; do
        app_name=$(basename "$app_dir")
        if [ -f "$app_dir/default/app.conf" ]; then
            build_app "$app_name"
        fi
    done
fi
