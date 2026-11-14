#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/Sona.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
ICONSET="/tmp/SonaIcon_$$.iconset"

mkdir -p "$MACOS" "$RESOURCES" "$ICONSET"

# Generate sleek minimalist obsidian + luminous emerald harmonic waveform macOS icon
python3 - <<PY
from PIL import Image, ImageDraw, ImageFilter

S = 2048  # 2x supersampled for razor-sharp anti-aliasing
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

pad = 160
radius = 412
cx, cy = S // 2, S // 2

# Base obsidian tile mask
tile_mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(tile_mask).rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius, fill=255)

# Vertical dark studio obsidian gradient
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(bg)
for y in range(pad, S - pad):
    t = (y - pad) / max(1, (S - 2 * pad))
    r = int(19 - 10 * t)
    g = int(23 - 13 * t)
    b = int(34 - 18 * t)
    bg_draw.line([(pad, y), (S - pad, y)], fill=(r, g, b, 255))

# Ambient emerald aura softly diffused behind center mark
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse([cx - 520, cy - 520, cx + 520, cy + 520], fill=(16, 185, 129, 72))
glow_draw.ellipse([cx - 300, cy - 340, cx + 300, cy + 280], fill=(52, 211, 153, 56))
glow = glow.filter(ImageFilter.GaussianBlur(radius=140))

bg = Image.alpha_composite(bg, glow)

# Crisp inner glass rim around squircle edge
rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(rim).rounded_rectangle(
    [pad + 3, pad + 3, S - pad - 3, S - pad - 3],
    radius=radius - 3,
    outline=(255, 255, 255, 28),
    width=4,
)
bg = Image.alpha_composite(bg, rim)

# Minimalist 5-bar symmetric harmonic waveform with mint-to-teal vertical gradient
wave_mask = Image.new("L", (S, S), 0)
wm_draw = ImageDraw.Draw(wave_mask)
bars = [
    (-268, 220, 62),
    (-134, 460, 62),
    (0,    760, 66),
    (134,  460, 62),
    (268,  220, 62),
]
for dx, bh, bw in bars:
    bx = cx + dx
    wm_draw.rounded_rectangle(
        [bx - bw // 2, cy - bh // 2, bx + bw // 2, cy + bh // 2],
        radius=bw // 2,
        fill=255,
    )

# Soft halo around the waveform bars
wave_glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
wg_draw = ImageDraw.Draw(wave_glow)
for dx, bh, bw in bars:
    bx = cx + dx
    wg_draw.rounded_rectangle(
        [bx - bw // 2, cy - bh // 2, bx + bw // 2, cy + bh // 2],
        radius=bw // 2,
        fill=(16, 185, 129, 120),
    )
wave_glow = wave_glow.filter(ImageFilter.GaussianBlur(radius=42))
bg = Image.alpha_composite(bg, wave_glow)

# Crisp mint -> emerald -> deep teal fill for bars
grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
top_y, bot_y = cy - 380, cy + 380
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
    gd.line([(cx - 400, y), (cx + 400, y)], fill=(r, g, b, 255))

bars_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bars_layer.paste(grad, (0, 0), wave_mask)
bg = Image.alpha_composite(bg, bars_layer)

# Clip whole composition cleanly to squircle tile
img.paste(bg, (0, 0), tile_mask)

for s in [16, 32, 64, 128, 256, 512]:
    resized = img.resize((s, s), Image.Resampling.LANCZOS)
    resized.save(f"$ICONSET/icon_{s}x{s}.png")
    if s <= 512:
        resized2 = img.resize((s * 2, s * 2), Image.Resampling.LANCZOS)
        resized2.save(f"$ICONSET/icon_{s}x{s}@2x.png")
PY

iconutil -c icns "$ICONSET" -o "$RESOURCES/AppIcon.icns"
rm -rf "$ICONSET"

cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>Sona</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.toby.sona</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Sona</string>
    <key>CFBundleDisplayName</key>
    <string>Sona</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
PLIST

swiftc -O -framework Cocoa -framework WebKit "$ROOT/native/SonaApp.swift" -o "$MACOS/Sona"
codesign --force --deep --sign - "$APP_DIR"
echo "Built $APP_DIR"
