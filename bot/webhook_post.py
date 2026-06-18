import os, json, time, requests


def load_local_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # Keep explicit shell env vars as highest priority.
            if key and key not in os.environ:
                os.environ[key] = value


load_local_env()
WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL")

# ── Crash-flip tuning ──────────────────────────────────────────────────────────
# We only care about CRASHED items: the buy-order side has collapsed far below the
# sell side, so we can place a cheap buy order and resell into the still-high price.
# That shows up as an abnormally large spread (margin in the hundreds/thousands of
# %), not a normal 5-10% bazaar spread.
TAX             = 0.0125
CRASH_MARGIN    = 100.0       # % — minimum spread to count as "crashed" (normal ≈ 5-10%)
MIN_PROFIT      = 1_000_000   # absolute profit per flip cycle must be in the millions
# Liquidity is judged on DAILY throughput (weekly moving / 7), not weekly totals,
# so "a ton of daily sales" actually means a lot moves every single day.
MIN_DAILY_BUY   = 100_000     # items bought per day — must be heavily traded (100k+/day)
MIN_DAILY_SELL  = 10_000      # items sold per day — enough demand to offload, low risk
TOP_N           = 10
BUDGET          = 100_000_000

# Role to ping when crashes are found. Set SNIPER_ROLE_ID to the Discord role id so
# it actually pings; otherwise we fall back to a plain "@Sniper" mention text.
SNIPER_ROLE_ID = os.environ.get("SNIPER_ROLE_ID", "").strip()
SNIPER_PING    = f"<@&{SNIPER_ROLE_ID}>" if SNIPER_ROLE_ID else "@Sniper"

def fmt(n):
    if abs(n) >= 1e9: return f"{n/1e9:.2f}B"
    if abs(n) >= 1e6: return f"{n/1e6:.2f}M"
    if abs(n) >= 1e3: return f"{n/1e3:.1f}K"
    return f"{n:,.1f}"

def pretty(s):
    return " ".join(w.capitalize() for w in s.replace(":", "_").split("_"))

def icon_url(item_id):
    # sky.shiiyu.moe hotlink-blocks (403) inside Discord embeds — coflnet's static
    # icon CDN serves real PNGs that render reliably.
    return f"https://sky.coflnet.com/static/icon/{item_id}"

# ── Fetch + compute ───────────────────────────────────────────────────────────

def compute_flips(products):
    """Return only CRASHED, low-risk, flippable items.

    A crash = the buy-order side has collapsed, leaving an abnormally large spread
    (margin >= CRASH_MARGIN). We additionally require heavy DAILY throughput so the
    item can be bought cheap AND offloaded fast with little risk, and we cap the
    quantity by daily demand so the estimated profit is something you can realistically
    flip in a day.
    """
    results = []
    for pid, prod in products.items():
        qs   = prod.get("quick_status", {})
        ask  = qs.get("buyPrice", 0)
        bid  = qs.get("sellPrice", 0)
        # The API only exposes weekly moving volume; daily ≈ weekly / 7.
        dbuy  = qs.get("buyMovingWeek", 0)  / 7.0
        dsell = qs.get("sellMovingWeek", 0) / 7.0
        if not ask or not bid or ask <= bid: continue
        # Heavy daily flow on both sides → real crash and a fast, low-risk exit.
        if dbuy < MIN_DAILY_BUY or dsell < MIN_DAILY_SELL: continue

        buy_o  = bid + 0.1
        sell_o = ask - 0.1
        profit = sell_o * (1 - TAX) - buy_o
        if profit <= 0: continue

        margin = profit / buy_o * 100
        if margin < CRASH_MARGIN: continue   # not crashed — ignore normal spreads

        # Cap size by budget, single-order max, and daily demand we can offload.
        qty = max(1, min(int(BUDGET / buy_o), 71_680, int(dsell)))
        total = profit * qty
        if total < MIN_PROFIT: continue       # must be millions in margin

        results.append({
            "id": pid, "name": pretty(pid),
            "buy_o": buy_o, "sell_o": sell_o,
            "profit": profit, "margin": margin,
            "dbuy": dbuy, "dsell": dsell,
            "qty": qty, "total": total, "cost": buy_o * qty,
        })

    results.sort(key=lambda x: x["total"], reverse=True)
    return results[:TOP_N]


