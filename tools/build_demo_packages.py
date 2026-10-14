#!/usr/bin/env python3
"""產生 Demo 資料包（內容皆為示意，manifest 標示 demo:true）。用法：python3 tools/build_demo_packages.py"""
import hashlib, json, os, random, shutil, datetime
PART = 32 * 1024
sha = lambda b: hashlib.sha256(b).hexdigest()
OUT = 'packages'

ROADS = ['忠孝', '仁愛', '信義', '和平', '中山', '民權', '民生', '復興', '建國', '光復', '自由']
CATS = ['餐廳', '咖啡', '加油', '充電', '停車', '飯店', '醫院', '警察', '學校', '超商', '賣場', 'ATM', '景點', '車站', '機場', '休息站']
CITIES = [('示範北城', -600, 800), ('示範東城', 800, 200), ('示範南城', -200, -800), ('示範西城', -900, -200), ('示範中城', 0, 0), ('示範新城', 700, -600)]
def addr(x, y):
    xi = min(10, max(0, round((x + 1000) / 200))); return f'{ROADS[xi]}路 {int((y + 1000) / 20) + 1} 號'

def alerts():
    fixed = [(-800, -600, 0, 'speedCamera', 50), (-800, -400, 0, 'schoolZone', 30), (-500, -200, 90, 'sharpCurve', 40), (-200, 100, 0, 'constructionZone', 40), (200, 400, 90, 'speedCamera', 60), (-200, 200, 0, 'railCrossing', None), (-200, 300, 0, 'speedLimitDrop', 40)]
    out = [{'id': 'a%03d' % (i + 1), 'type': t, 'x': x, 'y': y, 'heading': h, 'kmh': k, 'demo': True} for i, (x, y, h, t, k) in enumerate(fixed)]
    rnd = random.Random(11); types = [('speedCamera', 60), ('schoolZone', 30), ('constructionZone', 40), ('sharpCurve', 40), ('railCrossing', None), ('speedLimitDrop', 40)]
    for i in range(24):
        t, k = types[i % 6]; a, b = rnd.randrange(-1000, 1000, 200), rnd.randrange(-1000, 1001, 200)
        x, y, h = (b, a + 100, rnd.choice([0, 180])) if i % 2 else (a + 100, b, rnd.choice([90, 270]))
        out.append({'id': 'a%03d' % (len(out) + 1), 'type': t, 'x': x, 'y': y, 'heading': h, 'kmh': k, 'demo': True})
    return out

def content(n_poi):
    rnd = random.Random(7); cats = CATS
    nodes = [[x, y] for x in range(-1000, 1001, 200) for y in range(-1000, 1001, 200)]
    edges = []
    for x, y in nodes:
        for dx, dy in ((200, 0), (0, 200)):
            if abs(x + dx) <= 1000 and abs(y + dy) <= 1000:
                x2, y2 = x + dx, y + dy
                e = {'a': [x, y], 'b': [x2, y2], 'len': 200, 'kmh': 60 if (x % 400 == 0 or y % 400 == 0) else 40}
                if y == 0 and y2 == 0:
                    e['kmh'] = 90; e['cls'] = 'highway'
                    if x >= 0: e['toll'] = True
                if x == 1000 and x2 == 1000 and -600 <= y and y2 <= -200: e['unpaved'] = True; e['kmh'] = 30
                edges.append(e)
    poi = []
    for i in range(n_poi):
        x, y = rnd.randint(-1000, 1000), rnd.randint(-1000, 1000)
        poi.append({'id': i, 'name': f'Demo {cats[i % 16]} {i:04d}', 'cat': cats[i % 16], 'x': x, 'y': y, 'addr': addr(x, y), 'parking': rnd.random() > .4})
    j = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':')).encode()
    return {
        'maps/demo.json': j({'demo': True, 'extent': 1000, 'grid': 200, 'major': 400}),
        'routing/graph.json': j({'demo': True, 'attrs': ['cls', 'toll', 'unpaved'], 'nodes': nodes, 'edges': edges}),
        'search/index.json': j({'demo': True, 'items': [{'id': p['id'], 'k': (p['name'] + ' ' + p['addr']).lower()} for p in poi]}),
        'poi/poi.json': j({'demo': True, 'items': poi}),
        'alerts/alerts.json': j({'demo': True, 'version': '2026.11-demo', 'updatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': 'demo-generated', 'items': alerts()}),
        'cities/cities.json': j({'demo': True, 'items': [{'id': i + 1, 'name': n, 'x': x, 'y': y} for i, (n, x, y) in enumerate(CITIES)]}),
        'voice/voice.json': j({'demo': True, 'phrases': {'turnRight': '前方右轉', 'arrive': '您已抵達目的地'}}),
    }

def build(ver, n_poi, corrupt=False):
    d = f'{OUT}/TW-DEMO/{ver}'; os.makedirs(d, exist_ok=True)
    files, total = [], 0
    for path, data in content(n_poi).items():
        parts = []
        for i in range(0, len(data), PART):
            chunk = data[i:i + PART]; name = f"{path.replace('/', '__')}.{i // PART:03d}"
            open(f'{d}/{name}', 'wb').write(chunk); parts.append({'path': name, 'size': len(chunk), 'sha256': sha(chunk)})
        files.append({'path': path, 'size': len(data), 'sha256': sha(data), 'parts': parts}); total += len(data)
    pkg = sha(''.join(sorted(f['sha256'] for f in files)).encode())
    if corrupt: files[3]['parts'][0]['sha256'] = '0' * 64   # 刻意製造損壞，供驗收測試
    m = {'packageId': 'TW-DEMO', 'version': ver, 'schemaVersion': 1, 'region': 'Demo 區域（非真實地圖）', 'demo': True,
         'sizeBytes': total, 'sha256': pkg, 'createdAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'requires': [],
         'components': {'map': 'maps/demo.json', 'routing': 'routing/graph.json', 'search': 'search/index.json', 'poi': 'poi/poi.json', 'alerts': 'alerts/alerts.json', 'voice': 'voice/voice.json', 'cities': 'cities/cities.json'},
         'files': files}
    json.dump(m, open(f'{d}/manifest.json', 'w'), ensure_ascii=False, indent=1); return total

shutil.rmtree(OUT, ignore_errors=True)
vs = [('2026.11.01', 4000, False, None), ('2026.11.15', 6000, False, None), ('2026.11.99', 5000, True, 'corrupt')]
idx = {'packages': [{'id': 'TW-DEMO', 'region': 'Demo 區域（非真實地圖）', 'versions': []}]}
for v, n, c, t in vs:
    s = build(v, n, c); e = {'version': v, 'sizeBytes': s}
    if t: e['testOnly'] = t
    idx['packages'][0]['versions'].append(e); print(v, s, 'bytes')
json.dump(idx, open(f'{OUT}/index.json', 'w'), ensure_ascii=False, indent=1)
