"""產生像素零件的暫代圖，放在 assets/。

規格照設計需求書：48×48 透明畫布、動物側面朝右、腳踩第 44 列、1px 描邊 #1e1a24、
身體與尾巴只用四個代換色（#404040／#808080／#b0b0b0／#e0e0e0），由程式換成毛色。
這些圖是用幾何形狀畫的暫代品，設計師的正式圖交來時直接覆蓋同名檔案即可。

剪耳與三腳這類「拿掉一塊」的零件，用洋紅 #ff00ff 標示要擦掉的像素（見 assets/README.md）。

執行：python3 tools/make_placeholders.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

W = 48
FOOT = 44
OUT = Path(__file__).resolve().parent.parent / 'assets'

DARK, MID, LIGHT, HIGH = (64, 64, 64), (128, 128, 128), (176, 176, 176), (224, 224, 224)
OL = (0x1e, 0x1a, 0x24)
ERASE = (255, 0, 255)
CLEAR = (0, 0, 0, 0)


def tf(age, head=False, hc=(0, 0)):
    """成年座標轉成幼年：以腳底中心縮小，頭部再放大一點。"""
    s = 1 if age == 'adult' else .68

    def f(x, y):
        if head and age != 'adult':
            x, y = hc[0] + (x - hc[0]) * 1.18, hc[1] + (y - hc[1]) * 1.18
        return (24 + (x - 24) * s, FOOT - (FOOT - y) * s)
    return f


def shape(kind, pts, t):
    m = Image.new('1', (W, W), 0)
    d = ImageDraw.Draw(m)
    p = [t(*q) for q in pts]
    if kind == 'ellipse':
        d.ellipse([p[0], p[1]], fill=1)
    elif kind == 'rect':
        (x0, y0), (x1, y1) = p
        d.rectangle([round(x0), round(y0), round(x1), round(y1)], fill=1)
    elif kind == 'poly':
        d.polygon(p, fill=1)
    elif kind == 'line':
        d.line(p, fill=1, width=3 if t(0, 0)[0] == 24 - 24 * 1 else 2, joint='curve')
    return m


def px(m):
    return {(x, y) for y in range(W) for x in range(W) if m.getpixel((x, y))}


def union(*ms):
    s = set()
    for m in ms:
        s |= m
    return s


def ring(s):
    """4 鄰接的外框。"""
    o = set()
    for (x, y) in s:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in s and 0 <= q[0] < W and 0 <= q[1] < W:
                o.add(q)
    return o


def img_from(colors):
    im = Image.new('RGBA', (W, W), CLEAR)
    for (x, y), c in colors.items():
        im.putpixel((x, y), (*c, 255) if len(c) == 3 else c)
    return im


# ───────── 身體幾何（成年座標） ─────────
GEO = {
    'cat': dict(
        body=((8, 24), (35, 38)), head=((24, 10), (44, 31)), hc=(34, 20.5),
        muzzle=((37, 23), (44, 30)),
        ear_far=[(25, 15), (27, 3), (34, 12)], ear_near=[(35, 12), (40, 2), (44, 16)],
        legs_far=[((12, 34), (16, FOOT)), ((27, 34), (31, FOOT))],
        legs_near=[((17, 34), (21, FOOT)), ((32, 34), (36, FOOT))],
        belly_y=34, eye=(38, 20), nose=(44, 25), nose_c=(0xd9, 0x8a, 0x94),
        tails={
            'normal': [(10, 29), (5, 23), (5, 14)],
            'short': [(10, 29), (6, 27)],
            'kinked': [(10, 29), (4, 23), (5, 17), (9, 15)],
        },
        bulge=((13, 31), (31, 41)),
    ),
    'dog': dict(
        body=((7, 24), (34, 38)), head=((23, 10), (43, 31)), hc=(33, 20.5),
        snout=((38, 22), (46, 29)), muzzle=((38, 23), (46, 29)),
        ear_far=[(24, 15), (26, 3), (33, 12)], ear_near=[(34, 12), (39, 2), (44, 16)],
        legs_far=[((10, 34), (14, FOOT)), ((26, 34), (30, FOOT))],
        legs_near=[((15, 34), (19, FOOT)), ((31, 34), (35, FOOT))],
        belly_y=34, eye=(38, 20), nose=(46, 24), nose_c=OL,
        tails={
            'curled': [(9, 29), (5, 22), (8, 15), (14, 17)],
            'drooped': [(9, 30), (5, 35), (4, 40)],
            'short': [(9, 29), (5, 27)],
        },
        bulge=((12, 31), (30, 41)),
    ),
}


def body_parts(sp, age, mods=()):
    g = GEO[sp]
    t, th = tf(age), tf(age, True, g['hc'])
    body = px(shape('ellipse', g['body'], t))
    head = px(shape('ellipse', g['head'], th))
    if 'snout' in g:
        head |= px(shape('rect', g['snout'], th))
    ear_far = px(shape('poly', g['ear_far'], th))
    ear_near = px(shape('poly', g['ear_near'], th))
    legs_far = union(*[px(shape('rect', r, t)) for r in g['legs_far']])
    legs_near = [px(shape('rect', r, t)) for r in g['legs_near']]
    if 'tripod' in mods:
        # 拿掉靠近觀者的前腳，只留短短的上段，不畫傷口
        cut = legs_near[1]
        top = min(y for _, y in cut)
        legs_near[1] = {(x, y) for (x, y) in cut if y <= top + 2}
    near = union(*legs_near)
    bulge = px(shape('ellipse', g['bulge'], t)) if 'pregnant' in mods else set()

    for side, ear in (('right', ear_near), ('left', ear_far)):
        for cut in ('flat', 'v'):
            if f'ear-{side}-{cut}' in mods:
                top = min(y for _, y in ear)
                tipx = round(sum(x for x, y in ear if y == top) / len([1 for x, y in ear if y == top]))
                if cut == 'flat':
                    rm = {(x, y) for (x, y) in ear if y <= top + 2}
                else:
                    rm = {(x, y) for (x, y) in ear if y <= top + 3 - abs(x - tipx)}
                ear -= rm
                if side == 'right':
                    ear_near = ear
                else:
                    ear_far = ear

    allm = body | head | ear_far | ear_near | legs_far | near | bulge
    col = {}
    for p in allm:
        col[p] = MID
    for p in legs_far | ear_far:
        col[p] = DARK
    by = tf(age)(0, g['belly_y'])[1]
    for (x, y) in body | bulge:
        if y >= by:
            col[(x, y)] = LIGHT
    for p in px(shape('ellipse', g['muzzle'], th)):
        col[p] = LIGHT
    # 背與頭頂的高光
    for (x, y) in body | head:
        if (x, y - 1) not in allm or (x, y - 2) not in allm:
            col[(x, y)] = HIGH
    for p in ring(allm):
        col[p] = OL
    return col, allm


def body_img(sp, age, mods=()):
    return img_from(body_parts(sp, age, mods)[0])


def diff_layer(sp, age, mod):
    """零件 = 加上這個修改後與原本身體的差異；被拿掉的像素標成洋紅。"""
    a, _ = body_parts(sp, age)
    b, _ = body_parts(sp, age, (mod,))
    out = {}
    for p in set(a) | set(b):
        if p not in b:
            out[p] = ERASE
        elif a.get(p) != b[p]:
            out[p] = b[p]
    return img_from(out)


def tail_img(sp, age, kind):
    g = GEO[sp]
    _, allm = body_parts(sp, age)
    t = tf(age)
    m = Image.new('1', (W, W), 0)
    pts = [t(*q) for q in g['tails'][kind]]
    w = 3 if age == 'adult' else 2
    ImageDraw.Draw(m).line(pts, fill=1, width=w, joint='curve')
    tail = px(m)
    if kind == 'short':
        tail |= {(x + dx, y + dy) for (x, y) in tail for dx in (0, 1) for dy in (0, 1)}
    col = {p: MID for p in tail}
    end = pts[-1]
    for (x, y) in tail:
        if abs(x - end[0]) + abs(y - end[1]) <= 2:
            col[(x, y)] = HIGH
    for p in ring(tail):
        if p not in allm:
            col[p] = OL
    return img_from(col)


def face_img(sp, age):
    """大眼、雙高光與短嘴；固定色的表情最後疊，不會被毛色或花紋蓋住。"""
    g = GEO[sp]
    th = tf(age, True, g['hc'])
    im = Image.new('RGBA', (W, W), CLEAR)
    d = ImageDraw.Draw(im)

    def box(bounds):
        x0, y0 = th(*bounds[:2])
        x1, y1 = th(*bounds[2:])
        return tuple(round(v) for v in (x0, y0, x1, y1))

    cream, iris, shine = (255, 246, 229), (83, 58, 47), (255, 255, 251)
    # 身體朝右，臉稍微轉向觀者：遠側眼小一點，近側眼有兩個高光。
    for bounds in ((27, 16, 32, 23), (35, 15, 42, 25)):
        x0, y0, x1, y1 = box(bounds)
        d.ellipse((x0, y0, x1, y1), fill=(*OL, 255))
        d.ellipse((x0 + 1, y0 + 1, x1 - 1, y1 - 1), fill=(*cream, 255))
        d.ellipse((x0 + 1, y0 + 1, x1 - 1, y1 - 2), fill=(*iris, 255))
        d.ellipse((x0 + 2, y0 + 1, x1 - 1, y1 - 3), fill=(*OL, 255))
        d.rectangle((x0 + 1, y0 + 1, x0 + 2, y0 + 2), fill=(*shine, 255))
        d.point((x1 - 2, y1 - 3), fill=(*shine, 255))
    nx, ny = (round(v) for v in th(*g['nose']))
    d.line([(nx - 2, ny), (nx - 1, ny)], fill=(*g['nose_c'], 255), width=1)
    mx, my = (round(v) for v in th(42, 28))
    d.line([(mx - 2, my), (mx - 1, my + 1), (mx, my)], fill=(*OL, 255), width=1)
    bx, by = (round(v) for v in th(33, 26))
    d.line([(bx - 1, by), (bx, by)], fill=(225, 151, 146, 255), width=1)
    return im


# ───────── 花紋（固定顏色） ─────────
BLACK, ORANGE, WHITE, STRIPE = (0x26, 0x20, 0x22), (0xd9, 0x82, 0x2b), (0xf2, 0xef, 0xe8), (0x3b, 0x33, 0x30)


def noise(x, y, seed):
    return ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) % 100


def pattern_img(sp, age, kind):
    col, allm = body_parts(sp, age)
    inner = {p for p in allm if col[p] != OL}
    g = GEO[sp]
    by = tf(age)(0, g['belly_y'])[1]
    cx = tf(age)(22, 0)[0]
    out = {}
    for (x, y) in inner:
        upper = y < by
        if kind in ('tabby', 'brindle', 'white-tabby'):
            if upper and (x + (y // 3)) % 4 == 0:
                out[(x, y)] = STRIPE
            if kind == 'white-tabby' and not upper:
                out[(x, y)] = WHITE
        elif kind == 'calico':
            n = noise(x // 4, y // 4, 1)
            out[(x, y)] = ORANGE if n < 30 else BLACK if n < 55 else WHITE
        elif kind == 'tortie':
            n = noise(x // 2, y // 2, 2)
            out[(x, y)] = ORANGE if n < 45 else BLACK
        elif kind in ('tuxedo', 'piebald'):
            if noise(x // 6, y // 5, 3 if kind == 'tuxedo' else 4) < 40:
                out[(x, y)] = BLACK if kind == 'tuxedo' else (0x5a, 0x3a, 0x26)
        elif kind == 'socks':
            if y >= tf(age)(0, FOOT - 4)[1]:
                out[(x, y)] = WHITE
        elif kind == 'chest':
            if not upper and x > cx:
                out[(x, y)] = WHITE
    # 白胸與乳牛貓的胸口也帶白
    if kind == 'tuxedo':
        for (x, y) in inner:
            if not (y < by) and x > cx:
                out[(x, y)] = WHITE
    return img_from(out)


# ───────── 野生動物（固定顏色） ─────────
def wild(spec):
    allm, col = set(), {}
    for kind, pts, c in spec:
        m = Image.new('1', (W, W), 0)
        d = ImageDraw.Draw(m)
        if kind == 'ellipse':
            d.ellipse(pts, fill=1)
        elif kind == 'rect':
            d.rectangle(pts, fill=1)
        elif kind == 'poly':
            d.polygon(pts, fill=1)
        elif kind == 'line':
            d.line(pts, fill=1, width=2)
        s = px(m)
        if kind != 'dot':
            allm |= s
            for p in s:
                col[p] = c
        else:
            col[pts] = c
    for kind, pts, c in spec:
        if kind == 'dot':
            col[pts] = c
    for p in ring(allm):
        col.setdefault(p, OL)
        if p not in allm:
            col[p] = OL
    return img_from(col)


WILD = {
    'night-heron': [  # 黑冠麻鷺
        ('rect', (20, 34, 21, FOOT), (0xa8, 0xa3, 0x5a)), ('rect', (26, 34, 27, FOOT), (0xa8, 0xa3, 0x5a)),
        ('poly', [(6, 26), (14, 22), (14, 30)], (0x6e, 0x48, 0x30)),
        ('ellipse', (11, 18, 35, 35), (0x8a, 0x5a, 0x3c)),
        ('ellipse', (28, 9, 40, 22), (0xa0, 0x52, 0x2d)),
        ('rect', (29, 9, 36, 11), (0x2b, 0x22, 0x22)),
        ('poly', [(39, 15), (46, 16), (39, 18)], (0x4a, 0x4a, 0x4a)),
        ('dot', (36, 14), (0xe8, 0xc5, 0x3a)),
    ],
    'red-bellied-squirrel': [  # 赤腹松鼠
        ('ellipse', (3, 10, 19, 38), (0x6f, 0x6b, 0x66)),
        ('ellipse', (15, 26, 34, 41), (0x7d, 0x7a, 0x74)),
        ('ellipse', (18, 34, 32, 41), (0xb5, 0x56, 0x2e)),
        ('rect', (19, 40, 22, FOOT), (0x6f, 0x6b, 0x66)), ('rect', (28, 40, 31, FOOT), (0x6f, 0x6b, 0x66)),
        ('ellipse', (29, 19, 41, 31), (0x7d, 0x7a, 0x74)),
        ('poly', [(31, 21), (32, 15), (35, 20)], (0x6f, 0x6b, 0x66)),
        ('dot', (37, 23), (0x14, 0x12, 0x10)),
    ],
    'light-vented-bulbul': [  # 白頭翁
        ('poly', [(5, 29), (18, 28), (18, 34), (5, 33)], (0x7f, 0x84, 0x52)),
        ('ellipse', (15, 25, 34, 39), (0x8a, 0x8f, 0x5a)),
        ('ellipse', (18, 32, 33, 40), (0xd8, 0xd6, 0xc6)),
        ('rect', (23, 39, 24, FOOT), (0x3a, 0x34, 0x30)), ('rect', (27, 39, 28, FOOT), (0x3a, 0x34, 0x30)),
        ('ellipse', (27, 17, 38, 28), (0x2b, 0x2b, 0x2b)),
        ('ellipse', (27, 18, 32, 23), (0xf4, 0xf4, 0xf0)),
        ('poly', [(37, 21), (41, 22), (37, 24)], (0x2b, 0x2b, 0x2b)),
        ('dot', (35, 21), (0xf4, 0xf4, 0xf0)),
    ],
    'leopard-cat': [  # 石虎（敏感物種）：耳背白斑、額頭白線、身上斑點
        ('poly', [(2, 22), (5, 20), (14, 30), (12, 32)], (0x9c, 0x7a, 0x45)),
        ('rect', (14, 36, 16, FOOT), (0x9c, 0x7a, 0x45)), ('rect', (28, 36, 30, FOOT), (0x9c, 0x7a, 0x45)),
        ('ellipse', (10, 24, 34, 38), (0xb8, 0x93, 0x58)),
        ('ellipse', (29, 15, 42, 28), (0xb8, 0x93, 0x58)),
        ('poly', [(30, 18), (31, 10), (35, 16)], (0x3a, 0x2e, 0x22)),
        ('poly', [(37, 16), (40, 10), (41, 18)], (0x3a, 0x2e, 0x22)),
        ('ellipse', (36, 22, 43, 28), (0xee, 0xe6, 0xd2)),
        ('dot', (34, 16), (0xf4, 0xf0, 0xe4)), ('dot', (34, 17), (0xf4, 0xf0, 0xe4)),
        ('dot', (38, 20), (0x14, 0x12, 0x10)), ('dot', (42, 24), (0x3a, 0x2e, 0x22)),
        ('dot', (15, 28), (0x3a, 0x2e, 0x22)), ('dot', (19, 30), (0x3a, 0x2e, 0x22)), ('dot', (23, 27), (0x3a, 0x2e, 0x22)),
        ('dot', (27, 31), (0x3a, 0x2e, 0x22)), ('dot', (17, 34), (0x3a, 0x2e, 0x22)), ('dot', (24, 34), (0x3a, 0x2e, 0x22)),
        ('dot', (6, 23), (0x3a, 0x2e, 0x22)), ('dot', (9, 26), (0x3a, 0x2e, 0x22)),
    ],
    'swinhoe-lizard': [  # 斯文豪氏攀蜥
        ('line', [(2, 42), (10, 40), (16, 36)], (0x6a, 0x6b, 0x3e)),
        ('rect', (17, 37, 18, FOOT), (0x5a, 0x5b, 0x36)), ('rect', (30, 37, 31, FOOT), (0x5a, 0x5b, 0x36)),
        ('ellipse', (14, 30, 36, 39), (0x7d, 0x80, 0x48)),
        ('ellipse', (32, 27, 44, 36), (0x7d, 0x80, 0x48)),
        ('rect', (18, 31, 32, 32), (0xd8, 0xc8, 0x6a)),
        ('dot', (40, 30), (0x14, 0x12, 0x10)),
    ],
    # 只認出類群時用的剪影：一律淡紫灰，表示「還沒認出種」
    'group-bird': [
        ('poly', [(6, 30), (18, 28), (18, 34)], (0x8f, 0x8a, 0x9c)),
        ('ellipse', (14, 24, 34, 40), (0x8f, 0x8a, 0x9c)),
        ('ellipse', (27, 16, 39, 28), (0x8f, 0x8a, 0x9c)),
        ('poly', [(38, 21), (43, 22), (38, 24)], (0x5d, 0x58, 0x6a)),
        ('rect', (22, 39, 23, FOOT), (0x5d, 0x58, 0x6a)), ('rect', (27, 39, 28, FOOT), (0x5d, 0x58, 0x6a)),
        ('dot', (34, 21), (0x1e, 0x1a, 0x24)),
    ],
    'group-squirrel': [
        ('ellipse', (3, 10, 19, 38), (0x8f, 0x8a, 0x9c)),
        ('ellipse', (15, 26, 34, 41), (0x9e, 0x99, 0xab)),
        ('rect', (19, 40, 22, FOOT), (0x8f, 0x8a, 0x9c)), ('rect', (28, 40, 31, FOOT), (0x8f, 0x8a, 0x9c)),
        ('ellipse', (29, 19, 41, 31), (0x9e, 0x99, 0xab)),
        ('poly', [(31, 21), (32, 15), (35, 20)], (0x8f, 0x8a, 0x9c)),
        ('dot', (37, 23), (0x1e, 0x1a, 0x24)),
    ],
    'group-frog': [
        ('ellipse', (10, 30, 38, FOOT), (0x8f, 0x8a, 0x9c)),
        ('ellipse', (24, 24, 32, 32), (0x9e, 0x99, 0xab)), ('ellipse', (32, 24, 40, 32), (0x9e, 0x99, 0xab)),
        ('ellipse', (6, 38, 16, FOOT), (0x7f, 0x7a, 0x8c)),
        ('dot', (28, 27), (0x1e, 0x1a, 0x24)), ('dot', (36, 27), (0x1e, 0x1a, 0x24)),
    ],
}

PATTERNS = {'cat': ['tabby', 'calico', 'tortie', 'tuxedo', 'white-tabby'], 'dog': ['brindle', 'piebald', 'socks', 'chest']}


def main():
    OUT.mkdir(exist_ok=True)
    n = 0

    def save(im, name):
        nonlocal n
        im.save(OUT / name)
        n += 1

    for sp in ('cat', 'dog'):
        for age in ('adult', 'juvenile'):
            save(body_img(sp, age), f'{sp}-body-{age}-stand-0.png')
            save(face_img(sp, age), f'{sp}-face-normal-{age}-stand.png')
            for p in PATTERNS[sp]:
                save(pattern_img(sp, age, p), f'{sp}-pattern-{p}-{age}-stand.png')
            for k in GEO[sp]['tails']:
                save(tail_img(sp, age, k), f'{sp}-tail-{k}-{age}-stand.png')
            for side in ('left', 'right'):
                for cut in ('flat', 'v'):
                    save(diff_layer(sp, age, f'ear-{side}-{cut}'), f'{sp}-ear-{side}-{cut}-{age}-stand.png')
            for c in ('pregnant', 'tripod'):
                save(diff_layer(sp, age, c), f'{sp}-condition-{c}-{age}-stand.png')
    for k, spec in WILD.items():
        save(wild(spec), f'wild-{k}-0.png')
    print(f'寫出 {n} 個檔案到 {OUT}')


if __name__ == '__main__':
    main()

