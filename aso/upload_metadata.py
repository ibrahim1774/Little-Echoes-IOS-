"""Push fastlane/metadata/<locale>/*.txt to App Store Connect for Little Echoes.

Usage: python3 aso/upload_metadata.py <locale> [<locale> ...]

Name and subtitle go to the app info localization; description, keywords and
promotional text go to the 1.0 version localization. Existing localizations
are PATCHed, missing ones POSTed. Prints one line per write with the HTTP status.
"""
import json
import subprocess
import sys
from pathlib import Path

ASC = str(Path.home() / '.claude/skills/vibe-aso/scripts/asc.rb')
META = Path(__file__).resolve().parent.parent / 'fastlane/metadata'
APP_INFO = '717eefc9-58fe-4df6-857b-c759504db833'
VERSION = '582acd48-f3ab-4b66-ad65-4c3f32d21018'


def asc(method, path, body=None):
    args = ['ruby', ASC, method, path] + ([json.dumps(body)] if body else [])
    out = subprocess.run(args, capture_output=True, text=True).stdout
    status, _, rest = out.partition('\n')
    try:
        data = json.loads(rest) if rest.strip() else {}
    except json.JSONDecodeError:
        data = {'raw': rest[:300]}
    return status.strip(), data


def existing(path):
    _, data = asc('GET', path)
    return {d['attributes']['locale']: d['id'] for d in data.get('data', [])}


def read(locale, field):
    return (META / locale / f'{field}.txt').read_text()


def errors(data):
    return '; '.join(e.get('detail', '') for e in data.get('errors', []))


def main(locales):
    info_ids = existing(f'/v1/appInfos/{APP_INFO}/appInfoLocalizations?limit=200')
    ver_ids = existing(f'/v1/appStoreVersions/{VERSION}/appStoreVersionLocalizations?limit=200')
    for loc in locales:
        info = {'name': read(loc, 'name'), 'subtitle': read(loc, 'subtitle')}
        if loc in info_ids:
            s, d = asc('PATCH', f'/v1/appInfoLocalizations/{info_ids[loc]}',
                       {'data': {'type': 'appInfoLocalizations', 'id': info_ids[loc], 'attributes': info}})
        else:
            s, d = asc('POST', '/v1/appInfoLocalizations', {'data': {
                'type': 'appInfoLocalizations', 'attributes': {'locale': loc, **info},
                'relationships': {'appInfo': {'data': {'type': 'appInfos', 'id': APP_INFO}}}}})
        print(loc, 'info', s, errors(d))

        ver = {'description': read(loc, 'description'), 'keywords': read(loc, 'keywords'),
               'promotionalText': read(loc, 'promotional_text')}
        if loc in ver_ids:
            s, d = asc('PATCH', f'/v1/appStoreVersionLocalizations/{ver_ids[loc]}',
                       {'data': {'type': 'appStoreVersionLocalizations', 'id': ver_ids[loc], 'attributes': ver}})
        else:
            s, d = asc('POST', '/v1/appStoreVersionLocalizations', {'data': {
                'type': 'appStoreVersionLocalizations', 'attributes': {'locale': loc, **ver},
                'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': VERSION}}}}})
        if s.endswith('409'):
            # Creating the app info localization also creates an empty version localization.
            ver_ids = existing(f'/v1/appStoreVersions/{VERSION}/appStoreVersionLocalizations?limit=200')
            s, d = asc('PATCH', f'/v1/appStoreVersionLocalizations/{ver_ids[loc]}',
                       {'data': {'type': 'appStoreVersionLocalizations', 'id': ver_ids[loc], 'attributes': ver}})
        print(loc, 'version', s, errors(d))
        sys.stdout.flush()


if __name__ == '__main__':
    main(sys.argv[1:])
