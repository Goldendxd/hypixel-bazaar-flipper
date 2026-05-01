import os, json, time, requests

WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]
TAX         = 0.0125
MIN_MARGIN  = 5.0
MIN_VOL     = 50_000
TOP_N       = 5
BUDGET      = 10_000_000

def fmt(n):
    if abs(n) >= 1e9: return f"{n/1e9:.2f}B"
    if abs(n) >= 1e6: return f"{n/1e6:.2f}M"
    if abs(n) >= 1e3: return f"{n/1e3:.1f}K"
    return f"{n:,.1f}"

def pretty(s):
    return " ".join(w.capitalize() for w in s.replace(":", "_").split("_"))

def icon_url(item_id):
    return f"https://sky.shiiyu.moe/item/{item_id}"

# ── Fetch + compute ───────────────────────────────────────────────────────────

data     = requests.get("https://api.hypixel.net/skyblock/bazaar", timeout=15).json()
products = data["products"]
updated  = data.get("lastUpdated", 0)
ts       = time.strftime("%I:%M:%S %p", time.gmtime(updated / 1000)) if updated else time.strftime("%I:%M:%S %p", time.gmtime())

results = []
for pid, prod in products.items():
    qs   = prod.get("quick_status", {})
    ask  = qs.get("buyPrice", 0)
    bid  = qs.get("sellPrice", 0)
    vol  = qs.get("buyMovingWeek", 0)
    svol = qs.get("sellMovingWeek", 0)
    if not ask or not bid or ask <= bid or vol < MIN_VOL: continue
    buy_o  = bid + 0.1
    sell_o = ask - 0.1
    profit = sell_o * (1 - TAX) - buy_o
    if profit <= 0: continue
    margin = profit / buy_o * 100
    if margin < MIN_MARGIN: continue
    qty  = max(1, min(int(BUDGET / buy_o), 71_680))
    results.append({
        "id": pid, "name": pretty(pid),
        "buy_o": buy_o, "sell_o": sell_o,
        "profit": profit, "margin": margin,
        "vol": vol, "svol": svol,
        "qty": qty, "total": profit * qty, "cost": buy_o * qty,
    })

results.sort(key=lambda x: x["total"], reverse=True)
results = results[:TOP_N]

if not results:
    print("No flips found.")
    exit(0)

# ── Build embeds ──────────────────────────────────────────────────────────────

# Header embed — matches the "Best Flips / data updated" line
header = {
    "title": "Best Flips",
    "description": f"✓ Data updated at {ts} ({len(products)} products)",
    "color": 0x6c8ebf,
    "footer": {"text": "ALWAYS DOUBLE CHECK INGAME PRICES FOR PRICE MANIPULATION"},
}

# One card embed per flip — matches the reference site card layout
cards = []
for i, f in enumerate(results):
    medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
    medal  = medals[i] if i < len(medals) else f"#{i+1}"
    cards.append({
        "author": {
            "name": f"{medal}  {f['name']}",
            "icon_url": icon_url(f["id"]),
        },
        "color": 0x00c896,
        "fields": [
            {"name": "BUY PRICE",   "value": f"**{fmt(f['buy_o'])}**",  "inline": True},
            {"name": "SELL PRICE",  "value": f"**{fmt(f['sell_o'])}**", "inline": True},
            {"name": "MARGIN",      "value": f"**{f['margin']:.1f}%**", "inline": True},
            {"name": "QUANTITY",    "value": f"**{f['qty']:,}**",        "inline": True},
            {"name": "TOTAL COST",  "value": f"**{fmt(f['cost'])}**",   "inline": True},
            {"name": "EST. PROFIT", "value": f"**+{fmt(f['total'])}**", "inline": True},
        ],
        "footer": {"text": f"Wk buy: {fmt(f['vol'])}  |  Wk sell: {fmt(f['svol'])}"},
        "thumbnail": {"url": icon_url(f["id"])},
    })

# Post header + all cards (max 10 embeds per request)
embeds = [header] + cards
for i in range(0, len(embeds), 10):
    r = requests.post(WEBHOOK_URL, json={"embeds": embeds[i:i+10]}, timeout=15)
    print(f"POST {r.status_code}")

print(f"[OK] Posted {len(results)} flips.")
