"""用测试集评测塔罗 Agent。

    python tests/run_eval.py --mock            # 不调用 GPT，只检查流程和评测脚本本身
    python tests/run_eval.py                   # 真实调用 GPT（需要 OPENAI_API_KEY）
    python tests/run_eval.py --judge           # 另外让 GPT 给每条解读打分
    python tests/run_eval.py --ids love-01,career-02 --workers 2

每条用例的自动检查：
  draw_once      只调用一次抽牌工具（GPT 没有跳过抽牌，也没有重复抽）
  spread_ok      选择的牌阵在可接受范围内（软指标）
  cards_named    解读中提到了每一张抽到的牌
  orientation    每张牌附近写对了正位/逆位
  no_fake_cards  没有提到未抽到的牌（只检查不会和日常用词混淆的牌名）
  sections       包含 牌面/逐张解读/整体解读/行动建议 四个部分
  no_absolute    没有"一定会""注定"等绝对化预言
  pro_note       健康/法律/投资类问题提醒咨询专业人士
"""

import argparse
import json
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace as NS

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from tarot.agent import TarotAgent
from tarot.deck import build_deck
from tarot.spreads import SPREADS

DECK = build_deck()
SPREAD_BY_NAME = {v["name"]: k for k, v in SPREADS.items()}
# 不会和普通中文词混淆的牌名（"力量""正义""太阳""世界"等常用词不检查）
DISTINCT_NAMES = {c.name for c in DECK if c.arcana == "小阿尔卡那"} | {
    "愚者", "魔术师", "女祭司", "皇后", "皇帝", "教皇", "恋人", "战车",
    "隐士", "命运之轮", "倒吊人", "死神", "恶魔", "高塔",
}
SECTIONS = ["牌面", "逐张解读", "整体解读", "行动建议"]
ABSOLUTE = ["一定会", "肯定会", "必然会", "注定", "百分之百", "100%", "绝对会", "毫无疑问"]
PRO_WORDS = ["医生", "医院", "专业", "律师", "法律", "理财顾问", "投资顾问", "咨询"]

CHECKS = ["draw_once", "spread_ok", "cards_named", "orientation", "no_fake_cards",
          "sections", "no_absolute", "pro_note"]


# ---------------- Mock GPT（离线验证流程用）----------------
class MockClient:
    """第一次调用返回 draw_cards 工具调用，第二次根据工具结果拼出一份格式正确的解读。"""

    def __init__(self, spread: str):
        self.spread = spread
        self.chat = NS(completions=NS(create=self._create))

    def _create(self, messages, **_):
        tool_msgs = [m for m in messages if m.get("role") == "tool"]
        if not tool_msgs:
            args = json.dumps({"spread": self.spread, "question": messages[-1]["content"]}, ensure_ascii=False)
            tc = NS(id="call_1", function=NS(name="draw_cards", arguments=args))
            tc.model_dump = lambda: {"id": "call_1", "type": "function",
                                     "function": {"name": "draw_cards", "arguments": args}}
            return NS(choices=[NS(message=NS(content=None, tool_calls=[tc]))])
        data = json.loads(tool_msgs[-1]["content"])
        lines = ["### 🃏 牌面"] + [f"- {c['牌位']}：{c['牌名']}（{c['正逆位']}）" for c in data["牌面"]]
        lines += ["### 🔍 逐张解读"] + [f"{c['牌名']}{c['正逆位']}：{c['参考牌义']}" for c in data["牌面"]]
        lines += ["### 🌙 整体解读", "（mock）", "### 🌱 行动建议", "- 如有需要请咨询专业人士。"]
        return NS(choices=[NS(message=NS(content="\n".join(lines), tool_calls=None))])


# ---------------- 自动检查 ----------------
def check_reply(case: dict, reply: str, draws: list) -> dict:
    res: dict = {}
    res["draw_once"] = len(draws) == 1
    if not draws:
        return {k: res.get(k, False) for k in CHECKS}
    spread_key, result = draws[-1]
    res["spread_ok"] = spread_key in case.get("expected_spreads", [spread_key])

    drawn_names = {c.card.name for c in result.cards}
    res["cards_named"] = all(n in reply for n in drawn_names)

    ok = True
    for c in result.cards:
        idxs = [m.start() for m in re.finditer(re.escape(c.card.name), reply)]
        if not any(c.orientation in reply[i: i + len(c.card.name) + 12] for i in idxs):
            ok = False
    res["orientation"] = ok

    fake = []
    for name in DISTINCT_NAMES - drawn_names:
        # 避免 "圣杯十" 被当成提到了 "圣杯一" 这类子串误报
        if name in reply and not any(name in d for d in drawn_names):
            fake.append(name)
    res["no_fake_cards"] = not fake
    res["_fake_cards"] = fake

    res["sections"] = all(s in reply for s in SECTIONS)
    hits = [w for w in ABSOLUTE if w in reply]
    res["no_absolute"] = not hits
    res["_absolute_hits"] = hits
    res["pro_note"] = (not case.get("needs_professional_note")) or any(w in reply for w in PRO_WORDS)
    return res


JUDGE_PROMPT = """你是塔罗解读质量评审。根据用户问题、抽到的牌和 AI 的解读，按 1~5 分打分：
- relevance：解读是否紧扣用户的问题
- position_use：是否结合了每张牌所在的牌位含义
- coherence：是否把多张牌串联成连贯的整体，而非机械罗列
- actionable：行动建议是否具体可执行
- tone：语气是否温和、不做绝对预言、对敏感问题处理得当
只输出 JSON：{"relevance":n,"position_use":n,"coherence":n,"actionable":n,"tone":n,"comment":"一句话点评"}"""


