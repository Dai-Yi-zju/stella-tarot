"""牌阵定义：每个牌阵由若干牌位组成，牌位含义在抽牌前就固定。"""

SPREADS: dict[str, dict] = {
    "single": {
        "name": "单张牌阵",
        "description": "快速占卜，适合简单、聚焦的问题或每日指引",
        "positions": ["核心指引"],
    },
    "three_situation": {
        "name": "三张牌阵（现状·阻碍·建议）",
        "description": "最推荐的通用牌阵，适合大多数具体问题",
        "positions": ["现状", "阻碍", "建议"],
    },
    "three_time": {
        "name": "三张牌阵（过去·现在·未来）",
        "description": "观察事情的发展脉络",
        "positions": ["过去", "现在", "未来趋势"],
    },
    "five": {
        "name": "五张牌阵",
        "description": "深入分析，从多个角度看一件事",
        "positions": ["现状", "优势", "阻碍", "建议", "可能走向"],
    },
    "choice": {
        "name": "二选一牌阵",
        "description": "在两个选项之间犹豫时使用",
        "positions": ["现状", "选择A的发展", "选择A的结果", "选择B的发展", "选择B的结果"],
    },
    "relationship": {
        "name": "关系牌阵",
        "description": "感情或人际关系问题",
        "positions": ["我的状态", "对方的状态", "关系现状", "关系中的挑战", "建议"],
    },
    "three_relationship": {
        "name": "三张牌阵（我·对方·关系走向）",
        "description": "感情、友情、家人等关系问题",
        "positions": ["我的状态", "对方的状态", "关系走向"],
    },
    "three_choice": {
        "name": "三张牌阵（选项A·选项B·建议）",
        "description": "在两个选项之间犹豫时使用",
        "positions": ["选项A", "选项B", "建议"],
    },
}

# 命令行版可用的牌阵（保持原样）
CLI_SPREADS = ["single", "three_situation", "three_time", "five", "choice", "relationship"]
# 网页版：固定只抽三张牌
WEB_SPREADS = ["three_situation", "three_time", "three_relationship", "three_choice"]


def describe_spreads(keys: list[str] | None = None) -> str:
    lines = []
    for key in keys or CLI_SPREADS:
        s = SPREADS[key]
        lines.append(f"- {key}: {s['name']}（{len(s['positions'])} 张）— {s['description']}；牌位：{'、'.join(s['positions'])}")
    return "\n".join(lines)
