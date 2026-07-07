import json
import urllib.request
import urllib.error

url = 'https://serious-closer-indicating-erp.trycloudflare.com/api/bank-deposit-receipt'

for method in ['OPTIONS', 'GET', 'POST']:
    print('\n===', method, '===')
    headers = {
        'Origin': 'https://extensions.shopifycdn.com',
    }
    data = None
    if method == 'POST':
        headers.update({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid',
            'X-Requested-With': 'XMLHttpRequest',
        })
        data = json.dumps({
            'file': {
                'name': 'test.png',
                'type': 'image/png',
                'size': 10,
                'data': 'dGVzdA==',
            },
            'checkoutId': 'test-checkout',
        }).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
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
