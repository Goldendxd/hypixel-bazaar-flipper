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

def compute_flips(products):
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
    return results[:TOP_N]


def post_embeds(results, products, ts):
    if not results:
        payload = {
            "content": "Bazaar flip check completed.",
            "embeds": [{
                "title": "Best Flips",
                "description": f"✓ Data updated at {ts} ({len(products)} products)\nNo profitable flips matched the current filters.",
                "color": 0x6c8ebf,
                "footer": {"text": "ALWAYS DOUBLE CHECK INGAME PRICES FOR PRICE MANIPULATION"},
            }]
        }
        r = requests.post(WEBHOOK_URL, json=payload, timeout=15)
        print(f"POST {r.status_code}")
        if r.status_code >= 400:
            raise RuntimeError(f"Webhook request failed: {r.status_code} {r.text}")
        print("[OK] Posted 0 flips.")
        return

    header = {
        "title": "Best Flips",
        "description": f"✓ Data updated at {ts} ({len(products)} products)",
        "color": 0x6c8ebf,
        "footer": {"text": "ALWAYS DOUBLE CHECK INGAME PRICES FOR PRICE MANIPULATION"},
    }

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

    for i in range(0, len(embeds), 10):
        payload = {"content": "Bazaar flip check completed.", "embeds": embeds[i:i+10]}
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

