"""
Hypixel SkyBlock Bazaar flip alert bot.
Triggered every 5 minutes via GitHub Actions.

Hypixel API field semantics (confirmed from live data):
  quick_status.buyPrice  = lowest ASK  (you pay this to buy instantly)
  quick_status.sellPrice = highest BID (you receive this selling instantly)
  buyPrice > sellPrice is normal — spread = buyPrice - sellPrice

Environment variables required:
  DISCORD_WEBHOOK_URL  — full Discord webhook URL
"""

import os
import json
import time
import requests

WEBHOOK_URL: str = os.environ["DISCORD_WEBHOOK_URL"]

ORDER_MIN_MARGIN_PCT = 5.0
ORDER_MIN_WEEKLY_VOL = 50_000
TOP_N = 5
TAX = 0.0125

BAZAAR_URL = "https://api.hypixel.net/skyblock/bazaar"
HEADERS = {"User-Agent": "HypixelBazaarFlipBot/1.0"}
TIMEOUT = 15

COLOR_ORDER = 0x60A5FA
COLOR_SNIPE = 0xF59E0B

def fmt_coins(n: float) -> str:
    if abs(n) >= 1_000_000_000:
        return f"{n/1_000_000_000:.2f}B"
    if abs(n) >= 1_000_000:
        return f"{n/1_000_000:.2f}M"
    if abs(n) >= 1_000:
        return f"{n/1_000:.1f}k"
    return f"{n:,.0f}"

def pretty_name(item_id: str) -> str:
    return " ".join(w.capitalize() for w in item_id.replace(":", "_").split("_"))

def safe_get(url: str, params: dict | None = None) -> dict | None:
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"[WARN] GET {url} failed: {exc}")
        return None

def fetch_bazaar() -> dict:
    data = safe_get(BAZAAR_URL)
    if not data or not data.get("success"):
        raise RuntimeError("Failed to fetch Bazaar data")
    return data["products"]

def compute_order_flips(products: dict) -> list[dict]:
    """
    Order flip: post buy order just above top bid (sellPrice + 0.1),
    sell order just below lowest ask (buyPrice - 0.1).
    Profit = (buyPrice - 0.1) * (1 - TAX) - (sellPrice + 0.1)
    """
    results = []
    for pid, prod in products.items():
        qs = prod.get("quick_status", {})
        ask = qs.get("buyPrice", 0)    # lowest ask — what you pay to buy instantly
        bid = qs.get("sellPrice", 0)   # highest bid — what you get selling instantly
        weekly_vol = qs.get("buyMovingWeek", 0)

        if not ask or not bid or ask <= bid:
            continue
        if weekly_vol < ORDER_MIN_WEEKLY_VOL:
            continue

        buy_order  = bid + 0.1
        sell_order = ask - 0.1
        profit = sell_order * (1 - TAX) - buy_order
        if profit <= 0:
            continue

        margin = (profit / buy_order) * 100
        if margin < ORDER_MIN_MARGIN_PCT:
            continue

        results.append({
            "id":         pid,
            "name":       pretty_name(pid),
            "buy_order":  buy_order,
            "sell_order": sell_order,
            "profit":     profit,
            "margin":     margin,
            "weekly_vol": weekly_vol,
        })

    results.sort(key=lambda x: x["profit"], reverse=True)
    return results[:TOP_N]

def build_order_embed(flips: list[dict]) -> dict:
    fields = []
    for f in flips:
        fields.append({
            "name": f"💰 {f['name']}",
            "value": (
                f"Buy order: **{fmt_coins(f['buy_order'])}**  →  Sell order: **{fmt_coins(f['sell_order'])}**\n"
                f"Profit/item: **{fmt_coins(f['profit'])}** · Margin: **{f['margin']:.1f}%**\n"
                f"Weekly vol: {fmt_coins(f['weekly_vol'])}"
            ),
            "inline": False,
        })
    return {
        "title": "📋 Top Bazaar Order Flips",
        "description": "Post buy order above top bid, sell order below lowest ask. Profit after 1.25% tax.",
        "color": COLOR_ORDER,
        "fields": fields,
        "footer": {"text": "Hypixel SkyBlock Bazaar · updates every 5 min"},
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

def send_webhook(embeds: list[dict]) -> None:
    payload = {"embeds": embeds}
    r = requests.post(
        WEBHOOK_URL,
        data=json.dumps(payload),
        headers={"Content-Type": "application/json"},
        timeout=TIMEOUT,
    )
    if r.status_code not in (200, 204):
        raise RuntimeError(f"Webhook POST failed: {r.status_code} — {r.text}")

def main() -> None:
    print("[*] Fetching Bazaar data…")
    products = fetch_bazaar()
    print(f"    Got {len(products)} products")

    print("[*] Computing order flips…")
    orders = compute_order_flips(products)
    print(f"    Found {len(orders)} order flip(s)")

    if not orders:
        print("[*] No opportunities found — nothing posted.")
        return

    send_webhook([build_order_embed(orders)])
    print(f"[✓] Posted {len(orders)} flips to Discord.")

if __name__ == "__main__":
    main()
