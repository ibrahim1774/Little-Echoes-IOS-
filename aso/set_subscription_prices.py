"""Price each subscription in every territory from its US price point (Apple's equalized prices).

Usage: python3 aso/set_subscription_prices.py <subscriptionId> <usPricePointId>

Skips territories that already have a price, so it is safe to re-run.
"""
import sys

from upload_metadata import asc, errors


def all_pages(path):
    while path:
        _, d = asc('GET', path)
        yield from d.get('data', [])
        nxt = d.get('links', {}).get('next')
        path = nxt.replace('https://api.appstoreconnect.apple.com', '') if nxt else None


def main(sub, us_point):
    priced = set()
    for p in all_pages(f'/v1/subscriptions/{sub}/prices?include=territory&limit=200'):
        t = p.get('relationships', {}).get('territory', {}).get('data')
        if t:
            priced.add(t['id'])
    points = [(us_point, 'USA')]
    for p in all_pages(f'/v1/subscriptionPricePoints/{us_point}/equalizations?include=territory&limit=200'):
        points.append((p['id'], p['relationships']['territory']['data']['id']))
    done = failed = 0
    for point_id, territory in points:
        if territory in priced:
            continue
        s, d = asc('POST', '/v1/subscriptionPrices', {'data': {
            'type': 'subscriptionPrices',
            'attributes': {'preserveCurrentPrice': False},
            'relationships': {
                'subscription': {'data': {'type': 'subscriptions', 'id': sub}},
                'subscriptionPricePoint': {'data': {'type': 'subscriptionPricePoints', 'id': point_id}},
                'territory': {'data': {'type': 'territories', 'id': territory}}}}})
        if s.startswith('HTTP 2'):
            done += 1
        else:
            failed += 1
            print('FAIL', territory, s, errors(d))
    print(sub, 'territories:', len(points), 'newly priced:', done, 'already priced:', len(priced), 'failed:', failed)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
