#!/usr/bin/env python3
"""生成 PWA 图标（Pillow，纯本地）。

字形：直接采用 Tabler Icons `barcode`（icon-tabler-barcode）路径几何——
      四角圆角扫描括号 + 4 根竖条（含一根细矩形条），stroke 圆头圆角。
配色：黑白灰——灰黑对角渐变底（#2E3130→#151716，非纯黑）+ 纯白描边字形。

输出：
  public/icons/icon-192.png / icon-512.png / maskable-512.png / apple-touch-icon.png
  design-demo/icon-preview.png（预览图，含小尺寸可读性）
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "icons")
PREVIEW = os.path.join(ROOT, "design-demo", "icon-preview.png")

SS = 2          # 超采样倍数
CANVAS = 1024   # 逻辑画布

# 灰黑渐变（黑中带灰，不用纯黑）
GRAPHITE_1 = (46, 49, 48)   # #2E3130
GRAPHITE_2 = (21, 23, 22)   # #151716
WHITE = (255, 255, 255)

# Tabler barcode 24x24 视口路径（stroke-width 2，round cap/join）
# 每条路径 = 线段/圆弧序列；圆弧 (圆心, 半径, 起角, 终角)，角度制，y 轴向下
STROKE_W = 2.0
PATHS = [
    # 左上角括号
    [("line", (4, 7), (4, 6)), ("arc", (6, 6), 2, 180, 270), ("line", (6, 4), (8, 4))],
    # 左下角括号
    [("line", (4, 17), (4, 18)), ("arc", (6, 18), 2, 180, 90), ("line", (6, 20), (7, 20))],
    # 右上角括号
    [("line", (16, 4), (18, 4)), ("arc", (18, 6), 2, 270, 360), ("line", (20, 6), (20, 7))],
    # 右下角括号
    [("line", (16, 20), (18, 20)), ("arc", (18, 18), 2, 90, 0), ("line", (20, 18), (20, 17))],
    # 竖条 x3
    [("line", (7, 9), (7, 15))],
    [("line", (14, 9), (14, 15))],
    [("line", (17, 9), (17, 15))],
    # 细矩形条（闭合路径，stroke 覆盖后呈实心条）
    [("line", (11, 9), (10, 9)), ("line", (10, 9), (10, 15)),
     ("line", (10, 15), (11, 15)), ("line", (11, 15), (11, 9))],
]

# 字形可视外接（含描边）：x,y ∈ [3, 21]
EXTENT = 18.0


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1, c2):
    """对角渐变：小图插值后放大（快且平滑）。"""
    g = Image.new("RGB", (64, 64))
    px = g.load()
    for y in range(64):
        for x in range(64):
            px[x, y] = lerp(c1, c2, (x + y) / 126)
    return g.resize((size, size), Image.BICUBIC)


def _samples(seg, u, ox, oy, step):
    """把路径段采样成画布坐标点列。"""
    if seg[0] == "line":
        (_, p0, p1) = seg
        x0, y0 = ox + p0[0] * u, oy + p0[1] * u
        x1, y1 = ox + p1[0] * u, oy + p1[1] * u
        d = math.hypot(x1 - x0, y1 - y0)
        n = max(int(d / step), 1)
        for i in range(n + 1):
            t = i / n
            yield (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
    else:
        (_, (cx, cy), r, a0, a1) = seg
        px, py = ox + cx * u, oy + cy * u
        rad = r * u
        length = abs(math.radians(a1 - a0)) * rad
        n = max(int(length / step), 2)
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            yield (px + rad * math.cos(a), py + rad * math.sin(a))


def draw_barcode(draw, ox, oy, u, color):
    """沿路径盖圆戳，天然实现 round cap / round join。"""
    r = STROKE_W * u / 2
    step = max(r / 2.2, 1.5)
    for path in PATHS:
        for seg in path:
            for x, y in _samples(seg, u, ox, oy, step):
                draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def variant(gscale=0.62):
    size = CANVAS * SS
    img = gradient(size, GRAPHITE_1, GRAPHITE_2).convert("RGBA")
    draw = ImageDraw.Draw(img)
    u = size * gscale / EXTENT          # 可视外接（18 视口单位）占 gscale 比例
    ox = oy = size / 2 - 12 * u         # 24 视口中心对齐画布中心
    draw_barcode(draw, ox, oy, u, WHITE)

    # 左上柔光（玻璃质感）
    sheen = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.ellipse([-size * 0.25, -size * 0.45, size * 0.85, size * 0.55], fill=(255, 255, 255, 26))
    sheen = sheen.filter(ImageFilter.GaussianBlur(size * 0.06))
    img = Image.alpha_composite(img, sheen)
    return img.resize((CANVAS, CANVAS), Image.LANCZOS)


def sheet(icon):
    """预览图：大图 + 小尺寸可读性条。"""
    tile, pad = 384, 48
    w = pad * 2 + tile * 2 + 40
    h = pad * 2 + tile + 40
    canvas = Image.new("RGB", (w, h), (242, 243, 242))
    big = icon.resize((tile, tile), Image.LANCZOS)
    canvas.paste(big, (pad, pad), big)
    try:
        font = ImageFont.load_default(size=28)
    except TypeError:
        font = ImageFont.load_default()
    draw = ImageDraw.Draw(canvas)
    draw.text((pad + tile + 40 + 6, pad + 10), "Barcode Icon", fill=(60, 64, 62), font=font)
    sx, sy = pad + tile + 40 + 6, pad + 70
    for s in (24, 32, 48, 64):
        small = icon.resize((s, s), Image.LANCZOS)
        canvas.paste(small, (sx, sy), small)
        sx += s + 22
    canvas.save(PREVIEW)
    print("preview ->", PREVIEW)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    a = variant()
    sheet(a)

    a.resize((192, 192), Image.LANCZOS).save(f"{OUT_DIR}/icon-192.png")
    a.resize((512, 512), Image.LANCZOS).save(f"{OUT_DIR}/icon-512.png")
    variant(gscale=0.52).resize((512, 512), Image.LANCZOS) \
        .save(f"{OUT_DIR}/maskable-512.png")
    variant(gscale=0.60).resize((180, 180), Image.LANCZOS) \
        .save(f"{OUT_DIR}/apple-touch-icon.png")
    print("icons written to", OUT_DIR)


if __name__ == "__main__":
    main()
