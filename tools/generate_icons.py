#!/usr/bin/env python3
"""生成 PWA 图标（Pillow，纯本地）：icon-192/512、maskable-512、apple-touch-icon-180。"""
from PIL import Image, ImageDraw

OUT_DIR = "public/icons"
GREEN = (46, 107, 62, 255)
WHITE = (255, 255, 255, 255)

# 21x21 模块图案（确定性伪随机，模仿二维码外观）
FINDERS = [(0, 0), (14, 0), (0, 14)]


def qr_glyph(draw: ImageDraw.ImageDraw, ox: int, oy: int, unit: int):
    def m(x, y, w=1, h=1):
        draw.rectangle([ox + x * unit, oy + y * unit, ox + (x + w) * unit - 1, oy + (y + h) * unit - 1], fill=WHITE)

    # 三个定位角
    for fx, fy in FINDERS:
        m(fx, fy, 7, 7)
        draw.rectangle([ox + (fx + 1) * unit, oy + (fy + 1) * unit,
                        ox + (fx + 6) * unit - 1, oy + (fy + 6) * unit - 1], fill=GREEN)
        m(fx + 2, fy + 2, 3, 3)
    # 时序线
    for i in range(8, 13):
        if i % 2 == 0:
            m(i, 6)
            m(6, i)
    # 数据区（固定图案）
    pattern = [
        (9, 0), (11, 1), (8, 2), (12, 3), (9, 4), (10, 5),
        (16, 8), (18, 9), (20, 10), (17, 11), (19, 12), (16, 13),
        (0, 9), (2, 10), (4, 8), (1, 12), (3, 13), (5, 11),
        (8, 8), (10, 9), (12, 10), (9, 11), (11, 12), (8, 13),
        (8, 16), (10, 17), (12, 18), (9, 19), (11, 20), (8, 15),
        (14, 8), (15, 10), (14, 12), (15, 15), (17, 16), (19, 17),
        (15, 18), (18, 19), (16, 20), (13, 14), (14, 17), (15, 20),
    ]
    for x, y in pattern:
        m(x, y)


def render(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), GREEN if not maskable else GREEN)
    draw = ImageDraw.Draw(img)
    if maskable:
        # maskable：图形缩到安全区 80%
        glyph_size = int(size * 0.56)
    else:
        glyph_size = int(size * 0.68)
    unit = glyph_size // 21
    ox = (size - unit * 21) // 2
    oy = ox
    qr_glyph(draw, ox, oy, unit)
    return img


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    render(192).save(f"{OUT_DIR}/icon-192.png")
    render(512).save(f"{OUT_DIR}/icon-512.png")
    render(512, maskable=True).save(f"{OUT_DIR}/maskable-512.png")
    render(180).save(f"{OUT_DIR}/apple-touch-icon.png")
    print("icons written to", OUT_DIR)


if __name__ == "__main__":
    main()
