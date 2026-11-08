"""网页版占卜会话：把 Agent 拆成网页需要的几个步骤。

  plan()       GPT 选择三张牌阵（强制调用 draw_cards 工具，只拿参数，不立即抽牌）
  shuffle()    服务器洗好 78 张牌（含正逆位），牌序保密，网页只显示 78 张牌背
  draw(picks)  用户在网页上从摊开的牌中亲手挑 3 张（发来的是位置编号），按挑选顺序放入牌位
  interpret()  GPT 输出结构化解读：每张牌含义、整体解读、行动建议、追问问题
  followup()   用户回答追问后，GPT 基于同一组牌定制方案（可多轮）

所有 GPT 调用共享同一份对话历史，所以追问时 GPT 记得问题、牌面和之前的解读。
"""

import copy
import json
import os
import secrets
import threading
import time
from typing import Optional

from .agent import PRINCIPLES, TOOLS, make_client
from .deck import build_deck
from .drawing import DrawnCard, DrawResult, shuffle
from .spreads import SPREADS, WEB_SPREADS, describe_spreads

N_PICK = 3

WEB_SYSTEM_PROMPT = f"""你是一位温和、专业、经验丰富的塔罗占卜师，在一个塔罗占卜网页里为用户占卜，使用韦特塔罗（78 张），全程使用简体中文。

## 工作流程
1. 收到用户的问题后，立即调用 draw_cards 工具：选择最合适的牌阵，必要时把是非题或模糊问题改写成开放式问题，
   并在 intro 里用一两句温暖的话告诉用户你选择这个牌阵的原因。每次占卜固定抽三张牌，可用牌阵：
{describe_spreads(WEB_SPREADS)}
2. 网页会为用户洗牌，把 78 张牌背面朝上摊开，由用户凭直觉亲手挑选三张，按挑选顺序放入牌位，然后把牌面交给你。
   你绝对不能编造、挑选或修改牌面，只能解读程序返回的牌。
3. 之后按要求的 JSON 结构输出解读，并提出 2~3 个追问问题，了解用户的具体处境。
4. 用户回答后，基于同一组牌（不重新抽牌）为用户定制更贴合的方案。

## 解读要求
- 每张牌都结合「牌本身的象征 + 正逆位 + 所在牌位 + 用户的问题」解释，不要机械背诵牌义。
- 整体解读要把所有牌串联成一个完整的故事：牌与牌的呼应或冲突、大牌与小牌的比例、花色元素（火/水/风/土）的分布。
- 文字优美、有温度，适合用书法字体展示；但内容要具体，不要空泛的鸡汤。

{PRINCIPLES}"""

# 网页版的抽牌工具多一个 intro 字段
WEB_TOOLS = copy.deepcopy(TOOLS)
_params = WEB_TOOLS[0]["function"]["parameters"]
_params["properties"]["intro"] = {
    "type": "string",
    "description": "一两句温暖的话：回应用户的心情，并说明为什么选择这个牌阵（40~80 字）",
}
_params["required"] = ["spread", "question", "intro"]
_params["properties"]["spread"]["enum"] = WEB_SPREADS


def _schema(name: str, props: dict) -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": {"type": "object", "additionalProperties": False,
                       "required": list(props), "properties": props},
        },
    }


_STR = {"type": "string"}
READING_FORMAT = _schema("tarot_reading", {
    "opening": {"type": "string", "description": "一两句开场白，温和地回应用户的问题"},
    "cards": {
        "type": "array",
        "description": "按牌位顺序，每张抽到的牌一项",
        "items": {
            "type": "object", "additionalProperties": False,
            "required": ["position", "name", "orientation", "keywords", "meaning"],
            "properties": {
                "position": _STR, "name": _STR,
                "orientation": {"type": "string", "enum": ["正位", "逆位"]},
                "keywords": {"type": "string", "description": "3~4 个关键词，用顿号分隔"},
                "meaning": {"type": "string", "description": "2~4 句，结合牌位与问题解读这张牌"},
            },
        },
    },
    "story": {"type": "array", "items": _STR, "description": "整体解读，3~4 段，每段 80~150 字"},
    "advice": {"type": "array", "items": _STR, "description": "2~4 条具体可执行的行动建议"},
    "followup_questions": {"type": "array", "items": _STR,
                           "description": "2~3 个追问，了解用户的具体处境，以便之后定制方案"},
})

