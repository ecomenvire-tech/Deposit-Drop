import json
import urllib.request
import urllib.error

url = 'https://serious-closer-indicating-erp.trycloudflare.com/api/bank-deposit-receipt'
headers = {
    'Origin': 'https://extensions.shopifycdn.com',
    'Content-Type': 'application/json',
    'Authorization': 'Bearer invalid',
    'X-Requested-With': 'XMLHttpRequest',
}
data = {
    'file': {
        'name': 'test.png',
        'type': 'image/png',
        'size': 10,
        'data': 'dGVzdA==',
    },
    'checkoutId': 'test-checkout',
}
req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='POST')

try:
    with urllib.request.urlopen(req) as resp:
        print('STATUS', resp.status)
        print('HEADERS')
        for k, v in resp.headers.items():
            print(f'{k}: {v}')
        print('BODY')
        print(resp.read().decode('utf-8', errors='replace'))
except urllib.error.HTTPError as err:
    print('STATUS', err.code)
    print('HEADERS')
    for k, v in err.headers.items():
        print(f'{k}: {v}')
    print('BODY')
    print(err.read().decode('utf-8', errors='replace'))
except Exception as exc:
    print('ERROR', exc)
