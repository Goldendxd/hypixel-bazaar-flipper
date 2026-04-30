"""
Hypixel SkyBlock Bazaar & Auction House flip alert bot.
Runs as a one-shot script (no long-running process needed).
Triggered every 5 minutes via GitHub Actions.

Environment variables required:
  DISCORD_WEBHOOK_URL  — full Discord webhook URL
"""

import os
import json
import time
import requests

# ─────────────────────────── Config ──────────────────────────────────────────

WEBHOOK_URL: str = os.environ["DISCORD_WEBHOOK_URL"]

# Bazaar instant flip: only include if profit > this value (coins)
INSTANT_MIN_PROFIT = 500_000
# Bazaar instant flip: only include if weekly buy volume > this
INSTANT_MIN_WEEKLY_VOL = 5_000_000

# Bazaar order flip: min margin % and min weekly volume
ORDER_MIN_MARGIN_PCT = 15.0
ORDER_MIN_WEEKLY_VOL = 1_000_000

# AH snipe: min profit and max ratio vs median price
AH_MIN_PROFIT = 1_000_000
AH_MAX_RATIO = 0.6  # BIN price must be < median * this

# Number of top results to post per category
TOP_N = 3

# 1.25% tax applied to filled sell orders
TAX = 0.0125

# Hypixel API endpoints (no key needed for Bazaar / AH)
BAZAAR_URL = "https://api.hypixel.net/skyblock/bazaar"
AH_URL = "https://api.hypixel.net/skyblock/auctions"  # page param: ?page=N

# SkyCoflent median price API (free, no key)
COFLNET_MEDIAN_URL = "https://sky.coflnet.com/api/item/price/{item_tag}/current"

HEADERS = {"User-Agent": "HypixelBazaarFlipBot/1.0"}
TIMEOUT = 15  # seconds per request

# Discord embed colours
COLOR_INSTANT = 0x4ADE80   # green
COLOR_ORDER   = 0x60A5FA   # blue
COLOR_SNIPE   = 0xF59E0B   # amber

# ─────────────────────────── Utilities ───────────────────────────────────────

def fmt_coins(n: float) -> str:
    """Human-readable coin amount: 1,234,567 → '1.23M'."""
    if abs(n) >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if abs(n) >= 1_000:
        return f"{n / 1_000:.1f}k"
    return f"{n:,.0f}"


def pretty_name(item_id: str) -> str:
    """INK_SACK → Ink Sack."""
    return " ".join(w.capitalize() for w in item_id.split("_"))


def safe_get(url: str, params: dict | None = None) -> dict | None:
    """GET with error handling; returns None on failure."""
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"[WARN] GET {url} failed: {exc}")
        return None

# ─────────────────────────── Bazaar fetch ────────────────────────────────────

def fetch_bazaar() -> dict:
    """Return the 'products' dict from the Bazaar API."""
    data = safe_get(BAZAAR_URL)
    if not data or not data.get("success"):
        raise RuntimeError("Failed to fetch Bazaar data")
    return data["products"]

# ─────────────────────────── Instant flips ───────────────────────────────────

def compute_instant_flips(products: dict) -> list[dict]:
    """
    Instant flip: buy at lowest ask (quick_status.sellPrice),
    sell at highest bid (quick_status.buyPrice).
    Profit = buyPrice * (1 - TAX) - sellPrice
    """
    results = []
    for pid, prod in products.items():
        qs = prod.get("quick_status", {})
        sell_price = qs.get("sellPrice", 0)   # lowest ask — what you pay
        buy_price  = qs.get("buyPrice", 0)    # highest bid — what you receive
        weekly_vol = qs.get("buyMovingWeek", 0)

        if not sell_price or not buy_price:
            continue
        if weekly_vol < INSTANT_MIN_WEEKLY_VOL:
            continue

        profit = buy_price * (1 - TAX) - sell_price
        if profit < INSTANT_MIN_PROFIT:
            continue

        margin = (profit / sell_price) * 100
        results.append({
            "id":         pid,
            "name":       pretty_name(pid),
            "buy":        sell_price,
            "sell":       buy_price,
            "profit":     profit,
            "margin":     margin,
            "weekly_vol": weekly_vol,
        })

    results.sort(key=lambda x: x["profit"], reverse=True)
    return results[:TOP_N]

