import os
from PIL import Image

SRC = r'd:\Github work\Hypixel_shenanigans\Golden Flipper Logo with Angular Icon Design.png'
PUB = r'd:\Github work\Hypixel_shenanigans\website\public'
APP = r'd:\Github work\Hypixel_shenanigans\website\app'
os.makedirs(PUB, exist_ok=True)

img = Image.open(SRC).convert('RGBA')
# flatten onto white, then threshold non-white content
bg = Image.new('RGBA', img.size, (255, 255, 255, 255))
flat = Image.alpha_composite(bg, img).convert('RGB')
w, h = flat.size
px = flat.load()

def is_ink(x, y):
    r, g, b = px[x, y]
    return r < 245 or g < 245 or b < 245

# row profile of ink
rows = []
for y in range(0, h, 2):
    cnt = sum(1 for x in range(0, w, 4) if is_ink(x, y))
    rows.append((y, cnt))

inked = [y for y, c in rows if c > 2]
top, bottom = min(inked), max(inked)

# find the largest vertical gap between ink clusters (icon vs wordmark)
gaps = []
prev = None
for y in inked:
    if prev is not None and y - prev > 10:
        gaps.append((y - prev, prev, y))
    prev = y
gaps.sort(reverse=True)
split_top, split_bot = (gaps[0][1], gaps[0][2]) if gaps else (bottom, bottom)

def col_bbox(y0, y1):
    xs = []
    for x in range(0, w, 2):
        for y in range(y0, y1, 4):
            if is_ink(x, y):
                xs.append(x)
                break
    return (min(xs), max(xs)) if xs else (0, w)

# icon = upper cluster
ix0, ix1 = col_bbox(top, split_top + 2)
pad = 14
icon = img.crop((max(0, ix0 - pad), max(0, top - pad), min(w, ix1 + pad), min(h, split_top + pad)))
# make square canvas, transparent
side = max(icon.size)
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
canvas.paste(icon, ((side - icon.size[0]) // 2, (side - icon.size[1]) // 2), icon)
canvas.resize((256, 256), Image.LANCZOS).save(os.path.join(PUB, 'logo-mark.png'))

# full lockup trimmed
fx0, fx1 = col_bbox(top, bottom + 1)
full = img.crop((max(0, fx0 - pad), max(0, top - pad), min(w, fx1 + pad), min(h, bottom + pad)))
full.save(os.path.join(PUB, 'logo-full.png'))

# favicon: white background tile with the mark
fav = Image.new('RGBA', (side, side), (255, 255, 255, 255))
fav.paste(icon, ((side - icon.size[0]) // 2, (side - icon.size[1]) // 2), icon)
fav.resize((64, 64), Image.LANCZOS).save(os.path.join(APP, 'icon.png'))

print('icon bbox', ix0, top, ix1, split_top, '| full', fx0, top, fx1, bottom)
print('saved logo-mark.png 256px, logo-full.png, app/icon.png 64px')