PLAN_FORMAT = _schema("tarot_plan", {
    "title": {"type": "string", "description": "方案标题，8~16 字"},
    "paragraphs": {"type": "array", "items": _STR,
                   "description": "2~3 段：结合用户的补充信息和同一组牌，重新审视处境"},
    "steps": {
        "type": "array",
        "description": "3~5 个具体步骤",
        "items": {
            "type": "object", "additionalProperties": False,
            "required": ["title", "detail", "card"],
            "properties": {
                "title": {"type": "string", "description": "步骤标题，4~10 字"},
                "detail": {"type": "string", "description": "具体怎么做，1~3 句"},
                "card": {"type": "string", "description": "这一步主要呼应哪张牌（牌名）"},
            },
        },
    },
    "closing": {"type": "string", "description": "一句温暖的结语"},
})

_DECK = build_deck()
_DECK_BY_NAME = {c.name: c for c in _DECK}


def card_payload(dc) -> dict:
    """给网页的牌面数据（含绘制牌面所需的 id）。"""
    c = dc.card
    return {"id": c.id, "name": c.name, "name_en": c.name_en, "arcana": c.arcana,
            "suit": c.suit, "position": dc.position, "reversed": dc.reversed,
            "orientation": dc.orientation, "pile": dc.pile, "keywords": dc.meaning}


class WebReading:
    def __init__(self, question: str, use_reversed: bool = True, mock: bool = False,
                 model: Optional[str] = None):
        self.id = secrets.token_urlsafe(12)
        self.question = question.strip()
        self.use_reversed = use_reversed
        self.mock = mock
        self.client = None if mock else make_client()
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-5")
        # 网页版默认 low：实测解读等待时间约减半，质量接近；设为 default 则不传该参数
        effort = (os.getenv("OPENAI_REASONING_EFFORT") or "low").strip()
        self.effort = None if effort in ("", "default") else effort
        self.lock = threading.Lock()
        self.created = time.time()
        self.messages: list[dict] = [{"role": "system", "content": WEB_SYSTEM_PROMPT},
                                     {"role": "user", "content": self.question}]
        self.spread_key: Optional[str] = None
        self._tool_call_id: Optional[str] = None
        self._deck = None
        self.result: Optional[DrawResult] = None
        self.reading: Optional[dict] = None

    # ---------------- GPT 调用 ----------------
    def _chat(self, **kw):
        if self.effort:
            kw["reasoning_effort"] = self.effort
        return self.client.chat.completions.create(model=self.model, messages=self.messages, **kw)

    # ---------------- 步骤 1：选牌阵 ----------------
    def plan(self) -> dict:
        if self.mock:
            args = _mock_plan(self.question)
            self._tool_call_id = "mock_call"
            self.messages.append({"role": "assistant", "content": None, "tool_calls": [{
                "id": "mock_call", "type": "function",
                "function": {"name": "draw_cards", "arguments": json.dumps(args, ensure_ascii=False)}}]})
        else:
            resp = self._chat(tools=WEB_TOOLS,
                              tool_choice={"type": "function", "function": {"name": "draw_cards"}})
            msg = resp.choices[0].message
            tc = msg.tool_calls[0]
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            self._tool_call_id = tc.id
            self.messages.append({"role": "assistant", "content": msg.content,
                                  "tool_calls": [tc.model_dump()]})

        self.spread_key = args.get("spread") if args.get("spread") in WEB_SPREADS else "three_situation"
        sp = SPREADS[self.spread_key]
        self.final_question = (args.get("question") or self.question).strip()
        self.intro = (args.get("intro") or "").strip()
        return {"spread": self.spread_key, "spread_name": sp["name"], "positions": sp["positions"],
                "question": self.final_question, "intro": self.intro}

    # ---------------- 步骤 2：洗牌（牌序只保存在服务器） ----------------
    def shuffle(self) -> int:
        self._deck = shuffle(build_deck(), self.use_reversed)
        return len(self._deck)

    # ---------------- 步骤 3：用户亲手挑三张 ----------------
    def draw(self, picks: list[int]) -> list[dict]:
        if self.result is not None:
            raise RuntimeError("这次占卜已经抽过牌了")
        if self._deck is None or self.spread_key is None:
            raise RuntimeError("还没有洗牌")
        if len(picks) != N_PICK or len(set(picks)) != N_PICK or not all(0 <= p < len(self._deck) for p in picks):
            raise ValueError(f"需要从摊开的牌中选出 {N_PICK} 张不同的牌")
        sp = SPREADS[self.spread_key]
        drawn = [DrawnCard(pos, *self._deck[p], pick_index=p) for pos, p in zip(sp["positions"], picks)]
        self.result = DrawResult((len(self._deck), 0), 0, drawn, mode="fan")
        payload = {"牌阵": sp["name"], "占卜问题": self.final_question, **self.result.to_dict()}
        self.messages.append({"role": "tool", "tool_call_id": self._tool_call_id,
                              "content": json.dumps(payload, ensure_ascii=False)})
        return [card_payload(c) for c in self.result.cards]

    # ---------------- 步骤 4：解读 ----------------
    def interpret(self) -> dict:
        if self.reading is not None:
            return self.reading
        if self.result is None:
            raise RuntimeError("还没有抽牌")
        self.messages.append({"role": "user", "content":
                              "牌已经抽好了。请按 JSON 结构给出这次占卜的完整解读，并提出 2~3 个追问问题。"})
        if self.mock:
            data = _mock_reading(self.result)
            time.sleep(2.5)
        else:
            resp = self._chat(tools=WEB_TOOLS, tool_choice="none", response_format=READING_FORMAT)
            data = json.loads(resp.choices[0].message.content)
        # 牌面以程序抽到的为准，防止模型写错牌名或正逆位
        gpt_cards = data.get("cards") or []
        fixed = []
        for i, dc in enumerate(self.result.cards):
            g = gpt_cards[i] if i < len(gpt_cards) else {}
            fixed.append({"position": dc.position, "name": dc.card.name, "orientation": dc.orientation,
                          "keywords": g.get("keywords") or dc.meaning,
                          "meaning": g.get("meaning") or dc.meaning})
        data["cards"] = fixed
        self.messages.append({"role": "assistant", "content": json.dumps(data, ensure_ascii=False)})
        self.reading = data
        return data

    # ---------------- 步骤 5：追问后定制方案 ----------------
    def followup(self, answers: str) -> dict:
        if self.reading is None:
            raise RuntimeError("还没有完成解读")
        self.messages.append({"role": "user", "content":
                              f"这是我补充的具体情况：\n{answers.strip()}\n\n"
                              "请基于同一组牌（不要重新抽牌），结合我的情况，为我定制一份更贴合的方案，按 JSON 结构输出。"})
        if self.mock:
            data = _mock_plan_result(self.result, answers)
            time.sleep(2)
        else:
            resp = self._chat(tools=WEB_TOOLS, tool_choice="none", response_format=PLAN_FORMAT)
            data = json.loads(resp.choices[0].message.content)
        self.messages.append({"role": "assistant", "content": json.dumps(data, ensure_ascii=False)})
        return data


