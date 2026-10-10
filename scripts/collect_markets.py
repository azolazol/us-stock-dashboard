"""Public RSS headlines and market snapshots. No Gemini/API keys required."""
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


def get(url, as_json=False):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 AzolMarket/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        body = response.read(4000000)
    return json.loads(body) if as_json else body


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_feed(body, category):
    entries = []
    for item in ET.fromstring(body).findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if not title or urllib.parse.urlparse(link).scheme not in ("https", "http"):
            continue
        try:
            stamp = parsedate_to_datetime(item.findtext("pubDate"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError, AttributeError):
            continue
        source = (item.findtext("source") or "").strip()
        if source and title.endswith(" - " + source):
            title = title[:-(len(source) + 3)]
        if category == "crypto":
            kind = "BTC" if re.search(r"비트코인|bitcoin|\bBTC\b", title, re.I) else "ETH" if re.search(r"이더리움|ethereum|\bETH\b", title, re.I) else "ALT"
        else:
            kind = "KR"
        entries.append(dict(title=title, link=link, source=source or "Google 뉴스", published_at=stamp.astimezone(timezone.utc).isoformat(), category=kind))
    return entries


def merge_news(fresh, previous):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    seen = set()
    result = []
    for item in sorted(fresh + previous, key=lambda n: n["published_at"], reverse=True):
        key = re.sub(r"\s+", "", item["title"]).lower()
        if key in seen or item["published_at"] < cutoff:
            continue
        seen.add(key)
        result.append(item)
    return result[:100]


def yahoo_quote(symbol, name):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(symbol, safe="") + "?interval=1d&range=5d"
    root = get(url, True)["chart"]["result"][0]
    meta = root["meta"]
    price = meta.get("regularMarketPrice")
    # chartPreviousClose is the start-of-range close, not necessarily yesterday.
    prior = meta.get("previousClose")
    market_day = datetime.fromtimestamp(meta["regularMarketTime"], timezone.utc).date()
    closes = root["indicators"]["quote"][0]["close"]
    candidates = [v for t, v in zip(root.get("timestamp", []), closes) if finite(v) and datetime.fromtimestamp(t, timezone.utc).date() < market_day]
    if candidates:
        prior = candidates[-1]
    if not finite(price):
        raise ValueError("No valid quote for " + symbol)
    return dict(name=name, symbol=symbol, price=price, currency=meta.get("currency", ""), change_pct=(price / prior - 1) * 100 if finite(prior) and prior else None, as_of=datetime.fromtimestamp(meta["regularMarketTime"], timezone.utc).isoformat(), fetched_at=now(), source="Yahoo Finance", stale=False)


def collect(previous):
    output = {"schema_version": 1, "attempted_at": now(), "markets": {}}
    configs = {
        "kr": ["코스피 OR 코스닥 OR 한국증시 when:2d", "삼성전자 OR SK하이닉스 주식 when:2d"],
        "crypto": ["비트코인 OR 이더리움 when:2d", "가상자산 OR 암호화폐 OR 솔라나 OR 리플 when:2d"],
    }
    for market, queries in configs.items():
        old = previous.get("markets", {}).get(market, {})
        data = {"news": old.get("news", []), "news_updated_at": old.get("news_updated_at"), "quotes": [], "errors": []}
        fresh = []
        successes = 0
        for query in queries:
            try:
                feed = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"})
                rows = parse_feed(get(feed), market)
                if not rows:
                    raise ValueError("Empty feed")
                fresh.extend(rows)
                successes += 1
            except Exception as exc:
                data["errors"].append("뉴스 수집 실패: " + type(exc).__name__)
        if successes:
            data["news"] = merge_news(fresh, data["news"])
            data["news_updated_at"] = now()
        old_quotes = {q["symbol"]: q for q in old.get("quotes", [])}
        if market == "kr":
            for symbol, name in [("^KS11", "코스피"), ("^KQ11", "코스닥"), ("KRW=X", "원/달러")]:
                try:
                    data["quotes"].append(yahoo_quote(symbol, name))
                except Exception as exc:
                    data["quotes"].append({**old_quotes.get(symbol, {"name": name, "symbol": symbol}), "stale": True})
                    data["errors"].append(name + " 시세 수집 실패: " + type(exc).__name__)
        else:
            pairs = [("KRW-BTC", "비트코인"), ("KRW-ETH", "이더리움"), ("KRW-XRP", "리플"), ("KRW-SOL", "솔라나")]
            try:
                rows = get("https://api.upbit.com/v1/ticker?markets=" + ",".join(p[0] for p in pairs), True)
                quotes = {q["market"]: q for q in rows}
            except Exception:
                quotes = {}
            for symbol, name in pairs:
                q = quotes.get(symbol)
                if q and finite(q.get("trade_price")) and finite(q.get("signed_change_rate")) and finite(q.get("timestamp")):
                    data["quotes"].append(dict(name=name, symbol=symbol, price=q["trade_price"], currency="KRW", change_pct=q["signed_change_rate"] * 100, as_of=datetime.fromtimestamp(q["timestamp"] / 1000, timezone.utc).isoformat(), fetched_at=now(), source="업비트 · UTC 0시 기준 등락", stale=False))
                else:
                    data["quotes"].append({**old_quotes.get(symbol, {"name": name, "symbol": symbol}), "stale": True})
                    data["errors"].append(name + " 시세 수집 실패")
        output["markets"][market] = data
    return output


if __name__ == "__main__":
    path = Path("data/markets.json")
    previous = json.loads(path.read_text()) if path.exists() else {}
    result = collect(previous)
    path.parent.mkdir(exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    os.replace(temporary, path)
    for key, data in result["markets"].items():
        print(key, "headlines:", len(data["news"]), "errors:", data["errors"])