# ─────────────────────────── Order flips ─────────────────────────────────────

def compute_order_flips(products: dict) -> list[dict]:
    """
    Order flip: place a buy order at or just above the highest bid,
    then a sell order at the lowest ask.
    Margin = (sellPrice - buyPrice) / buyPrice * 100
    """
    results = []
    for pid, prod in products.items():
        qs = prod.get("quick_status", {})
        buy_order  = qs.get("buyPrice", 0)   # highest existing bid
        sell_order = qs.get("sellPrice", 0)  # lowest existing ask
        weekly_vol = qs.get("buyMovingWeek", 0)

        if not buy_order or not sell_order:
            continue
        if weekly_vol < ORDER_MIN_WEEKLY_VOL:
            continue
        if buy_order >= sell_order:
            continue  # spread is negative

        margin = (sell_order - buy_order) / buy_order * 100
        if margin < ORDER_MIN_MARGIN_PCT:
            continue

        profit = sell_order * (1 - TAX) - buy_order
        results.append({
            "id":         pid,
            "name":       pretty_name(pid),
            "buy_order":  buy_order,
            "sell_order": sell_order,
            "profit":     profit,
            "margin":     margin,
            "weekly_vol": weekly_vol,
        })

    results.sort(key=lambda x: x["margin"], reverse=True)
    return results[:TOP_N]

# ─────────────────────────── AH snipes ───────────────────────────────────────

def fetch_ah_page(page: int) -> dict | None:
    return safe_get(AH_URL, params={"page": page})


def fetch_coflnet_median(item_tag: str) -> float | None:
    """Fetch the SkyCoflent median price for one item. Returns None on error."""
    url = COFLNET_MEDIAN_URL.format(item_tag=item_tag)
    data = safe_get(url)
    if not data:
        return None
    # Response varies; try common keys
    return data.get("median") or data.get("price") or data.get("value")


def compute_ah_snipes(pages: int = 2) -> list[dict]:
    """
    Scan the first `pages` pages of BIN auctions.
    Flag items where bin_price < coflnet_median * AH_MAX_RATIO
    and profit (vs median) > AH_MIN_PROFIT.
    """
    # Collect BIN auctions from the specified pages
    bins: list[dict] = []
    for page in range(pages):
        data = fetch_ah_page(page)
        if not data or not data.get("success"):
            break
        for auction in data.get("auctions", []):
            if auction.get("bin") and not auction.get("claimed"):
                bins.append(auction)
        # Polite delay between pages
        if page < pages - 1:
            time.sleep(0.5)

    # Build a set of unique item names to look up medians
    # Use the item's lore-stripped name or item_name field
    medians: dict[str, float] = {}
    seen_names: set[str] = set()
    for auction in bins:
        name = auction.get("item_name", "")
        if name and name not in seen_names:
            seen_names.add(name)

    # Fetch medians for each unique item (rate-limit: 1 per 0.3 s)
    for name in seen_names:
        # SkyCoflent uses uppercase-underscore IDs; we attempt a best-effort mapping
        tag = name.upper().replace(" ", "_")
        median = fetch_coflnet_median(tag)
        if median:
            medians[name] = median
        time.sleep(0.3)

    snipes: list[dict] = []
    for auction in bins:
        name = auction.get("item_name", "")
        price = auction.get("starting_bid", 0)
        auction_id = auction.get("uuid", "")
        median = medians.get(name)

        if not median or not price or not auction_id:
            continue
        if price >= median * AH_MAX_RATIO:
            continue

        profit = median - price
        if profit < AH_MIN_PROFIT:
            continue

        snipes.append({
            "name":       name,
            "price":      price,
            "median":     median,
            "profit":     profit,
            "ratio":      price / median,
            "auction_id": auction_id,
        })

    snipes.sort(key=lambda x: x["profit"], reverse=True)
    return snipes[:TOP_N]

