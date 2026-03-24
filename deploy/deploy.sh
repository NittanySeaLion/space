#!/bin/bash
# Deploy space.litigatech.com — Lunar Sky visualization
# Usage: sudo /opt/space/deploy.sh

set -e

APP_DIR="/var/www/space"
REPO_URL="https://github.com/NittanySeaLion/space.git"
TMP_DIR="/tmp/space-deploy"

echo "=== Deploying space.litigatech.com ==="

# Clone/pull latest
if [ -d "$TMP_DIR" ]; then
    cd "$TMP_DIR" && git fetch --all && git reset --hard origin/main
else
    git clone "$REPO_URL" "$TMP_DIR"
    cd "$TMP_DIR"
fi

# Create app dir if needed
mkdir -p "$APP_DIR"

# Copy application files
cp app.py "$APP_DIR/"
cp requirements.txt "$APP_DIR/"
cp -r templates "$APP_DIR/"
cp -r static "$APP_DIR/"

# Create venv if it doesn't exist
if [ ! -d "$APP_DIR/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$APP_DIR/venv"
fi

# Install/update dependencies
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"

# Create app.wsgi if it doesn't exist
if [ ! -f "$APP_DIR/app.wsgi" ]; then
    cat > "$APP_DIR/app.wsgi" << 'WSGI'
import sys
sys.path.insert(0, '/var/www/space')

from app import app as application
WSGI
    echo "Created app.wsgi — edit if needed"
fi

# Set ownership
chown -R www-data:www-data "$APP_DIR"

# Reload mod_wsgi
touch "$APP_DIR/app.wsgi"

echo "=== Deploy complete ==="
