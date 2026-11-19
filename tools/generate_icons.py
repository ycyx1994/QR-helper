#!/usr/bin/env python3
"""生成 PWA 图标（Pillow，纯本地）。

设计 A（默认落地）：对角绿色渐变底 + 白色圆角二维码字形 + 左上柔光。
变体 B：深绿夜色底 + 薄荷绿字形 + 横向扫描光束。
变体 C：浅色 tonal 底 + 深绿字形（亮色主题风格）。

输出：
  public/icons/icon-192.png / icon-512.png / maskable-512.png / apple-touch-icon.png
  design-demo/icon-variants.png（三变体对比图，供评审）
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "icons")
PREVIEW = os.path.join(ROOT, "design-demo", "icon-variants.png")

SS = 2          # 超采样倍数
CANVAS = 1024   # 逻辑画布

# 数据区固定图案（21x21 网格坐标）
PATTERN = [
    (9, 0), (11, 1), (8, 2), (12, 3), (9, 4), (10, 5),
    (16, 8), (18, 9), (20, 10), (17, 11), (19, 12), (16, 13),
    (0, 9), (2, 10), (4, 8), (1, 12), (3, 13), (5, 11),
    (8, 8), (10, 9), (12, 10), (9, 11), (11, 12), (8, 13),
    (8, 16), (10, 17), (12, 18), (9, 19), (11, 20), (8, 15),
    (14, 8), (15, 10), (14, 12), (15, 15), (17, 16), (19, 17),
    (15, 18), (18, 19), (16, 20), (13, 14), (14, 17), (15, 20),
]


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


def qr_glyph(draw, ox, oy, u, color):
    """圆角二维码字形：3 个圆角定位角 + 时序点 + 数据区。"""
    pad = u * 0.09

    def mod(x, y, w=1, h=1, r=None):
        draw.rounded_rectangle(
            [ox + x * u + pad, oy + y * u + pad, ox + (x + w) * u - pad, oy + (y + h) * u - pad],
            radius=u * 0.26 if r is None else r, fill=color)

    for fx, fy in ((0, 0), (14, 0), (0, 14)):
        draw.rounded_rectangle(
            [ox + fx * u + pad, oy + fy * u + pad, ox + (fx + 7) * u - pad, oy + (fy + 7) * u - pad],
            radius=u * 1.15, outline=color, width=int(u * 0.92))
        mod(fx + 2, fy + 2, 3, 3, r=u * 0.55)

    for i in range(8, 13, 2):
        mod(i, 6)
        mod(6, i)

    for x, y in PATTERN:
        mod(x, y)


def variant(bg1, bg2, glyph_color, gscale=0.62, beam=False):
    size = CANVAS * SS
    img = gradient(size, bg1, bg2).convert("RGBA")
    u = size * gscale / 21
    ox = oy = (size - u * 21) / 2
    by = oy + u * 10.5

    if beam:
        glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.rounded_rectangle([ox - u * 0.6, by - u * 0.55, ox + u * 21.6, by + u * 0.55],
                             radius=u * 0.55, fill=(255, 255, 255, 60))
        glow = glow.filter(ImageFilter.GaussianBlur(u * 0.5))
        img = Image.alpha_composite(img, glow)

    draw = ImageDraw.Draw(img)
    qr_glyph(draw, ox, oy, u, glyph_color)

    if beam:
        draw.rounded_rectangle([ox - u * 0.4, by - u * 0.16, ox + u * 21.4, by + u * 0.16],
                               radius=u * 0.16, fill=(255, 255, 255, 190))

    # 左上柔光
    sheen = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.ellipse([-size * 0.25, -size * 0.45, size * 0.85, size * 0.55], fill=(255, 255, 255, 26))
    sheen = sheen.filter(ImageFilter.GaussianBlur(size * 0.06))
    img = Image.alpha_composite(img, sheen)
    return img.resize((CANVAS, CANVAS), Image.LANCZOS)


def sheet(variants):
    """三变体对比图（含小尺寸可读性条）。"""
    tile, gap, pad = 320, 40, 40
    w = pad * 2 + tile * 3 + gap * 2
    h = pad * 2 + tile + 70 + 90
    canvas = Image.new("RGB", (w, h), (242, 244, 243))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.load_default(size=30)
    except TypeError:
        font = ImageFont.load_default()
    labels = ["A  Gradient QR (default)", "B  Night Beam", "C  Tonal Light"]
    for i, (v, label) in enumerate(zip(variants, labels)):
        x = pad + i * (tile + gap)
        icon = v.resize((tile, tile), Image.LANCZOS)
        canvas.paste(icon, (x, pad), icon)
        draw.text((x + 4, pad + tile + 12), label, fill=(60, 70, 64), font=font)
        # 小尺寸可读性
        sx = x
        for s in (24, 32, 48):
            small = v.resize((s, s), Image.LANCZOS)
            canvas.paste(small, (sx, pad + tile + 60), small)
            sx += s + 18
    canvas.save(PREVIEW)
    print("preview ->", PREVIEW)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    a = variant((69, 147, 91), (30, 77, 46), (255, 255, 255))
    b = variant((22, 52, 42), (11, 24, 18), (141, 220, 159), beam=True)
    c = variant((227, 245, 232), (200, 232, 210), (36, 90, 49))
    sheet([a, b, c])

    a.resize((192, 192), Image.LANCZOS).save(f"{OUT_DIR}/icon-192.png")
    a.resize((512, 512), Image.LANCZOS).save(f"{OUT_DIR}/icon-512.png")
    variant((69, 147, 91), (30, 77, 46), (255, 255, 255), gscale=0.52) \
        .resize((512, 512), Image.LANCZOS).save(f"{OUT_DIR}/maskable-512.png")
    variant((69, 147, 91), (30, 77, 46), (255, 255, 255), gscale=0.60) \
        .resize((180, 180), Image.LANCZOS).save(f"{OUT_DIR}/apple-touch-icon.png")
    print("icons written to", OUT_DIR)


if __name__ == "__main__":
    main()
