"""Native SignalR Core WebSocket client for livetiming.formula1.com/signalrcore.

No authentication required — only AWSALBCORS cookie from OPTIONS pre-flight.
Verified: negotiate returns HTTP 200 + connectionToken without F1TV credentials.

Protocol:
  OPTIONS /signalrcore/negotiate → 405 but sets AWSALBCORS cookie
  POST    /signalrcore/negotiate?negotiateVersion=1 + cookie → connectionToken
  WSS     wss://livetiming.formula1.com/signalrcore?id=<token>
    send: {"protocol":"json","version":1}\x1E   handshake
    recv: {}\x1E                                ack
    send: {type:1,invocationId:"0",target:"Subscribe",arguments:[[topics]]}\x1E
    recv: {type:3,invocationId:"0",result:{topic:data,...}}  initial snapshot
    recv: {type:1,target:"feed",arguments:[topic,delta,utc]}  stream
    recv: {type:6}  ping → reply {type:6}\x1E
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import urllib.parse
import zlib
from collections.abc import Callable, Coroutine
from typing import Any

import httpx
import websockets

log = logging.getLogger(__name__)

_BASE_HOST = "livetiming.formula1.com"
_BASE_PATH = "/signalrcore"
_RS = "\x1e"  # U+001E record separator terminates every SignalR Core frame

TOPICS: list[str] = [
    "Heartbeat",
    "CarData.z",
    "Position.z",
    "ExtrapolatedClock",
    "TimingStats",
    "TimingAppData",
    "WeatherData",
    "TrackStatus",
    "SessionStatus",
    "DriverList",
    "RaceControlMessages",
    "SessionInfo",
    "SessionData",
    "LapCount",
    "TimingData",
    "TeamRadio",
    "ChampionshipPrediction",
]


async def _negotiate() -> tuple[str, str]:
    """Return (connectionToken, cookie_header) via SignalR Core negotiate."""
    url = f"https://{_BASE_HOST}{_BASE_PATH}/negotiate?negotiateVersion=1"
    hdrs = {"User-Agent": "BestHTTP", "Accept-Encoding": "gzip, identity"}
    async with httpx.AsyncClient(follow_redirects=True) as c:
        # OPTIONS pre-flight: returns 405 but drops AWSALBCORS cookie
        try:
            await c.options(url, headers=hdrs)
        except Exception:
            pass
        resp = await c.post(url, headers=hdrs)
        resp.raise_for_status()
        data = resp.json()
        token = data.get("connectionToken") or data.get("connectionId") or ""
        awsalbcors = c.cookies.get("AWSALBCORS", "")
        cookie = f"AWSALBCORS={awsalbcors}" if awsalbcors else ""
        log.info("SignalR negotiate OK token=%.20s… cookie=%s", token, bool(cookie))
        return token, cookie


def inflate(payload: str | bytes | dict) -> dict:
    """Decode base64 + zlib raw-deflate → dict. Pass-through if already dict."""
    if isinstance(payload, dict):
        return payload
    raw = base64.b64decode(payload) if isinstance(payload, str) else bytes(payload)
    return json.loads(zlib.decompress(raw, -zlib.MAX_WBITS))


def merge(base: Any, update: Any) -> Any:
    """Recursive delta merge matching f1-dash state_service.rs logic.

    dict + dict  → recursive key merge (mutates base in place)
    list + dict  → patch list entries by int-string keys
    None + any   → return update
    scalar       → replace
    """
    if isinstance(base, dict) and isinstance(update, dict):
        for k, v in update.items():
            base[k] = merge(base.get(k), v)
        return base
    if isinstance(base, list) and isinstance(update, dict):
        for k, v in update.items():
            try:
                idx = int(k)
                while len(base) <= idx:
                    base.append(None)
                base[idx] = merge(base[idx], v)
            except (ValueError, TypeError):
                pass
        return base
    if base is None:
        return update
    return update  # scalar replace


OnSnapshot = Callable[[dict], Coroutine[Any, Any, None]]
OnUpdate = Callable[[str, Any, str], Coroutine[Any, Any, None]]


async def listen(on_snapshot: OnSnapshot, on_update: OnUpdate) -> None:
    """Full lifecycle: negotiate → connect WebSocket → handshake → subscribe → stream."""
    token, cookie = await _negotiate()
    encoded = urllib.parse.quote(token, safe="")
    ws_url = f"wss://{_BASE_HOST}{_BASE_PATH}?id={encoded}"
    extra: dict[str, str] = {}
    if cookie:
        extra["Cookie"] = cookie

    async with websockets.connect(
        ws_url,
        additional_headers=extra,
        user_agent_header="BestHTTP",
        compression=None,   # F1 timing server does not support per-message deflate
        ping_interval=None, # We handle type-6 pings manually
        open_timeout=15,
    ) as ws:
        # ── handshake ─────────────────────────────────────────────────────────
        await ws.send('{"protocol":"json","version":1}' + _RS)
        ack = await asyncio.wait_for(ws.recv(), timeout=10)
        log.debug("SignalR handshake ack: %r", ack[:60])

        # ── subscribe ─────────────────────────────────────────────────────────
        sub = json.dumps({
            "type": 1,
            "invocationId": "0",
            "target": "Subscribe",
            "arguments": [TOPICS],
        }) + _RS
        await ws.send(sub)
        log.info("SignalR subscribed to %d topics", len(TOPICS))

        # ── message loop ──────────────────────────────────────────────────────
        async for raw_frame in ws:
            for part in raw_frame.split(_RS):
                part = part.strip()
                if not part:
                    continue
                try:
                    msg = json.loads(part)
                except json.JSONDecodeError:
                    continue
                await _dispatch(msg, ws, on_snapshot, on_update)


async def _dispatch(
    msg: dict,
    ws: Any,
    on_snapshot: OnSnapshot,
    on_update: OnUpdate,
) -> None:
    msg_type = msg.get("type")

    if msg_type == 3:
        # Completion — carries the full initial state snapshot
        result: dict = msg.get("result") or {}
        for key in list(result.keys()):
            if key.endswith(".z") and isinstance(result[key], str):
                try:
                    result[key] = inflate(result[key])
                except Exception as exc:
                    log.debug("inflate snapshot %s: %s", key, exc)
        if result:
            await on_snapshot(result)

    elif msg_type == 1:
        if msg.get("target") == "feed":
            args = msg.get("arguments", [])
            if len(args) >= 2:
                topic: str = args[0]
                delta: Any = args[1]
                utc: str = args[2] if len(args) > 2 else ""
                if topic.endswith(".z") and isinstance(delta, str):
                    try:
                        delta = inflate(delta)
                    except Exception as exc:
                        log.debug("inflate feed %s: %s", topic, exc)
                await on_update(topic, delta, utc)

    elif msg_type == 6:
        # Ping — send pong
        try:
            await ws.send('{"type":6}' + _RS)
        except Exception:
            pass
