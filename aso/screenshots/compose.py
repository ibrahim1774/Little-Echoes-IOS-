"""Compose App Store screenshot backgrounds (1284x2778) from raw simulator shots.

Usage: python3 compose.py raw_1.png raw_2.png ...  -> iphone_1.png, iphone_2.png ...

Odd screenshots get a coral background (white heading), even ones cream (dark
heading). The top 600px stay empty: the vibe-aso renderer burns the localized
heading there.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

W, H = 1284, 2778
PHONE_W = 1010
PHONE_TOP = 640
BEZEL = 26
RADIUS = 150
CORAL = ((255, 154, 139), (255, 94, 98))
CREAM = ((255, 249, 240), (255, 236, 222))
OUT = Path(__file__).parent


def gradient(top, bottom):
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return m


def compose(raw_path, index):
    bg = gradient(*(CORAL if index % 2 else CREAM))
    shot = Image.open(raw_path).convert('RGB')
    inner_w = PHONE_W - 2 * BEZEL
    shot = shot.resize((inner_w, round(shot.height * inner_w / shot.width)), Image.LANCZOS)
    phone_h = shot.height + 2 * BEZEL
    left = (W - PHONE_W) // 2

    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [left, PHONE_TOP + 30, left + PHONE_W, PHONE_TOP + 30 + phone_h], RADIUS, fill=(80, 30, 30, 90))
    bg.paste(shadow.filter(ImageFilter.GaussianBlur(40)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(40)))

    body = Image.new('RGB', (PHONE_W, phone_h), (28, 28, 30))
    body.paste(shot, (BEZEL, BEZEL), rounded_mask(shot.size, RADIUS - BEZEL))
    bg.paste(body, (left, PHONE_TOP), rounded_mask(body.size, RADIUS))
    bg.save(OUT / f'iphone_{index}.png')


if __name__ == '__main__':
    for i, p in enumerate(sys.argv[1:], start=1):
        compose(p, i)
        print('wrote', OUT / f'iphone_{i}.png')
