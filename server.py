"""塔罗占卜网页 Demo 后端。

    python server.py            # 真实调用 GPT，打开 http://127.0.0.1:8000
    python server.py --mock     # 不调用 GPT，用假数据调试网页
    python server.py --port 8080

API Key 只保存在服务器端（.env），不会发到浏览器。
"""

import argparse
import hmac
import os
import sys
import threading
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

import uvicorn  # noqa: E402
from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from tarot.deck import build_deck  # noqa: E402
from tarot.web_session import WebReading  # noqa: E402

STATIC = ROOT / "static"
app = FastAPI(title="星语塔罗")
app.mount("/static", StaticFiles(directory=STATIC), name="static")

MOCK = False
_readings: dict[str, WebReading] = {}
_readings_lock = threading.Lock()
SESSION_TTL = 3 * 3600

# ---- 对外分享时的保护（通过命令行参数或环境变量设置）----
ACCESS_CODE = ""          # 访问口令，为空则不需要
PER_IP_DAILY = 10         # 每个访客每天最多占卜次数
GLOBAL_DAILY = 100        # 所有人加起来每天最多占卜次数
FOLLOWUPS_PER_READING = 5
_usage: dict[str, list[float]] = {}  # ip -> 最近 24 小时内开始占卜的时间戳
_usage_lock = threading.Lock()
DAY = 24 * 3600


def client_ip(request: Request) -> str:
    """真实访客 IP：经 Cloudflare 隧道进来的请求，连接方是本机，真实 IP 在 CF-Connecting-IP 头里。"""
    host = request.client.host if request.client else "unknown"
    if host in ("127.0.0.1", "::1"):
        return request.headers.get("cf-connecting-ip") or host
    return host


def check_quota(ip: str) -> None:
    now = time.time()
    with _usage_lock:
        for k in list(_usage):
            _usage[k] = [t for t in _usage[k] if now - t < DAY]
            if not _usage[k]:
                del _usage[k]
        if GLOBAL_DAILY and sum(map(len, _usage.values())) >= GLOBAL_DAILY:
            raise HTTPException(429, "今天的占卜次数已经用完了，明天再来吧 🌙")
        if PER_IP_DAILY and len(_usage.get(ip, [])) >= PER_IP_DAILY:
            raise HTTPException(429, f"每人每天最多占卜 {PER_IP_DAILY} 次，明天再来吧 🌙")
        _usage.setdefault(ip, []).append(now)