def post_embeds(results, products, ts):
    # Only ping when there's something worth pinging for — don't spam "nothing"
    # every few minutes.
    if not results:
        print("[OK] No crashed flips matched — nothing to post.")
        return

    header = {
        "title": "🚨  Crashed Bazaar Flips",
        "description": (
            f"**{len(results)}** crashed item(s) you can snipe right now — buy the dip, "
            f"flip into heavy daily demand.\n"
            f"-# Updated {ts} · scanned {len(products):,} products · always double-check "
            f"in-game for price manipulation"
        ),
        "color": 0xe23b3b,
    }

    cards = []
    for i, f in enumerate(results):
        medals = ["🥇", "🥈", "🥉"]
        medal  = medals[i] if i < len(medals) else f"`#{i+1}`"
        cards.append({
            "author": {
                "name": f"{medal}  {f['name']}",
                "icon_url": icon_url(f["id"]),
            },
            "color": 0x00c896,
            "description": (
                f"📉 **Crashed** · margin **{f['margin']:,.0f}%**\n"
                f"**Buy** `{fmt(f['buy_o'])}`  →  **Sell** `{fmt(f['sell_o'])}`"
            ),
            "fields": [
                {"name": "💰 Est. Profit", "value": f"**+{fmt(f['total'])}**", "inline": True},
                {"name": "📦 Flip Size",   "value": f"{f['qty']:,}",           "inline": True},
                {"name": "🪙 Total Cost",  "value": fmt(f['cost']),            "inline": True},
            ],
            "footer": {"text": f"📈 {fmt(f['dsell'])} sold/day  ·  {fmt(f['dbuy'])} bought/day"},
            "thumbnail": {"url": icon_url(f["id"])},
        })

    embeds = [header] + cards
    def send_payload(payload):
        if os.environ.get("DRY_RUN", "0") == "1":
            print("DRY_RUN payload:", json.dumps(payload, indent=2))
            class R:
                status_code = 204
                def json(self):
                    return {}
            return R()
        if not WEBHOOK_URL:
            raise RuntimeError("DISCORD_WEBHOOK_URL is not set; set it or use DRY_RUN=1 for testing")
        return requests.post(WEBHOOK_URL, json=payload, timeout=15)

    allowed = {"parse": ["roles"]} if SNIPER_ROLE_ID else {"parse": []}
    for i in range(0, len(embeds), 10):
        # Only the first chunk carries the ping so we don't ping per 10-embed batch.
        content = f"{SNIPER_PING} Crashed flips detected." if i == 0 else ""
        payload = {"content": content, "embeds": embeds[i:i+10], "allowed_mentions": allowed}
        r = send_payload(payload)
        print(f"POST {r.status_code}")
        if r.status_code == 429:
            try:
                info = r.json()
                retry = info.get("retry_after", 5)
            except Exception:
                retry = 5
            print(f"Rate limited, sleeping {retry}s")
            time.sleep(retry)
        if r.status_code >= 400 and r.status_code != 429:
            raise RuntimeError(f"Webhook request failed: {r.status_code} {r.text}")

    print(f"[OK] Posted {len(results)} flips.")


def run_once():
    data = requests.get("https://api.hypixel.net/skyblock/bazaar", timeout=15).json()
    products = data.get("products", {})
    updated  = data.get("lastUpdated", 0)
    ts = time.strftime("%I:%M:%S %p", time.gmtime(updated / 1000)) if updated else time.strftime("%I:%M:%S %p", time.gmtime())
    results = compute_flips(products)
    post_embeds(results, products, ts)


if __name__ == "__main__":
    if os.environ.get("SINGLE_RUN", "0") == "1":
        run_once()
    else:
        INTERVAL = int(os.environ.get("BOT_INTERVAL_SECONDS", 300))
        while True:
            try:
                run_once()
            except requests.exceptions.RequestException as e:
                print("Network error:", e)
                time.sleep(10)
                continue
            except Exception as e:
                print("Error during run:", e)
                time.sleep(10)
                continue
            time.sleep(INTERVAL)

