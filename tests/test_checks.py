"""确认评测检查能抓出错误的解读（不需要 API Key）。运行：python tests/test_checks.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarot.deck import build_deck
from tarot.drawing import DrawnCard, DrawResult
from run_eval import check_reply  # noqa: E402

DECK = {c.name: c for c in build_deck()}
result = DrawResult((39, 39), 0, [
    DrawnCard("现状", DECK["魔术师"], False, 0),
    DrawnCard("阻碍", DECK["圣杯五"], True, 1),
    DrawnCard("建议", DECK["星星"], False, 0),
])
case = {"expected_spreads": ["three_situation"], "needs_professional_note": True}
GOOD = "### 牌面\n魔术师（正位）、圣杯五（逆位）、星星（正位）\n### 逐张解读\n…\n### 整体解读\n…\n### 行动建议\n建议咨询专业医生。"

r = check_reply(case, GOOD, [("three_situation", result)])
assert all(r[k] for k in ["draw_once", "spread_ok", "cards_named", "orientation", "no_fake_cards",
                          "sections", "no_absolute", "pro_note"]), r

bad = {
    "orientation": GOOD.replace("圣杯五（逆位）", "圣杯五（正位）"),
    "no_fake_cards": GOOD + "\n就像高塔一样。",
    "no_absolute": GOOD + "\n你一定会成功。",
    "sections": GOOD.replace("### 行动建议", ""),
    "cards_named": GOOD.replace("星星（正位）", ""),
    "pro_note": GOOD.replace("建议咨询专业医生。", ""),
}
for key, text in bad.items():
    assert not check_reply(case, text, [("three_situation", result)])[key], f"{key} 没有抓到错误"
    print(f"✅ 能检测出 {key} 问题")
assert not check_reply(case, GOOD, [])["draw_once"]
assert not check_reply(case, GOOD, [("x", result), ("x", result)])["draw_once"]
print("✅ 能检测出未抽牌 / 重复抽牌\n全部通过")
