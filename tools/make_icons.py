#!/usr/bin/env python3
"""產生 PWA 圖示（純 Python，無外部相依）：python3 tools/make_icons.py"""
import zlib, struct, os
OUT = 'assets/icons'
BLUE = (18, 89, 195); DARK = (14, 20, 27); WHITE = (255, 255, 255)
ARROW = [(0.50, 0.17), (0.75, 0.80), (0.50, 0.65), (0.25, 0.80)]   # 導航箭頭（單位座標）

def inside(poly, x, y):
    c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

def render(size, maskable=False, rounded=True, ss=3):
    scale = 0.78 if maskable else 1.0                     # maskable：內容縮進安全區
    poly = [(0.5 + (px - 0.5) * scale, 0.5 + (py - 0.5) * scale) for px, py in ARROW]
    r = 0.22 if (rounded and not maskable) else 0.0
    rows = []
    for j in range(size):
        row = bytearray()
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(ss):
                for si in range(ss):
                    x = (i + (si + .5) / ss) / size; y = (j + (sj + .5) / ss) / size
                    ok = True
                    if r:
                        dx = max(r - x, x - (1 - r), 0); dy = max(r - y, y - (1 - r), 0); ok = dx * dx + dy * dy <= r * r
                    if not ok: continue
                    col = WHITE if inside(poly, x, y) else BLUE
                    acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += 1
            n = ss * ss
            if acc[3]: row += bytes((acc[0] // acc[3], acc[1] // acc[3], acc[2] // acc[3], 255 * acc[3] // n))
            else: row += bytes((0, 0, 0, 0))
        rows.append(b'\x00' + bytes(row))
    raw = b''.join(rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

os.makedirs(OUT, exist_ok=True)
for name, size, kw in [('icon-512.png', 512, {}), ('icon-192.png', 192, {}), ('icon-maskable-512.png', 512, {'maskable': True}), ('apple-touch-icon-180.png', 180, {'rounded': False}), ('favicon-32.png', 32, {})]:
    open(f'{OUT}/{name}', 'wb').write(render(size, **kw)); print(name, size)