# ─────────────────────────── Discord embeds ──────────────────────────────────

def build_instant_embed(flips: list[dict]) -> dict:
    fields = []
    for f in flips:
        fields.append({
            "name": f["name"],
            "value": (
                f"Buy: **{fmt_coins(f['buy'])}** → Sell: **{fmt_coins(f['sell'])}**\n"
                f"Profit: **{fmt_coins(f['profit'])}** ({f['margin']:.1f}%)\n"
                f"Wk Vol: {fmt_coins(f['weekly_vol'])}"
            ),
            "inline": True,
        })
    return {
        "title": "⚡ Top Instant Flips",
        "description": "Buy at lowest ask → sell at highest bid (incl. 1.25% tax)",
        "color": COLOR_INSTANT,
        "fields": fields,
        "footer": {"text": "Hypixel Bazaar · instant flip"},
    }


def build_order_embed(flips: list[dict]) -> dict:
    fields = []
    for f in flips:
        fields.append({
            "name": f["name"],
            "value": (
                f"Buy order: **{fmt_coins(f['buy_order'])}** "
                f"→ Sell order: **{fmt_coins(f['sell_order'])}**\n"
                f"Profit: **{fmt_coins(f['profit'])}** (margin {f['margin']:.1f}%)\n"
                f"Wk Vol: {fmt_coins(f['weekly_vol'])}"
            ),
            "inline": True,
        })
    return {
        "title": "📋 Top Order Flips",
        "description": "Place buy & sell orders for the spread (incl. 1.25% tax)",
        "color": COLOR_ORDER,
        "fields": fields,
        "footer": {"text": "Hypixel Bazaar · order flip"},
    }


def build_snipe_embed(snipes: list[dict]) -> dict:
    fields = []
    for s in snipes:
        fields.append({
            "name": s["name"],
            "value": (
                f"BIN: **{fmt_coins(s['price'])}** (median {fmt_coins(s['median'])})\n"
                f"Profit: **{fmt_coins(s['profit'])}** ({s['ratio']*100:.0f}% of median)\n"
                f"```/viewauction {s['auction_id']}```"
            ),
            "inline": False,
        })
    return {
        "title": "🎯 AH Snipe Alerts",
        "description": "BIN auctions priced well below SkyCoflent median",
        "color": COLOR_SNIPE,
        "fields": fields,
        "footer": {"text": "Copy /viewauction command and paste into Hypixel chat"},
    }


def send_webhook(embeds: list[dict]) -> None:
    """POST one or more embeds to the Discord webhook."""
    payload = {"embeds": embeds}
    r = requests.post(
        WEBHOOK_URL,
        data=json.dumps(payload),
        headers={"Content-Type": "application/json"},
        timeout=TIMEOUT,
    )
    if r.status_code not in (200, 204):
        raise RuntimeError(f"Webhook POST failed: {r.status_code} — {r.text}")

# ─────────────────────────── Main ────────────────────────────────────────────

def main() -> None:
    print("[*] Fetching Bazaar data…")
    products = fetch_bazaar()

    print("[*] Computing instant flips…")
    instant = compute_instant_flips(products)
    print(f"    Found {len(instant)} instant flip(s)")

    print("[*] Computing order flips…")
    orders = compute_order_flips(products)
    print(f"    Found {len(orders)} order flip(s)")

    print("[*] Scanning AH for snipes…")
    snipes = compute_ah_snipes(pages=2)
    print(f"    Found {len(snipes)} snipe(s)")

    embeds: list[dict] = []
    if instant:
        embeds.append(build_instant_embed(instant))
    if orders:
        embeds.append(build_order_embed(orders))
    if snipes:
        embeds.append(build_snipe_embed(snipes))

    if not embeds:
        print("[*] No opportunities found this run — nothing posted.")
        return

    # Discord allows max 10 embeds per message; split if needed
    for i in range(0, len(embeds), 10):
        send_webhook(embeds[i : i + 10])
        if i + 10 < len(embeds):
            time.sleep(1)

    print(f"[✓] Posted {len(embeds)} embed(s) to Discord.")


if __name__ == "__main__":
    main()
