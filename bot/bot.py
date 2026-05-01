"""
Hypixel Bazaar Flip Bot
- Slash command /flip [budget] [top]
- Auto-posts top flips every 5 min to a configured channel
- Runs persistently (Railway / any VPS)

Required env vars:
  DISCORD_TOKEN       - bot token from discord.com/developers
  DISCORD_CHANNEL_ID  - channel ID to auto-post alerts to

Hypixel API field semantics:
  buyPrice  = lowest ASK  (you pay this to buy instantly)
  sellPrice = highest BID (you receive this selling instantly)
  buyPrice > sellPrice is normal
"""

import os
import time
import asyncio
import aiohttp
import discord
from discord import app_commands
from discord.ext import tasks

# ── Config ────────────────────────────────────────────────────────────────────

TOKEN      = os.environ["DISCORD_TOKEN"]
CHANNEL_ID = int(os.environ["DISCORD_CHANNEL_ID"])

TAX                 = 0.0125
ORDER_MIN_MARGIN    = 5.0
ORDER_MIN_WEEKLY_VOL = 50_000
AUTO_TOP_N          = 5
BAZAAR_URL          = "https://api.hypixel.net/skyblock/bazaar"

# ── Helpers ───────────────────────────────────────────────────────────────────

def fmt(n: float) -> str:
    if abs(n) >= 1_000_000_000: return f"{n/1_000_000_000:.2f}B"
    if abs(n) >= 1_000_000:     return f"{n/1_000_000:.2f}M"
    if abs(n) >= 1_000:         return f"{n/1_000:.1f}k"
    return f"{n:,.1f}"

def pretty(item_id: str) -> str:
    return " ".join(w.capitalize() for w in item_id.replace(":", "_").split("_"))

async def fetch_flips(session: aiohttp.ClientSession, budget: int = 10_000_000, top: int = 5) -> list[dict]:
    async with session.get(BAZAAR_URL) as r:
        data = await r.json()

    products = data.get("products", {})
    results = []

    for pid, prod in products.items():
        qs = prod.get("quick_status", {})
        ask        = qs.get("buyPrice", 0)
        bid        = qs.get("sellPrice", 0)
        weekly_vol = qs.get("buyMovingWeek", 0)
        sell_vol   = qs.get("sellMovingWeek", 0)

        if not ask or not bid or ask <= bid: continue
        if weekly_vol < ORDER_MIN_WEEKLY_VOL: continue

        buy_order  = bid + 0.1
        sell_order = ask - 0.1
        profit     = sell_order * (1 - TAX) - buy_order
        if profit <= 0: continue

        margin = (profit / buy_order) * 100
        if margin < ORDER_MIN_MARGIN: continue

        qty        = max(1, min(int(budget / buy_order), 71_680))
        total_cost = buy_order * qty
        total_prof = profit * qty

        results.append({
            "id":         pid,
            "name":       pretty(pid),
            "buy_order":  buy_order,
            "sell_order": sell_order,
            "profit":     profit,
            "margin":     margin,
            "weekly_vol": weekly_vol,
            "sell_vol":   sell_vol,
            "qty":        qty,
            "total_cost": total_cost,
            "total_prof": total_prof,
        })

    results.sort(key=lambda x: x["total_prof"], reverse=True)
    return results[:top]

# ── Discord embed builder ─────────────────────────────────────────────────────

def build_embeds(flips: list[dict], budget: int) -> list[discord.Embed]:
    embeds = []
    for i, f in enumerate(flips):
        medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
        medal  = medals[i] if i < len(medals) else f"#{i+1}"

        e = discord.Embed(
            title=f"{medal}  {f['name']}",
            color=0x00c896,
        )
        e.add_field(name="BUY PRICE",   value=f"**{fmt(f['buy_order'])}**",  inline=True)
        e.add_field(name="SELL PRICE",  value=f"**{fmt(f['sell_order'])}**", inline=True)
        e.add_field(name="​",      value="​",                       inline=True)
        e.add_field(name="QUANTITY",    value=f"**{f['qty']:,}**",            inline=True)
        e.add_field(name="TOTAL COST",  value=f"**{fmt(f['total_cost'])}**",  inline=True)
        e.add_field(name="MARGIN",      value=f"**{f['margin']:.1f}%**",      inline=True)
        e.add_field(
            name="EST. PROFIT",
            value=f"```\n+{fmt(f['total_prof'])}\n```",
            inline=False,
        )
        e.set_footer(text=f"Wk buy vol: {fmt(f['weekly_vol'])}  |  Wk sell vol: {fmt(f['sell_vol'])}  |  budget: {fmt(budget)}")
        embeds.append(e)
    return embeds

def header_embed(count: int, budget: int) -> discord.Embed:
    e = discord.Embed(
        title="Bazaar Flip Finder",
        description=(
            f"Top **{count}** order flips for a **{fmt(budget)}** coin budget.\n"
            f"Post buy order just above top bid, sell order just below lowest ask.\n"
            f"-# Prices include 1.25% sell tax. Always verify in-game."
        ),
        color=0x6c8ebf,
        timestamp=discord.utils.utcnow(),
    )
    e.set_footer(text="Hypixel SkyBlock Bazaar")
    return e

# ── Bot ───────────────────────────────────────────────────────────────────────

class FlipBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self):
        self.tree.copy_global_to(guild=None)
        await self.tree.sync()
        self.auto_post.start()

    async def on_ready(self):
        print(f"[OK] Logged in as {self.user}")

    @tasks.loop(minutes=5)
    async def auto_post(self):
        channel = self.get_channel(CHANNEL_ID)
        if not channel:
            return
        async with aiohttp.ClientSession() as session:
            flips = await fetch_flips(session, budget=10_000_000, top=AUTO_TOP_N)
        if not flips:
            return
        await channel.send(embed=header_embed(len(flips), 10_000_000))
        for e in build_embeds(flips, 10_000_000):
            await channel.send(embed=e)

    @auto_post.before_loop
    async def before_auto(self):
        await self.wait_until_ready()


bot = FlipBot()


@bot.tree.command(name="flip", description="Show top Bazaar order flips")
@app_commands.describe(
    budget="Your coin budget (default 10,000,000)",
    top="How many flips to show (default 5, max 10)",
)
async def flip_cmd(interaction: discord.Interaction, budget: int = 10_000_000, top: int = 5):
    top = min(top, 10)
    await interaction.response.defer(thinking=True)
    async with aiohttp.ClientSession() as session:
        flips = await fetch_flips(session, budget=budget, top=top)
    if not flips:
        await interaction.followup.send("No profitable flips found right now. Try again in a minute.")
        return
    await interaction.followup.send(embed=header_embed(len(flips), budget))
    for e in build_embeds(flips, budget):
        await interaction.followup.send(embed=e)


if __name__ == "__main__":
    bot.run(TOKEN)
