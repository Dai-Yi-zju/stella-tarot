"""抽牌模块的离线测试（不需要 API Key）。运行：python tests/test_drawing.py"""

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarot.deck import build_deck
from tarot.drawing import draw_two_piles
from tarot.spreads import SPREADS


def test_deck():
    deck = build_deck()
    assert len(deck) == 78
    assert len({c.name for c in deck}) == 78, "牌名不能重复"
    assert sum(c.arcana == "大阿尔卡那" for c in deck) == 22
    assert all(c.upright and c.reversed for c in deck)


def test_no_duplicates_and_alternate_order():
    for _ in range(500):
        r = draw_two_piles(SPREADS["five"]["positions"], choose_pile=lambda l, r: 1)
        assert len({c.card.id for c in r.cards}) == 5, "一次占卜不能出现重复的牌"
        assert [c.pile for c in r.cards] == [1, 0, 1, 0, 1], "应从右堆开始左右轮流"
        assert [c.position for c in r.cards] == SPREADS["five"]["positions"]
        assert sum(r.pile_sizes) == 78 and min(r.pile_sizes) >= 31


def test_pick_mode():
    r = draw_two_piles(["a", "b", "c"], choose_pile=lambda l, r: 0, mode="pick")
    assert [c.pile for c in r.cards] == [0, 0, 0]


def test_no_reversed():
    for _ in range(200):
        r = draw_two_piles(["a", "b", "c"], use_reversed=False)
        assert not any(c.reversed for c in r.cards)


def test_uniformity():
    """抽 20000 次单张：每张牌约 1/78，正逆位约 50%。"""
    n = 20000
    cards, rev = Counter(), 0
    for _ in range(n):
        c = draw_two_piles(["x"]).cards[0]
        cards[c.card.id] += 1
        rev += c.reversed
    expected = n / 78
    assert len(cards) == 78
    assert all(0.6 * expected < v < 1.4 * expected for v in cards.values()), "牌的分布明显不均匀"
    assert 0.47 < rev / n < 0.53, f"逆位比例异常：{rev / n:.3f}"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"✅ {name}")
    print("全部通过")