class StartReq(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    reversed: bool = True
    code: str = Field(default="", max_length=100)


class DrawReq(BaseModel):
    id: str
    picks: list[int] = Field(min_length=3, max_length=3)  # 用户在摊开的牌中挑的位置


class IdReq(BaseModel):
    id: str


class FollowupReq(BaseModel):
    id: str
    answers: str = Field(min_length=1, max_length=3000)


def _get(rid: str) -> WebReading:
    r = _readings.get(rid)
    if r is None:
        raise HTTPException(404, "这次占卜已过期，请重新开始")
    return r


def _gpt_error(e: Exception) -> HTTPException:
    name = type(e).__name__
    hint = {
        "AuthenticationError": "API Key 无效，请检查 .env 中的 OPENAI_API_KEY",
        "APIConnectionError": "连不上 OpenAI，请检查网络或 OPENAI_BASE_URL",
        "RateLimitError": "请求太频繁或余额不足，请稍后再试或检查账户额度",
        "NotFoundError": "模型不存在，请检查 OPENAI_MODEL",
    }.get(name, "")
    return HTTPException(502, f"{hint or '调用 GPT 出错'}（{name}: {str(e)[:200]}）")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/gallery")
def gallery():
    return FileResponse(STATIC / "gallery.html")


@app.get("/api/config")
def config():
    return {"mock": MOCK, "need_code": bool(ACCESS_CODE)}


@app.get("/api/deck")
def deck():
    """78 张牌的基础信息，供牌面图鉴页使用。"""
    return [{"id": c.id, "name": c.name, "name_en": c.name_en, "arcana": c.arcana, "suit": c.suit,
             "upright": c.upright, "reversed": c.reversed} for c in build_deck()]


@app.post("/api/start")
def start(req: StartReq, request: Request):
    """GPT 选择牌阵，然后本地洗牌、切成两堆。"""
    if ACCESS_CODE and not hmac.compare_digest(req.code.strip().encode(), ACCESS_CODE.encode()):
        raise HTTPException(401, "访问口令不对，请向分享者确认口令")
    if not MOCK:
        check_quota(client_ip(request))
    now = time.time()
    with _readings_lock:
        for k in [k for k, v in _readings.items() if now - v.created > SESSION_TTL]:
            del _readings[k]
    r = WebReading(req.question, req.reversed, mock=MOCK)
    try:
        plan = r.plan()
    except Exception as e:
        raise _gpt_error(e)
    plan["deck_size"] = r.shuffle()
    plan["id"] = r.id
    with _readings_lock:
        _readings[r.id] = r
    return plan


@app.post("/api/draw")
def draw(req: DrawReq):
    r = _get(req.id)
    with r.lock:
        try:
            return {"cards": r.draw(req.picks)}
        except RuntimeError as e:
            raise HTTPException(409, str(e))
        except ValueError as e:
            raise HTTPException(400, str(e))


@app.post("/api/interpret")
def interpret(req: IdReq):
    r = _get(req.id)
    with r.lock:
        try:
            return r.interpret()
        except RuntimeError as e:
            raise HTTPException(409, str(e))
        except Exception as e:
            raise _gpt_error(e)


@app.post("/api/followup")
def followup(req: FollowupReq):
    r = _get(req.id)
    with r.lock:
        r.followups = getattr(r, "followups", 0) + 1
        if r.followups > FOLLOWUPS_PER_READING:
            raise HTTPException(429, f"每次占卜最多追问 {FOLLOWUPS_PER_READING} 次，可以重新占卜一次 🌙")
        try:
            return r.followup(req.answers)
        except RuntimeError as e:
            raise HTTPException(409, str(e))
        except Exception as e:
            raise _gpt_error(e)


def main():
    global MOCK, ACCESS_CODE, PER_IP_DAILY, GLOBAL_DAILY
    p = argparse.ArgumentParser(description="星语塔罗 网页 Demo")
    p.add_argument("--mock", action="store_true", help="不调用 GPT，使用假数据")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--code", default=os.getenv("TAROT_ACCESS_CODE", ""), help="访问口令（分享给别人时建议设置）")
    p.add_argument("--per-ip", type=int, default=int(os.getenv("TAROT_PER_IP_DAILY", PER_IP_DAILY)),
                   help="每个访客每天最多占卜次数，0 表示不限")
    p.add_argument("--daily", type=int, default=int(os.getenv("TAROT_GLOBAL_DAILY", GLOBAL_DAILY)),
                   help="所有人每天最多占卜次数，0 表示不限")
    args = p.parse_args()
    MOCK, ACCESS_CODE = args.mock, args.code.strip()
    PER_IP_DAILY, GLOBAL_DAILY = args.per_ip, args.daily
    # 端口被占用时给出明确提示（否则 uvicorn 只会打印一行不显眼的错误后退出）
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", args.port)) == 0:
            print(f"❌ 端口 {args.port} 已被占用：可能另一个 server.py 还开着。")
            print(f"   请先关掉它（在那个终端按 Ctrl+C），或换个端口：python server.py --port {args.port + 1}")
            sys.exit(1)
    print(f"🔮 星语塔罗已启动：http://{args.host}:{args.port}  {'（mock 模式，不调用 GPT）' if MOCK else ''}")
    print(f"   访问口令：{'已设置' if ACCESS_CODE else '未设置'}　每人每天 {PER_IP_DAILY or '不限'} 次　每天总计 {GLOBAL_DAILY or '不限'} 次")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
