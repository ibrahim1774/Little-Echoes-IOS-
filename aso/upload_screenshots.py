"""Upload aso/screenshots/out/<locale>/iphone_N.png to App Store Connect (6.5" iPhone set).

Usage: python3 aso/upload_screenshots.py <locale> [<locale> ...]

Replaces the locale's existing APP_IPHONE_65 set: deletes its screenshots, then
reserves, uploads and commits each image in order. Prints one line per locale.
"""
import hashlib
import sys
import urllib.request
from pathlib import Path

from upload_metadata import VERSION, asc, errors, existing

OUT = Path(__file__).resolve().parent / 'screenshots/out'
DISPLAY = 'APP_IPHONE_65'


def screenshot_set(loc_id):
    _, d = asc('GET', f'/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets?limit=50')
    for s in d.get('data', []):
        if s['attributes']['screenshotDisplayType'] == DISPLAY:
            return s['id']
    s, d = asc('POST', '/v1/appScreenshotSets', {'data': {
        'type': 'appScreenshotSets', 'attributes': {'screenshotDisplayType': DISPLAY},
        'relationships': {'appStoreVersionLocalization': {'data': {
            'type': 'appStoreVersionLocalizations', 'id': loc_id}}}}})
    if 'data' not in d:
        raise RuntimeError(f'create set {s} {errors(d)}')
    return d['data']['id']


def upload(set_id, path):
    data = path.read_bytes()
    s, d = asc('POST', '/v1/appScreenshots', {'data': {
        'type': 'appScreenshots', 'attributes': {'fileName': path.name, 'fileSize': len(data)},
        'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}}}})
    if 'data' not in d:
        raise RuntimeError(f'reserve {s} {errors(d)}')
    shot = d['data']
    for op in shot['attributes']['uploadOperations']:
        chunk = data[op['offset']:op['offset'] + op['length']]
        req = urllib.request.Request(op['url'], data=chunk, method=op['method'])
        for h in op.get('requestHeaders', []):
            req.add_header(h['name'], h['value'])
        urllib.request.urlopen(req, timeout=120).read()
    s, d = asc('PATCH', f"/v1/appScreenshots/{shot['id']}", {'data': {
        'type': 'appScreenshots', 'id': shot['id'],
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})
    if not s.startswith('HTTP 2'):
        raise RuntimeError(f'commit {s} {errors(d)}')


def main(locales):
    loc_ids = existing(f'/v1/appStoreVersions/{VERSION}/appStoreVersionLocalizations?limit=200')
    for loc in locales:
        set_id = screenshot_set(loc_ids[loc])
        _, d = asc('GET', f'/v1/appScreenshotSets/{set_id}/appScreenshots?limit=50')
        for old in d.get('data', []):
            asc('DELETE', f"/v1/appScreenshots/{old['id']}")
        files = sorted((OUT / loc).glob('iphone_*.png'), key=lambda p: int(p.stem.split('_')[1]))
        for f in files:
            upload(set_id, f)
        print(loc, 'uploaded', len(files))
        sys.stdout.flush()


if __name__ == '__main__':
    main(sys.argv[1:])
