"""塔罗占卜 Agent：GPT 负责选择牌阵与解读，抽牌通过工具调用交给本地 RNG。

流程：
  用户提问 → GPT 判断问题类型、选择牌阵 → 调用 draw_cards 工具
  → 本地洗牌、切成两堆、占卜者选堆、抽牌 → 结果返回 GPT → GPT 生成中文解读
"""

import json
import os
from typing import Callable, Optional

from openai import OpenAI

from .drawing import DrawResult, draw_two_piles
from .spreads import CLI_SPREADS, SPREADS, describe_spreads

PRINCIPLES = """## 原则
- 逆位不等于坏牌，正位也不一定是好牌，要结合上下文。
- 用"可能""倾向于""提醒你"等措辞，不要把象征意义说成确定会发生的事实，不做绝对预言。
- 涉及健康、法律、重大财务决定时，提醒用户以专业人士意见为准。
- 用户在同一次占卜中追问时，基于已抽出的牌继续深入解读，除非用户明确要求重新抽牌或提出了新问题。
"""


def make_client() -> OpenAI:
    # 注意：.env 里 OPENAI_BASE_URL 留空时，不能传 None —— openai SDK 会再去读这个
    # 环境变量，拿到空字符串，导致请求地址为空（表现为 "Connection error"）。
    base_url = (os.getenv("OPENAI_BASE_URL") or "").strip() or "https://api.openai.com/v1"
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"), base_url=base_url)


SYSTEM_PROMPT = f"""你是一位温和、专业、经验丰富的塔罗占卜师，使用韦特塔罗（78 张）为用户占卜，全程使用简体中文。

## 工作流程
1. 理解用户的问题。如果问题过于模糊或是绝对的是非题（如"我一定能成功吗"），可以先帮用户把它改写成开放式问题，再进行占卜。
2. 根据问题选择最合适的牌阵，**立即调用 draw_cards 工具抽牌**。可用牌阵：
{describe_spreads()}
3. 抽牌由程序的真实随机数完成：洗牌后切成左右两堆，两堆轮流从堆顶各抽一张。
   **选择从哪一堆开始，由程序在工具内部直接询问用户**，你不需要、也不要在对话里让用户选堆。
   你绝对不能自己编造、挑选或修改牌面，只能解读工具返回的牌。
   不要在抽牌前追问细节（时间范围、具体情况等），用合理的默认假设直接抽牌；
   如果补充信息会让解读更准确，可以在解读的最后邀请用户补充。
4. 拿到牌面后，按下面的结构输出解读。

## 解读格式
### 🃏 牌面
用列表列出每个牌位、牌名、正逆位。

### 🔍 逐张解读
每张牌结合「牌本身的象征 + 正逆位 + 所在牌位 + 用户的问题」来解释，而不是机械背诵牌义。

### 🌙 整体解读
把所有牌串联成一个完整的故事：牌与牌之间的呼应或冲突、大牌与小牌的比例、花色元素的分布（火/水/风/土）透露的主题。

### 🌱 行动建议
给出 2~4 条具体、可执行的建议。

{PRINCIPLES}"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "draw_cards",
            "description": "使用两堆抽牌法真实随机地抽取塔罗牌。洗牌后切成左右两堆，由用户选择起始堆，两堆轮流从堆顶抽牌，按牌位顺序摆放。",
            "parameters": {
                "type": "object",
                "properties": {
                    "spread": {
                        "type": "string",
                        "enum": CLI_SPREADS,
                        "description": "牌阵代号",
                    },
                    "question": {
                        "type": "string",
                        "description": "最终用于占卜的问题（可以是你帮用户改写后的开放式问题）",
                    },
                },
                "required": ["spread", "question"],
            },
        },
    }
]


class TarotAgent:
    def __init__(
        self,
        model: Optional[str] = None,
        use_reversed: bool = True,
        choose_pile: Optional[Callable[[int, int], int]] = None,
        on_draw: Optional[Callable[[str, str, DrawResult], None]] = None,
        draw_mode: str = "alternate",
    ):
        """
        model:        GPT 模型名，默认读取环境变量 OPENAI_MODEL，否则用 gpt-5
        use_reversed: 是否启用逆位
        choose_pile:  选堆回调 (左堆张数, 右堆张数) -> 0/1，用于让用户亲自选堆
        on_draw:      抽牌完成后的回调，用于在界面上展示牌面
        draw_mode:    "alternate"（两堆轮流抽，默认）或 "pick"（只从一堆抽）
        """
        self.draw_mode = draw_mode
        self.client = make_client()
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-5")
        self.use_reversed = use_reversed
        self.choose_pile = choose_pile
        self.on_draw = on_draw
        self.reset()

    def reset(self) -> None:
        """清空对话，开始新的占卜。"""
        self.messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
        self.last_draw: Optional[DrawResult] = None

    # ---------- 工具执行 ----------
    def _draw_cards(self, spread: str, question: str) -> str:
        if spread not in SPREADS:
            return json.dumps({"错误": f"未知牌阵 {spread}"}, ensure_ascii=False)
        sp = SPREADS[spread]
        result = draw_two_piles(sp["positions"], self.use_reversed, self.choose_pile, self.draw_mode)
        self.last_draw = result
        if self.on_draw:
            self.on_draw(sp["name"], question, result)
        payload = {"牌阵": sp["name"], "占卜问题": question, **result.to_dict()}
        return json.dumps(payload, ensure_ascii=False)

    # ---------- Agent 主循环 ----------
    def ask(self, user_input: str, max_steps: int = 5) -> str:
        self.messages.append({"role": "user", "content": user_input})

        for _ in range(max_steps):
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=self.messages,
                tools=TOOLS,
            )
            msg = resp.choices[0].message

            if not msg.tool_calls:
                content = msg.content or ""
                self.messages.append({"role": "assistant", "content": content})
                return content

            # 记录模型的工具调用，再逐个执行
            self.messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [tc.model_dump() for tc in msg.tool_calls],
            })
            for tc in msg.tool_calls:
                if tc.function.name == "draw_cards":
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                        output = self._draw_cards(args.get("spread", ""), args.get("question", user_input))
                    except json.JSONDecodeError:
                        output = json.dumps({"错误": "参数解析失败"}, ensure_ascii=False)
                else:
                    output = json.dumps({"错误": f"未知工具 {tc.function.name}"}, ensure_ascii=False)
                self.messages.append({"role": "tool", "tool_call_id": tc.id, "content": output})

        return "（Agent 步数超限，未能完成解读，请重试。）"
