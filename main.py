"""塔罗占卜 Agent 命令行入口。

用法：
    python main.py                 # 和 GPT 塔罗师对话占卜
    python main.py --no-reversed   # 只用正位
    python main.py --draw-only     # 不调用 GPT，只练习两堆抽牌
"""

import argparse
import sys

from tarot.drawing import PILE_NAMES, DrawResult, draw_two_piles
from tarot.spreads import SPREADS

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def ask_pile(left: int, right: int) -> int:
    """让用户亲自选择一堆。"""
    print("\n🔮 牌已洗好并切成两堆：")
    print(f"   [1] {PILE_NAMES[0]}（{left} 张）    [2] {PILE_NAMES[1]}（{right} 张）")
    while True:
        choice = input("   默想你的问题，选择从哪一堆开始抽（输入 1 或 2）：").strip().lstrip("﻿")
        if choice in ("1", "左", "左堆"):
            return 0
        if choice in ("2", "右", "右堆"):
            return 1
        print("   请输入 1 或 2。")


def show_draw(spread_name: str, question: str, result: DrawResult) -> None:
    print(f"\n✨ 牌阵：{spread_name}")
    print(f"   问题：{question}")
    print(f"   {result.describe()}：")
    for i, c in enumerate(result.cards, 1):
        print(f"   {i}. [{PILE_NAMES[c.pile]}] 【{c.position}】{c.card.name}（{c.card.name_en}）· {c.orientation}")
    print()


def show_draw_and_wait(spread_name: str, question: str, result: DrawResult) -> None:
    show_draw(spread_name, question, result)
    print("⏳ 塔罗师正在解读……\n")


def draw_only(use_reversed: bool, mode: str) -> None:
    keys = list(SPREADS)
    print("可选牌阵：")
    for i, k in enumerate(keys, 1):
        print(f"  [{i}] {SPREADS[k]['name']}")
    while True:
        idx = input("选择牌阵编号（默认 2）：").strip().lstrip("﻿") or "2"
        if idx.isdigit() and 1 <= int(idx) <= len(keys):
            break
        print(f"请输入 1~{len(keys)}。")
    sp = SPREADS[keys[int(idx) - 1]]
    question = input("写下你的问题：").strip() or "（未写问题）"
    result = draw_two_piles(sp["positions"], use_reversed, ask_pile, mode)
    show_draw(sp["name"], question, result)
    for c in result.cards:
        print(f"   【{c.position}】{c.card.name} {c.orientation}：{c.meaning}")


def chat(use_reversed: bool, model: str | None, mode: str) -> None:
    from tarot.agent import TarotAgent

    agent = TarotAgent(model=model, use_reversed=use_reversed, choose_pile=ask_pile,
                       on_draw=show_draw_and_wait, draw_mode=mode)
    print("=" * 50)
    print("🌙 欢迎来到 AI 塔罗占卜（两堆抽牌法 · GPT 解读）")
    print("   直接输入你的问题开始占卜；占卜后可继续追问。")
    print("   /new 开始新的占卜    /quit 退出")
    print("   提示：塔罗适合作为自我反思的工具，结果仅供参考。")
    print("=" * 50)

    while True:
        try:
            text = input("\n🧑 你：").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见 🌟")
            return
        if not text:
            continue
        if text in ("/quit", "/exit", "q"):
            print("再见 🌟")
            return
        if text == "/new":
            agent.reset()
            print("🔄 已开始新的占卜，请输入新问题。")
            continue
        try:
            reply = agent.ask(text)
        except Exception as e:  # 网络 / API Key 等错误
            print(f"❌ 调用 GPT 出错：{e}")
            continue
        print(f"🔮 塔罗师：\n{reply}")


def main() -> None:
    parser = argparse.ArgumentParser(description="AI 塔罗占卜 Agent")
    parser.add_argument("--no-reversed", action="store_true", help="不使用逆位")
    parser.add_argument("--draw-only", action="store_true", help="只抽牌，不调用 GPT")
    parser.add_argument("--model", default=None, help="GPT 模型名（默认读取 OPENAI_MODEL，否则 gpt-5）")
    parser.add_argument("--mode", choices=["alternate", "pick"], default="alternate",
                        help="alternate：两堆轮流抽（默认）；pick：只从一堆抽")
    args = parser.parse_args()

    use_reversed = not args.no_reversed
    if args.draw_only:
        draw_only(use_reversed, args.mode)
    else:
        chat(use_reversed, args.model, args.mode)


if __name__ == "__main__":
    main()
