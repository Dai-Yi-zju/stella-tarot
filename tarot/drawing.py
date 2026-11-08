"""随机抽牌模块（RNG）：洗牌 → 切成两堆 → 两堆轮流抽牌。

默认（alternate）：占卜者选择先从哪一堆开始，之后左右两堆轮流从堆顶各抽一张，
例如从左堆开始：第 1 张左堆、第 2 张右堆、第 3 张左堆……
备选（pick）：只选一堆，从这一堆顶部连续抽牌。

核心原则：抽到什么牌完全由这里的系统随机数决定，LLM 只负责解读。
"""

import secrets
from dataclasses import dataclass
from typing import Callable, Optional

from .deck import Card, build_deck

_rng = secrets.SystemRandom()  # 使用操作系统级随机源

PILE_NAMES = ("左堆", "右堆")


DRAW_MODES = ("alternate", "pick")


@dataclass
class DrawnCard:
    position: str
    card: Card
    reversed: bool
    pile: int = 0  # 这张牌来自哪一堆：0 = 左堆, 1 = 右堆
    pick_index: Optional[int] = None  # 网页版：用户在摊开的牌中挑的是第几张（从 0 开始）

    @property
    def orientation(self) -> str:
        return "逆位" if self.reversed else "正位"

    @property
    def meaning(self) -> str:
        return self.card.reversed if self.reversed else self.card.upright

    def to_dict(self) -> dict:
        return {
            "牌位": self.position,
            "牌名": self.card.name,
            "英文名": self.card.name_en,
            "类别": self.card.arcana,
            "花色": self.card.suit,
            "正逆位": self.orientation,
            "参考牌义": self.meaning,
            "来自": PILE_NAMES[self.pile] if self.pick_index is None else f"摊开的牌中第 {self.pick_index + 1} 张",
        }


@dataclass
class DrawResult:
    pile_sizes: tuple[int, int]
    chosen_pile: int           # alternate：起始堆；pick：所选的堆。0 = 左堆, 1 = 右堆
    cards: list[DrawnCard]
    mode: str = "alternate"

    def describe(self) -> str:
        if self.mode == "fan":
            return f"洗牌后将 {self.pile_sizes[0]} 张牌背面朝上摊开，由占卜者凭直觉亲手挑选 {len(self.cards)} 张，按挑选顺序放入牌位"
        head = f"洗牌后切成两堆（左堆 {self.pile_sizes[0]} 张、右堆 {self.pile_sizes[1]} 张），"
        if self.mode == "alternate":
            return head + f"从{PILE_NAMES[self.chosen_pile]}开始，两堆轮流从堆顶各抽一张"
        return head + f"从{PILE_NAMES[self.chosen_pile]}顶部依次抽牌"

    def to_dict(self) -> dict:
        return {"抽牌方式": self.describe(), "牌面": [c.to_dict() for c in self.cards]}


def shuffle(deck: list[Card], use_reversed: bool = True) -> list[tuple[Card, bool]]:
    """洗牌：多轮随机打乱，洗牌过程中每张牌独立地有 50% 概率被转 180°。"""
    cards = [(c, False) for c in deck]
    for _ in range(3):
        _rng.shuffle(cards)
        if use_reversed:
            cards = [(c, (not r) if _rng.random() < 0.5 else r) for c, r in cards]
    return cards


def cut_into_two(cards: list) -> tuple[list, list]:
    """切牌：在中间附近随机切开，分成左右两堆（模拟手切，两堆不会完全一样多）。"""
    mid = len(cards) // 2
    cut = mid + _rng.randint(-8, 8)
    return cards[:cut], cards[cut:]


def draw_two_piles(
    positions: list[str],
    use_reversed: bool = True,
    choose_pile: Optional[Callable[[int, int], int]] = None,
    mode: str = "alternate",
) -> DrawResult:
    """两堆抽牌法。

    1. 洗牌（含正逆位）
    2. 切成左右两堆
    3. 由占卜者选择一堆（choose_pile 回调，返回 0 或 1；不提供则随机选）
    4. alternate：从所选的堆开始，两堆轮流从堆顶各抽一张；
       pick：从所选的堆顶部连续抽牌。
       抽出的牌按顺序放到各牌位。
    """
    piles = prepare_piles(use_reversed)
    if choose_pile is None:
        chosen = _rng.randrange(2)
    else:
        chosen = choose_pile(len(piles[0]), len(piles[1]))
    return deal(piles, positions, chosen, mode)


def prepare_piles(use_reversed: bool = True) -> tuple[list, list]:
    """第 1~2 步：洗牌（含正逆位）并切成左右两堆。网页版在这一步之后等待用户选堆。"""
    return cut_into_two(shuffle(build_deck(), use_reversed))


def deal(piles: tuple[list, list], positions: list[str], chosen: int, mode: str = "alternate") -> DrawResult:
    """第 4 步：从选定的起始堆开始抽牌（alternate 两堆轮流 / pick 只抽一堆）。"""
    n = len(positions)
    if mode not in DRAW_MODES:
        raise ValueError(f"mode 必须是 {DRAW_MODES} 之一")
    if not 1 <= n <= 30:
        raise ValueError("抽牌数量不合理")
    if chosen not in (0, 1):
        raise ValueError("起始堆必须是 0（左堆）或 1（右堆）")

    tops = [0, 0]  # 每堆已经抽到第几张
    drawn = []
    for i, pos in enumerate(positions):
        p = (chosen + i) % 2 if mode == "alternate" else chosen
        card, rev = piles[p][tops[p]]
        tops[p] += 1
        drawn.append(DrawnCard(pos, card, rev, p))
    return DrawResult((len(piles[0]), len(piles[1])), chosen, drawn, mode)
