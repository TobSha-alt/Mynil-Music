import os
from PIL import Image, ImageDraw, ImageFilter

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

pad = 80
radius = 206
cx, cy = S // 2, S // 2

tile_mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(tile_mask).rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius, fill=255)

bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(bg)
for y in range(pad, S - pad):
    t = (y - pad) / max(1, (S - 2 * pad))
    r = int(19 - 10 * t)
    g = int(23 - 13 * t)
    b = int(34 - 18 * t)
    bg_draw.line([(pad, y), (S - pad, y)], fill=(r, g, b, 255))

glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse([cx - 260, cy - 260, cx + 260, cy + 260], fill=(16, 185, 129, 72))
glow_draw.ellipse([cx - 150, cy - 170, cx + 150, cy + 140], fill=(52, 211, 153, 56))
glow = glow.filter(ImageFilter.GaussianBlur(radius=70))
bg = Image.alpha_composite(bg, glow)

rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(rim).rounded_rectangle(
    [pad + 2, pad + 2, S - pad - 2, S - pad - 2],
    radius=radius - 2,
    outline=(255, 255, 255, 28),
    width=2,
)
bg = Image.alpha_composite(bg, rim)

wave_mask = Image.new("L", (S, S), 0)
wm_draw = ImageDraw.Draw(wave_mask)
bars = [
    (-134, 110, 31),
    (-67, 230, 31),
    (0, 380, 33),
    (67, 230, 31),
    (134, 110, 31),
]
for dx, bh, bw in bars:
    bx = cx + dx
    wm_draw.rounded_rectangle(
        [bx - bw // 2, cy - bh // 2, bx + bw // 2, cy + bh // 2],
        radius=bw // 2,
        fill=255,
    )

wave_glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
wg_draw = ImageDraw.Draw(wave_glow)
for dx, bh, bw in bars:
    bx = cx + dx
    wg_draw.rounded_rectangle(
        [bx - bw // 2, cy - bh // 2, bx + bw // 2, cy + bh // 2],
        radius=bw // 2,
        fill=(16, 185, 129, 120),
    )
wave_glow = wave_glow.filter(ImageFilter.GaussianBlur(radius=21))
bg = Image.alpha_composite(bg, wave_glow)

grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
top_y, bot_y = cy - 190, cy + 190
for y in range(top_y, bot_y + 1):
    t = (y - top_y) / max(1, (bot_y - top_y))
    if t < 0.5:
        k = t * 2
        r = int(110 + (16 - 110) * k)
        g = int(231 + (185 - 231) * k)
        b = int(183 + (129 - 183) * k)
    else:
        k = (t - 0.5) * 2
        r = int(16 + (13 - 16) * k)
        g = int(185 + (148 - 185) * k)
        b = int(129 + (136 - 129) * k)
    gd.line([(cx - 200, y), (cx + 200, y)], fill=(r, g, b, 255))

bars_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bars_layer.paste(grad, (0, 0), wave_mask)
bg = Image.alpha_composite(bg, bars_layer)

img.paste(bg, (0, 0), tile_mask)

out_dir = os.path.dirname(os.path.abspath(__file__))
ico_path = os.path.join(out_dir, "Sona.ico")
img.save(ico_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(f"Generated {ico_path}")
