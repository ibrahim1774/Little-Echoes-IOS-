"""Change a subscription's price everywhere, from a US price (Apple's equalized prices elsewhere).

Usage: python3 aso/change_subscription_price.py <subscriptionId> <usPrice> <startDate YYYY-MM-DD> [--usa-only | --skip-usa]

New prices start immediately and apply to existing subscribers too (preserveCurrentPrice false),
so only use it when moving existing subscribers is intended.
"""
import sys

from upload_metadata import asc, errors
from set_subscription_prices import all_pages


def us_point(sub, price):
    for p in all_pages(f'/v1/subscriptions/{sub}/pricePoints?filter[territory]=USA&limit=200'):
        if abs(float(p['attributes']['customerPrice']) - price) < 0.001:
            return p['id']
    raise SystemExit(f'No US price point of {price} for {sub}')


def set_price(sub, point_id, territory, start):
    s, d = asc('POST', '/v1/subscriptionPrices', {'data': {
        'type': 'subscriptionPrices',
        'attributes': {'preserveCurrentPrice': False, 'startDate': start},
        'relationships': {
            'subscription': {'data': {'type': 'subscriptions', 'id': sub}},
            'subscriptionPricePoint': {'data': {'type': 'subscriptionPricePoints', 'id': point_id}},
            'territory': {'data': {'type': 'territories', 'id': territory}}}}})
    return s.startswith('HTTP 2'), errors(d)


def main(sub, price, start, usa_only):
    point = us_point(sub, price)
    if '--skip-usa' not in sys.argv:
        ok, err = set_price(sub, point, 'USA', start)
        print('USA', 'ok' if ok else f'FAIL {err}')
        if usa_only or not ok:
            return
    done = failed = 0
    for p in all_pages(f'/v1/subscriptionPricePoints/{point}/equalizations?include=territory&limit=200'):
        ok, err = set_price(sub, p['id'], p['relationships']['territory']['data']['id'], start)
        done += ok
        if not ok:
            failed += 1
            print('FAIL', p['relationships']['territory']['data']['id'], err)
    print(sub, 'other territories changed:', done, 'failed:', failed)


if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]), sys.argv[3], '--usa-only' in sys.argv)
