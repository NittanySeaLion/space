"""
Lunar Sky — Sea of Tranquility
Flask app serving the visualization + cached NASA Horizons ephemeris data.
"""
import os
import time
import threading
import logging
from flask import Flask, render_template, jsonify, send_file, Response
import requests
import io

app = Flask(__name__)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

# ── Observer: Apollo 11 landing site, Sea of Tranquility ─────────────────────
OBS_LAT = 0.6741    # selenographic latitude (degrees)
OBS_LON = 23.4322   # selenographic longitude (degrees)

# ── Horizons API cache ───────────────────────────────────────────────────────
CACHE_TTL = 600  # seconds (10 minutes)
_cache = {'data': None, 'ts': 0}
_cache_lock = threading.Lock()

HORIZONS_TARGETS = [
    ('10',  'Sun'),
    ('599', 'Jupiter'),
    ('699', 'Saturn'),
    ('499', 'Mars'),
]


def _fetch_horizons():
    """Fetch RA/Dec for targets as seen from Moon surface via JPL Horizons."""
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    start = now.strftime('%Y-%m-%d %H:%M')
    end = (now + timedelta(minutes=2)).strftime('%Y-%m-%d %H:%M')

    results = {}
    for target_id, name in HORIZONS_TARGETS:
        try:
            params = {
                'format': 'json',
                'COMMAND': f"'{target_id}'",
                'OBJ_DATA': 'NO',
                'MAKE_EPHEM': 'YES',
                'EPHEM_TYPE': 'OBSERVER',
                'CENTER': "'coord@301'",
                'COORD_TYPE': 'GEODETIC',
                'SITE_COORD': f"'{OBS_LON:.3f},{OBS_LAT:.3f},0'",
                'START_TIME': f"'{start}'",
                'STOP_TIME': f"'{end}'",
                'STEP_SIZE': '1m',
                'QUANTITIES': '1',
                'ANG_FORMAT': 'DEG',
                'CSV_FORMAT': 'NO',
                'CAL_FORMAT': 'CAL',
            }
            resp = requests.get(
                'https://ssd.jpl.nasa.gov/api/horizons.api',
                params=params,
                timeout=8
            )
            data = resp.json()
            if data and 'result' in data:
                lines = data['result'].split('\n')
                inside = False
                for line in lines:
                    if '$$SOE' in line:
                        inside = True
                        continue
                    if '$$EOE' in line:
                        break
                    if inside and line.strip():
                        parts = line.strip().split()
                        if len(parts) >= 5:
                            ra = float(parts[3])
                            dec = float(parts[4])
                            results[name] = {'ra': ra, 'dec': dec}
                            break
        except Exception as e:
            log.warning(f'Horizons fetch failed for {name}: {e}')

    return results


def _refresh_cache():
    """Refresh cache if stale."""
    now = time.time()
    with _cache_lock:
        if now - _cache['ts'] < CACHE_TTL and _cache['data'] is not None:
            return _cache['data']

    # Fetch outside lock to avoid blocking
    data = _fetch_horizons()
    if data:
        with _cache_lock:
            _cache['data'] = data
            _cache['ts'] = time.time()
        log.info(f'Horizons cache refreshed: {list(data.keys())}')
    return data


# ── Routes ───────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/ephemeris')
def ephemeris():
    """Return cached planet positions from JPL Horizons."""
    data = _refresh_cache()
    if data:
        return jsonify({'status': 'ok', 'source': 'horizons', 'bodies': data})
    # Return empty on failure — frontend falls back to VSOP87
    return jsonify({'status': 'fallback', 'source': 'vsop87', 'bodies': {}})


# ── DSCOVR/EPIC Earth image cache ────────────────────────────────────────────
EPIC_CACHE_TTL = 3600  # 1 hour — EPIC updates ~every 2 hours
_epic_cache = {'data': None, 'ts': 0, 'content_type': 'image/png'}
_epic_lock = threading.Lock()


def _fetch_epic_image():
    """Fetch latest DSCOVR/EPIC full-disk Earth image from NASA."""
    try:
        # Get list of recent images
        resp = requests.get(
            'https://epic.gsfc.nasa.gov/api/natural',
            timeout=10
        )
        images = resp.json()
        if not images:
            log.warning('EPIC API returned no images')
            return None

        # Use most recent image
        latest = images[0]
        img_name = latest['image']
        date_str = latest['date']  # "2026-03-24 00:41:23"
        date_parts = date_str.split(' ')[0].split('-')
        year, month, day = date_parts[0], date_parts[1], date_parts[2]

        # Fetch the actual image (use 'thumbs' for smaller size, ~100KB vs ~2MB for png)
        img_url = f'https://epic.gsfc.nasa.gov/archive/natural/{year}/{month}/{day}/thumbs/{img_name}.jpg'
        img_resp = requests.get(img_url, timeout=15)
        if img_resp.status_code == 200:
            log.info(f'EPIC Earth image fetched: {img_name} ({len(img_resp.content)} bytes)')
            return img_resp.content
        else:
            log.warning(f'EPIC image fetch failed: {img_resp.status_code}')
            return None
    except Exception as e:
        log.warning(f'EPIC fetch error: {e}')
        return None


@app.route('/api/earth-image')
def earth_image():
    """Serve cached DSCOVR/EPIC Earth photo."""
    now = time.time()
    with _epic_lock:
        if now - _epic_cache['ts'] < EPIC_CACHE_TTL and _epic_cache['data']:
            return Response(_epic_cache['data'], mimetype='image/jpeg',
                          headers={'Cache-Control': 'public, max-age=3600'})

    # Fetch outside lock
    data = _fetch_epic_image()
    if data:
        with _epic_lock:
            _epic_cache['data'] = data
            _epic_cache['ts'] = time.time()
        return Response(data, mimetype='image/jpeg',
                       headers={'Cache-Control': 'public, max-age=3600'})

    # Return 204 if no image available — client uses procedural fallback
    return Response(status=204)


# ── Background refresh thread ────────────────────────────────────────────────
def _bg_refresh():
    """Periodically refresh cache in background so requests are always fast."""
    while True:
        try:
            _refresh_cache()
        except Exception as e:
            log.error(f'Background refresh error: {e}')
        time.sleep(CACHE_TTL)


_bg_thread = None


def start_background_refresh():
    global _bg_thread
    if _bg_thread is None or not _bg_thread.is_alive():
        _bg_thread = threading.Thread(target=_bg_refresh, daemon=True)
        _bg_thread.start()
        log.info('Background Horizons refresh thread started')


# Start on import (works under mod_wsgi too)
start_background_refresh()


if __name__ == '__main__':
    app.run(debug=True, port=5050)
