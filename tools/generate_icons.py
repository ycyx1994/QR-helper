#!/usr/bin/env python3
"""生成 PWA 图标（Pillow，纯本地）。

配色：黑白灰——灰黑对角渐变底（#2E3130→#151716，非纯黑）+ 纯白字形。
字形：极简风格（参考 lucide scan-qr-code / remixicon qr-code-line），
      三个定位角 + 极少量数据点，不铺满网格。

变体（字形风格对比，默认落地 A）：
  A QR Line     — 三 finder 描边框+中心块 + 5 稀疏数据点（remixicon qr-code-line 风）
  B Scan Corner — 四角 L 括号 + 3 实心 finder 小方 + 2 小点（lucide scan-qr-code 风）
  C Line Art    — 三 finder 细描边框（无中心块）+ 4 小点

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

# 灰黑渐变（黑中带灰，不用纯黑）
GRAPHITE_1 = (46, 49, 48)   # #2E3130
GRAPHITE_2 = (21, 23, 22)   # #151716
WHITE = (255, 255, 255)


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


def _dot(draw, ox, oy, u, gx, gy, s, color):
    """网格 (gx,gy) 处画边长 s*u 的居中圆角点。"""
    pad = (1 - s) / 2
    draw.rounded_rectangle(
        [ox + (gx + pad) * u, oy + (gy + pad) * u, ox + (gx + pad + s) * u, oy + (gy + pad + s) * u],
        radius=u * s * 0.3, fill=color)


def glyph_qrline(draw, ox, oy, u, color):
    """A：三 finder（描边框+中心块）+ 5 稀疏点。"""
    pad = u * 0.10
    for fx, fy in ((0, 0), (14, 0), (0, 14)):
        draw.rounded_rectangle(
            [ox + fx * u + pad, oy + fy * u + pad, ox + (fx + 7) * u - pad, oy + (fy + 7) * u - pad],
            radius=u * 1.15, outline=color, width=int(u * 0.78))
        draw.rounded_rectangle(
            [ox + (fx + 2.2) * u, oy + (fy + 2.2) * u, ox + (fx + 4.8) * u, oy + (fy + 4.8) * u],
            radius=u * 0.62, fill=color)
    for gx, gy, s in ((10, 10, 1.0), (13, 13, 0.72), (17, 17, 1.0), (19.2, 19, 0.66), (18, 13, 0.72)):
        _dot(draw, ox, oy, u, gx, gy, s, color)


def glyph_scancorner(draw, ox, oy, u, color):
    """B：四角 L 括号 + 3 实心 finder 小方 + 2 小点。"""
    arm, th = 3.8, 0.85
    r = th * u / 2
    # 四角 L 形：(水平臂矩形, 垂直臂矩形) 网格坐标，臂均朝图形内侧延伸
    corners = (
        ((0, 0, arm, th), (0, 0, th, arm)),                        # 左上
        ((21 - arm, 0, 21, th), (21 - th, 0, 21, arm)),            # 右上
        ((0, 21 - th, arm, 21), (0, 21 - arm, th, 21)),            # 左下
        ((21 - arm, 21 - th, 21, 21), (21 - th, 21 - arm, 21, 21)),  # 右下
    )
    for hrect, vrect in corners:
        for x0, y0, x1, y1 in (hrect, vrect):
            draw.rounded_rectangle([ox + x0 * u, oy + y0 * u, ox + x1 * u, oy + y1 * u],
                                   radius=r, fill=color)
    for fx, fy in ((1.9, 1.9), (16.4, 1.9), (1.9, 16.4)):
        draw.rounded_rectangle(
            [ox + fx * u, oy + fy * u, ox + (fx + 2.7) * u, oy + (fy + 2.7) * u],
            radius=u * 0.72, fill=color)
    for gx, gy, s in ((9.7, 9.7, 1.35), (16.8, 16.8, 2.1), (18.6, 11.8, 0.85)):
        _dot(draw, ox, oy, u, gx, gy, s, color)


def glyph_lineart(draw, ox, oy, u, color):
    """C：三 finder 细描边框（无中心块）+ 4 小点。"""
    pad = u * 0.10
    for fx, fy in ((0, 0), (14, 0), (0, 14)):
        draw.rounded_rectangle(
            [ox + fx * u + pad, oy + fy * u + pad, ox + (fx + 7) * u - pad, oy + (fy + 7) * u - pad],
            radius=u * 1.3, outline=color, width=int(u * 0.55))
    for gx, gy, s in ((10, 10, 1.05), (13, 12, 0.8), (17, 17, 1.25), (18, 10, 0.8)):
        _dot(draw, ox, oy, u, gx, gy, s, color)


def variant(glyph, gscale=0.62):
    size = CANVAS * SS
    img = gradient(size, GRAPHITE_1, GRAPHITE_2).convert("RGBA")
    draw = ImageDraw.Draw(img)
    u = size * gscale / 21
    ox = oy = (size - u * 21) / 2
    glyph(draw, ox, oy, u, WHITE)

    # 左上柔光（玻璃质感）
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
    canvas = Image.new("RGB", (w, h), (242, 243, 242))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.load_default(size=30)
    except TypeError:
        font = ImageFont.load_default()
    labels = ["A  QR Line (default)", "B  Scan Corner", "C  Line Art"]
    for i, (v, label) in enumerate(zip(variants, labels)):
        x = pad + i * (tile + gap)
        icon = v.resize((tile, tile), Image.LANCZOS)
        canvas.paste(icon, (x, pad), icon)
        draw.text((x + 4, pad + tile + 12), label, fill=(60, 64, 62), font=font)
        sx = x
        for s in (24, 32, 48):
            small = v.resize((s, s), Image.LANCZOS)
            canvas.paste(small, (sx, pad + tile + 60), small)
            sx += s + 18
    canvas.save(PREVIEW)
    print("preview ->", PREVIEW)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    a = variant(glyph_qrline)
    b = variant(glyph_scancorner)
    c = variant(glyph_lineart)
    sheet([a, b, c])

    a.resize((192, 192), Image.LANCZOS).save(f"{OUT_DIR}/icon-192.png")
    a.resize((512, 512), Image.LANCZOS).save(f"{OUT_DIR}/icon-512.png")
    variant(glyph_qrline, gscale=0.52).resize((512, 512), Image.LANCZOS) \
        .save(f"{OUT_DIR}/maskable-512.png")
    variant(glyph_qrline, gscale=0.60).resize((180, 180), Image.LANCZOS) \
        .save(f"{OUT_DIR}/apple-touch-icon.png")
    print("icons written to", OUT_DIR)


if __name__ == "__main__":
    main()
