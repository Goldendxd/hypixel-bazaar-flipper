"""
Webhook-only fallback for GitHub Actions (no discord.py needed).
Posts top order flips to a Discord webhook every 5 min.
"""
import os, json, time, requests

WEBHOOK_URL = os.environ["DISCORD_WEBHOOK_URL"]
TAX = 0.0125
MIN_MARGIN = 5.0
MIN_VOL    = 50_000
TOP_N      = 5
BUDGET     = 10_000_000

def fmt(n):
    if abs(n) >= 1e9: return f"{n/1e9:.2f}B"
    if abs(n) >= 1e6: return f"{n/1e6:.2f}M"
    if abs(n) >= 1e3: return f"{n/1e3:.1f}k"
    return f"{n:,.1f}"

def pretty(s):
    return " ".join(w.capitalize() for w in s.replace(":", "_").split("_"))

data = requests.get("https://api.hypixel.net/skyblock/bazaar", timeout=15).json()
products = data["products"]

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
    qty   = max(1, min(int(BUDGET / buy_o), 71_680))
    results.append({
        "name": pretty(pid), "buy_o": buy_o, "sell_o": sell_o,
        "profit": profit, "margin": margin, "vol": vol, "svol": svol,
        "qty": qty, "total": profit * qty, "cost": buy_o * qty,
    })

results.sort(key=lambda x: x["total"], reverse=True)
results = results[:TOP_N]

if not results:
    print("No flips found.")
    exit(0)

medals = ["1st", "2nd", "3rd", "4th", "5th"]
embeds = [{
    "title": "Bazaar Flip Finder",
    "description": f"Top {len(results)} order flips | Budget: **{fmt(BUDGET)}**\nBuy order above top bid, sell below lowest ask | 1.25% tax included",
    "color": 0x6c8ebf,
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}]

for i, f in enumerate(results):
    embeds.append({
        "title": f"#{i+1}  {f['name']}",
        "color": 0x00c896,
        "fields": [
            {"name": "BUY PRICE",  "value": f"**{fmt(f['buy_o'])}**",  "inline": True},
            {"name": "SELL PRICE", "value": f"**{fmt(f['sell_o'])}**", "inline": True},
            {"name": "MARGIN",     "value": f"**{f['margin']:.1f}%**", "inline": True},
            {"name": "QUANTITY",   "value": f"**{f['qty']:,}**",       "inline": True},
            {"name": "TOTAL COST", "value": f"**{fmt(f['cost'])}**",   "inline": True},
            {"name": "EST. PROFIT","value": f"**+{fmt(f['total'])}**", "inline": True},
        ],
        "footer": {"text": f"Wk buy vol: {fmt(f['vol'])}  |  Wk sell vol: {fmt(f['svol'])}"},
    })

# Discord max 10 embeds per message
for i in range(0, len(embeds), 10):
    r = requests.post(WEBHOOK_URL, json={"embeds": embeds[i:i+10]}, timeout=15)
    print(f"Webhook: {r.status_code}")

print(f"[OK] Posted {len(results)} flips.")