# ---------------- mock（不调用 GPT，用于调试网页） ----------------
def _mock_plan(q: str) -> dict:
    if any(w in q for w in ("还是", "选哪", "二选一", "该选")):
        spread = "three_choice"
    elif any(w in q for w in ("感情", "男朋友", "女朋友", "恋", "他", "她", "婚", "朋友", "家")):
        spread = "three_relationship"
    elif any(w in q for w in ("未来", "接下来", "发展")):
        spread = "three_time"
    else:
        spread = "three_situation"
    return {"spread": spread, "question": q,
            "intro": "（mock）感谢你带着这个问题来到这里。我们用这个牌阵，一起看看现状、阻碍与前行的方向。"}


def _mock_reading(result: DrawResult) -> dict:
    return {
        "opening": "（mock 解读）牌已经落定，让我们一张一张地读懂它们。",
        "cards": [{"position": c.position, "name": c.card.name, "orientation": c.orientation,
                   "keywords": c.meaning,
                   "meaning": f"在「{c.position}」的位置上，{c.card.name}{c.orientation}提示你：{c.meaning}。"}
                  for c in result.cards],
        "story": ["这是 mock 模式生成的整体解读第一段，用于调试网页的排版和动画效果。真实模式下这里会由 GPT 把所有牌串联成一个完整的故事。",
                  "第二段会分析牌与牌之间的呼应，以及大阿尔卡那与小阿尔卡那、四种元素的比例透露出的主题。",
                  "第三段会回到你的问题，给出温和而具体的总结。"],
        "advice": ["先把眼前最重要的一件事写下来。", "和信任的人聊一聊你的想法。", "给自己一个明确的时间点去行动。"],
        "followup_questions": ["这件事目前进行到哪一步了？", "你最担心的是什么？", "你希望在多长时间内看到变化？"],
    }


def _mock_plan_result(result: DrawResult, answers: str) -> dict:
    names = [c.card.name for c in result.cards]
    return {
        "title": "为你定制的前行方案",
        "paragraphs": [f"（mock）结合你补充的情况，我们再回到这几张牌：{'、'.join(names)}。",
                       "真实模式下，这里会根据你的回答给出更贴合你处境的分析。"],
        "steps": [{"title": f"第 {i + 1} 步", "detail": f"围绕「{c.position}」这张牌给出的具体行动。",
                   "card": c.card.name} for i, c in enumerate(result.cards[:4])],
        "closing": "愿你带着清晰与勇气，走好接下来的每一步。",
    }