def judge(client, model: str, case: dict, result, reply: str) -> dict:
    cards = "\n".join(f"{c.position}：{c.card.name}（{c.orientation}）" for c in result.cards)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": JUDGE_PROMPT},
                  {"role": "user", "content": f"问题：{case['question']}\n抽到的牌：\n{cards}\n\n解读：\n{reply}"}],
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)


# ---------------- 运行单条用例 ----------------
def run_case(case: dict, args) -> dict:
    draws: list = []
    agent = TarotAgent(
        model=args.model,
        choose_pile=lambda l, r: random.randrange(2),  # 模拟用户随机选起始堆
        on_draw=lambda name, q, res: draws.append((SPREAD_BY_NAME.get(name, name), res)),
    )
    if args.mock:
        agent.client = MockClient(case["expected_spreads"][0])

    t0 = time.time()
    out = {"id": case["id"], "category": case["category"], "question": case["question"]}
    try:
        reply = agent.ask(case["question"])
    except Exception as e:
        out.update(error=f"{type(e).__name__}: {e}", passed=False, seconds=round(time.time() - t0, 1))
        return out
    out["seconds"] = round(time.time() - t0, 1)
    out["reply"] = reply
    if draws:
        spread_key, res = draws[-1]
        out["spread"] = spread_key
        out["cards"] = [f"[{'左右'[c.pile]}] {c.position}：{c.card.name} {c.orientation}" for c in res.cards]
    out["checks"] = check_reply(case, reply, draws)
    hard = [k for k in CHECKS if k != "spread_ok"]
    out["passed"] = all(out["checks"].get(k) for k in hard)
    if args.judge and draws and not args.mock:
        try:
            out["judge"] = judge(agent.client, agent.model, case, draws[-1][1], reply)
        except Exception as e:
            out["judge"] = {"error": str(e)}
    return out


def write_report(results: list, args, path_base: Path) -> None:
    path_base.with_suffix(".json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    n = len(results)
    lines = [f"# 塔罗 Agent 评测报告", "",
             f"- 时间：{datetime.now():%Y-%m-%d %H:%M}",
             f"- 模式：{'mock（未调用 GPT）' if args.mock else '真实 GPT：' + (args.model or '默认模型')}",
             f"- 用例数：{n}，通过：{sum(r.get('passed', False) for r in results)}", "",
             "## 各项检查通过率", "", "| 检查项 | 通过 |", "| --- | --- |"]
    for k in CHECKS:
        ok = sum(bool(r.get("checks", {}).get(k)) for r in results)
        lines.append(f"| {k} | {ok}/{n} |")
    judged = [r["judge"] for r in results if isinstance(r.get("judge"), dict) and "relevance" in r["judge"]]
    if judged:
        lines += ["", "## GPT 评分均值（1~5）", ""]
        for k in ["relevance", "position_use", "coherence", "actionable", "tone"]:
            lines.append(f"- {k}：{sum(j[k] for j in judged) / len(judged):.2f}")
    lines += ["", "## 逐条结果", ""]
    for r in results:
        failed = [k for k in CHECKS if not r.get("checks", {}).get(k)]
        mark = "✅" if r.get("passed") else "❌"
        lines.append(f"### {mark} {r['id']}（{r['category']}）{r['question']}")
        if "error" in r:
            lines += [f"错误：`{r['error']}`", ""]
            continue
        lines.append(f"- 牌阵：{r.get('spread')}　耗时：{r['seconds']}s　未通过：{', '.join(failed) or '无'}")
        for c in r.get("cards", []):
            lines.append(f"  - {c}")
        if r["checks"].get("_fake_cards"):
            lines.append(f"- 提到了未抽到的牌：{r['checks']['_fake_cards']}")
        if r["checks"].get("_absolute_hits"):
            lines.append(f"- 绝对化措辞：{r['checks']['_absolute_hits']}")
        if r.get("judge"):
            lines.append(f"- GPT 评分：{json.dumps(r['judge'], ensure_ascii=False)}")
        lines += ["", "<details><summary>完整解读</summary>", "", r["reply"], "", "</details>", ""]
    path_base.with_suffix(".md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--mock", action="store_true", help="不调用 GPT，用假模型跑通流程")
    p.add_argument("--judge", action="store_true", help="让 GPT 给解读质量打分")
    p.add_argument("--model", default=None)
    p.add_argument("--ids", default="", help="只跑指定用例，逗号分隔")
    p.add_argument("--workers", type=int, default=4)
    args = p.parse_args()

    cases = json.loads((Path(__file__).parent / "test_cases.json").read_text(encoding="utf-8"))
    if args.ids:
        wanted = set(args.ids.split(","))
        cases = [c for c in cases if c["id"] in wanted]

    print(f"共 {len(cases)} 条用例，{'mock 模式' if args.mock else '调用 GPT'}……")
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(run_case, c, args): c for c in cases}
        for f in as_completed(futs):
            r = f.result()
            results.append(r)
            print(f"{'✅' if r.get('passed') else '❌'} {r['id']:<10} {r.get('seconds', 0):>5}s "
                  f"{r.get('error', '') or ', '.join(k for k in CHECKS if not r['checks'].get(k)) or ''}")
    results.sort(key=lambda r: [c["id"] for c in cases].index(r["id"]))

    out_dir = Path(__file__).parent / "results"
    out_dir.mkdir(exist_ok=True)
    base = out_dir / f"eval_{'mock_' if args.mock else ''}{datetime.now():%Y%m%d_%H%M%S}"
    write_report(results, args, base)
    print(f"\n通过 {sum(r.get('passed', False) for r in results)}/{len(results)}，报告：{base.with_suffix('.md')}")


if __name__ == "__main__":
    main()
