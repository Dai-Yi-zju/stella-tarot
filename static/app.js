/* 星语塔罗 · 页面流程与动画
 * 提问 → 洗牌（等待 GPT 选牌阵）→ 78 张牌摊开 → 用户亲手挑 3 张 → 翻牌
 * → 解读（牌面释义 + 书法体整体解读与行动建议）→ 追问 → 定制方案
 * 真正的牌序只在服务器上；网页只知道用户点的是摊开的第几张牌。
 */
(function () {
  TarotArt.install();
  const $ = (s, el = document) => el.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 40) : ms));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CN_NUM = "一二三四五六七八九十";
  const N_VIS = 78; // 摊开的牌数：第 i 张对应服务器洗好的牌序中的第 i 张
  const N_PICK = 3;

  const state = { id: null, plan: null, cards: [], els: [], slots: [], picks: [], n: 3, phase: "idle", skip: false };
  const G = {};

  // ---------------- 通用 ----------------
  async function api(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : `请求失败（${r.status}）`);
    return data;
  }
  let toastTimer;
  function toast(msg, ms = 6000) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), ms);
  }
  async function narrate(text) {
    const n = $("#narr");
    n.classList.add("fade"); await sleep(350);
    n.textContent = text || ""; n.classList.remove("fade"); await sleep(200);
  }
  function fail(e) {
    toast(e.message || String(e), 12000);
    narrate("星光暂时被云遮住了……");
    const again = document.createElement("div");
    again.style.cssText = "text-align:center;margin-top:16px";
    again.innerHTML = `<button class="btn ghost" type="button">重新开始</button>`;
    again.querySelector("button").onclick = () => location.reload();
    $("#table").appendChild(again);
    showOracle(false);
  }

  fetch("/api/config").then((r) => r.json()).then((c) => {
    if (c.mock) $("#mockBadge").hidden = false;
    if (c.need_code) {
      state.needCode = true;
      $("#codeRow").hidden = false;
      try { $("#accessCode").value = localStorage.getItem("tarot-code") || ""; } catch (e) {}
    }
  }).catch(() => {});

  // ---------------- 舞台布局 ----------------
  function layout(n) {
    const stage = $("#stage");
    const W = stage.clientWidth;
    const gap = Math.max(10, Math.min(22, W * 0.03));
    // 窄屏上 4~5 张牌分两行（3 + 2），避免牌太小、牌位文字重叠
    const perRow = n > 3 && W < 600 ? 3 : n;
    let cw = (W - 8 - gap * (perRow - 1)) / perRow;
    cw = n === 1 ? Math.min(160, W * 0.42) : Math.max(52, Math.min(124, cw));
    Object.assign(G, { W, n, gap, cw, ch: cw * 1.7, perRow, rows: Math.ceil(n / perRow) });
    G.rowH = G.ch + 62;
    G.pw = Math.min(cw, W < 500 ? 78 : 104); G.ph = G.pw * 1.7; G.ps = G.pw / cw;
    G.pileY = 14;
    G.deckX = W / 2;
    // 摊牌：宽屏一行，窄屏分 2~3 行，每行一条弧线
    G.fanRows = W < 520 ? 3 : W < 860 ? 2 : 1;
    G.perFan = Math.ceil(N_VIS / G.fanRows);
    G.fw = W < 520 ? 46 : W < 860 ? 54 : 62; G.fh = G.fw * 1.7; G.fs = G.fw / cw;
    G.fanStep = (W - 12 - G.fw) / (G.perFan - 1);
    G.fanSag = G.fanRows === 1 ? 34 : 16;
    G.fanRowH = G.fh + G.fanSag + 14;
    const fanH = G.fanRows * G.fanRowH + 10;
    // 选完牌后摊开的牌消失，牌阵上移填补空白
    G.spreadY = state.compact ? G.pileY : G.pileY + Math.max(fanH, G.ph + 30) + 26;
    stage.style.setProperty("--cw", cw + "px");
    stage.style.height = G.spreadY + G.rows * G.rowH + 10 + "px";
  }
  function slotCenter(i) {
    const row = Math.floor(i / G.perRow), col = i % G.perRow;
    const inRow = Math.min(G.perRow, G.n - row * G.perRow);
    const total = inRow * G.cw + (inRow - 1) * G.gap;
    return [(G.W - total) / 2 + G.cw / 2 + col * (G.cw + G.gap), G.spreadY + row * G.rowH + G.ch / 2];
  }
  function place(el, cx, cy, rot = 0, s = 1) {
    el.style.transform = `translate(${cx - G.cw / 2}px, ${cy - G.ch / 2}px) rotate(${rot}deg) scale(${s})`;
  }
  // 按卡牌当前角色摆放（用于窗口缩放后重新排列）
  function placeByRole(el) {
    const r = el._role || { t: "deck", k: 0 };
    const deckCy = G.pileY + G.ph / 2;
    if (r.t === "deck") place(el, G.deckX, deckCy - r.k * 0.2, 0, G.ps);
    else if (r.t === "fan") { const [x, y, rot] = fanPos(r.i); place(el, x, y, rot, G.fs); }
    else if (r.t === "slot") { const [x, y] = slotCenter(r.i); place(el, x, y, 0, 1); }
  }
  // 摊开的第 i 张牌的位置：每行一条中间高、两边低的弧线
  function fanPos(i) {
    const row = Math.floor(i / G.perFan), col = i % G.perFan;
    const inRow = Math.min(G.perFan, N_VIS - row * G.perFan);
    const t = inRow > 1 ? col / (inRow - 1) : 0.5; // 0~1
    const u = 2 * t - 1;                             // -1~1
    const x = 6 + G.fw / 2 + col * G.fanStep + (G.perFan - inRow) * G.fanStep / 2;
    const y = G.pileY + row * G.fanRowH + G.fh / 2 + G.fanSag * u * u;
    return [x, y, u * (G.fanRows === 1 ? 16 : 9)];
  }
  function relayout() {
    if (state.phase === "idle") return;
    layout(state.n);
    state.els.forEach(placeByRole);
    positionLabels();
  }
  let rT; addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(relayout, 150); });

  function makeDeck() {
    const stage = $("#stage");
    stage.innerHTML = "";
    state.els = [];
    for (let k = 0; k < N_VIS; k++) {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `<div class="inner"><div class="back">${TarotArt.back()}</div><div class="face"></div></div>`;
      el._role = { t: "deck", k };
      el.style.zIndex = k;
      el.style.opacity = "0";
      stage.appendChild(el);
      state.els.push(el);
      placeByRole(el);
    }
    requestAnimationFrame(() => state.els.forEach((el, k) => setTimeout(() => (el.style.opacity = "1"), k * 6)));
  }

  // ---------------- 洗牌动画 ----------------
  async function fan() {
    const els = state.els, R = Math.min(G.W * 0.42, 330), cy = G.pileY + G.ph / 2;
    els.forEach((el, k) => {
      const a = -55 + (110 * k) / (els.length - 1);
      const rad = (a * Math.PI) / 180;
      el.style.transitionDelay = k * 5 + "ms";
      place(el, G.deckX + R * Math.sin(rad), cy + 40 + R * 0.35 * (1 - Math.cos(rad)) * 2, a * 0.6, G.ps);
    });
    await sleep(1100);
    els.forEach((el, k) => { el.style.transitionDelay = (els.length - k) * 4 + "ms"; placeByRole(el); });
    await sleep(800);
    els.forEach((el) => (el.style.transitionDelay = ""));
  }
  async function riffle() {
    const els = state.els, half = Math.floor(els.length / 2), cy = G.pileY + G.ph / 2, off = G.pw * 0.85;
    els.forEach((el, k) => {
      const left = k < half;
      el.style.transitionDelay = (k % half) * 3 + "ms";
      place(el, G.deckX + (left ? -off : off), cy - (k % half) * 0.5, left ? -9 : 9, G.ps);
    });
    await sleep(420);
    // 交错合并：新顺序左右交替并带一点随机
    const L = els.slice(0, half), Rr = els.slice(half), merged = [];
    while (L.length || Rr.length) {
      const fromL = L.length && (!Rr.length || Math.random() < 0.5);
      merged.push(fromL ? L.shift() : Rr.shift());
    }
    state.els = merged;
    merged.forEach((el, k) => {
      el._role = { t: "deck", k };
      el.style.zIndex = k;
      el.style.transitionDelay = k * 4 + "ms";
      placeByRole(el);
    });
    await sleep(560);
    merged.forEach((el) => (el.style.transitionDelay = ""));
  }
  async function shuffleUntil(promise) {
    let done = false, res, err;
    promise.then((r) => { done = true; res = r; }, (e) => { done = true; err = e; });
    await fan();
    let rounds = 0;
    const lines = ["牌在指尖流转……", "静心，把问题放在心上", "星辰正在聆听你的心声", "牌在等待与你相遇"];
    while (!done || rounds < 2) {
      if (rounds % 2 === 0) narrate(lines[(rounds / 2) % lines.length]);
      await riffle();
      if (++rounds % 5 === 0 && !done) await fan();
      if (rounds > 60) break;
    }
    if (err) throw err;
    return res;
  }

  // ---------------- 牌位占位 & 摊牌 & 亲手挑牌 ----------------
  function positionLabels() {
    document.querySelectorAll(".slot-ph").forEach((ph) => {
      const [x, y] = slotCenter(+ph.dataset.i);
      Object.assign(ph.style, { left: x - G.cw / 2 + "px", top: y - G.ch / 2 + "px", width: G.cw + "px", height: G.ch + "px" });
    });
    document.querySelectorAll(".slot-label").forEach((lb) => {
      const [x, y] = slotCenter(+lb.dataset.i);
      lb.style.left = x + "px"; lb.style.top = y + G.ch / 2 + 8 + "px";
      lb.style.width = G.cw + G.gap - 2 + "px";
    });
  }
  // 牌阵确定后，先在下方画出三个空牌位（虚线框 + 牌位名），让用户知道挑牌的顺序
  function makeSlots(positions) {
    const stage = $("#stage");
    positions.forEach((pos, i) => {
      const ph = document.createElement("div");
      ph.className = "slot-ph"; ph.dataset.i = i;
      ph.innerHTML = `<span>${CN_NUM[i]}</span>`;
      stage.appendChild(ph);
      const lb = document.createElement("div");
      lb.className = "slot-label"; lb.dataset.i = i;
      lb.innerHTML = `<span class="pos">${esc(pos)}</span><span class="nm"></span>`;
      stage.appendChild(lb);
    });
    positionLabels();
  }
  // 洗好的牌从左到右摊开
  async function spreadFan() {
    state.els.forEach((el, i) => {
      el._role = { t: "fan", i };
      el.style.zIndex = i;
      el.style.transitionDelay = i * 9 + "ms";
      placeByRole(el);
    });
    await sleep(N_VIS * 9 + 700);
    state.els.forEach((el) => (el.style.transitionDelay = ""));
  }
  // 等用户亲手挑 N_PICK 张；返回挑中的位置编号（按挑选顺序）
  function pickCards(positions) {
    return new Promise((resolve) => {
      const picks = [];
      state.slots = [];
      const choose = (el) => {
        if (picks.length >= N_PICK || el._picked) return;
        el._picked = true;
        const i = picks.length;
        picks.push(el._role.i);
        el.classList.remove("pickable");
        el.removeAttribute("tabindex");
        el.style.zIndex = 400 + i;
        el._role = { t: "slot", i };
        placeByRole(el);
        state.slots.push(el);
        const ph = $(`.slot-ph[data-i="${i}"]`);
        if (ph) ph.classList.add("filled");
        if (picks.length < N_PICK) {
          narrate(`已选 ${picks.length} / ${N_PICK} 张。下一张将放在「${positions[picks.length]}」`);
        } else {
          state.els.forEach((x) => { x.classList.remove("pickable"); x.removeAttribute("tabindex"); });
          resolve(picks);
        }
      };
      state.els.forEach((el) => {
        el.classList.add("pickable");
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `摊开的第 ${el._role.i + 1} 张牌`);
        el.onclick = () => choose(el);
        el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(el); } };
      });
    });
  }
  // 挑完后：其余的牌收起淡出，牌阵上移
  async function clearFan() {
    const rest = state.els.filter((el) => !el._picked);
    rest.forEach((el, k) => {
      el.style.transitionDelay = (rest.length - k) * 4 + "ms";
      el._role = { t: "deck", k };
      placeByRole(el);
      el.style.opacity = "0";
    });
    await sleep(900);
    rest.forEach((el) => el.remove());
    document.querySelectorAll(".slot-ph").forEach((ph) => ph.remove());
    state.els = state.slots.slice();
    state.compact = true;
    relayout();
    await sleep(700);
  }

  // ---------------- 翻牌 ----------------
  async function flipAll(cards) {
    for (let i = 0; i < state.slots.length; i++) {
      const el = state.slots[i], c = cards[i];
      const face = $(".face", el);
      face.innerHTML = TarotArt.face(c);
      face.classList.toggle("rev", !!c.reversed);
      el.removeAttribute("role"); el.removeAttribute("aria-label");
      el.classList.add("flipped");
      await sleep(520);
      el.classList.add("revealed");
      el.onclick = () => zoom(c);
      const nm = $(`.slot-label[data-i="${i}"] .nm`);
      nm.innerHTML = `${esc(c.name)} · <span class="${c.reversed ? "rv" : ""}">${c.orientation}</span>`;
      nm.classList.add("on");
      await sleep(380);
    }
  }

  // ---------------- 等待解读 ----------------
  let oracleTimer;
  (function initOracleStar() {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (-90 + i * 22.5) * Math.PI / 180, r = i % 2 ? 26 : 70;
      pts.push(`${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`);
    }
    $("#oracleStar").setAttribute("points", pts.join(" "));
  })();
  function showOracle(on, msgs) {
    const o = $("#oracle");
    clearInterval(oracleTimer);
    if (!on) { o.classList.remove("on"); return; }
    msgs = msgs || ["塔罗师正在凝视牌面……", "星辰正在低语……", "命运的丝线正在编织……", "把牌与牌连成一个故事……"];
    let k = 0;
    const m = $("#oracleMsg");
    m.textContent = msgs[0];
    o.classList.add("on");
    oracleTimer = setInterval(() => {
      m.style.opacity = "0";
      setTimeout(() => { m.textContent = msgs[++k % msgs.length]; m.style.opacity = "1"; }, 450);
    }, 3200);
  }

  // ---------------- 放大查看 ----------------
  function zoom(c) {
    const big = $("#modalCard");
    big.innerHTML = TarotArt.face(c);
    big.classList.toggle("rev", !!c.reversed);
    $("#modalCap").textContent = `${c.position} · ${c.name}（${c.orientation}）`;
    $("#modal").classList.add("on");
  }
  $("#modal").onclick = () => $("#modal").classList.remove("on");
  addEventListener("keydown", (e) => { if (e.key === "Escape") $("#modal").classList.remove("on"); });

  // ---------------- 书法体"落墨"效果 ----------------
  async function inkWrite(container, paragraphs, tag = "p", speed = 22) {
    for (const text of paragraphs) {
      const el = document.createElement(tag);
      const chars = [...String(text)];
      el.innerHTML = chars.map((ch, k) => `<span class="ink" style="animation-delay:${state.skip ? 0 : k * speed}ms">${esc(ch)}</span>`).join("");
      container.appendChild(el);
      if (!state.skip) await sleep(chars.length * speed + 250);
    }
  }
  function reveal(el) { el.classList.add("show"); }

  // ---------------- 渲染解读 ----------------
  async function renderReading(r) {
    const res = $("#results");
    const cards = state.cards;
    res.innerHTML = `
      <section class="section panel"><div class="ornament">✦ ✧ ✦</div><p class="opening">${esc(r.opening)}</p></section>
      <section class="section panel">
        <h3 class="section-title">牌面释义</h3><div class="ornament">— ✦ —</div>
        <div class="details">${r.cards.map((d, i) => `
          <div class="detail">
            <div class="mini ${cards[i].reversed ? "rev" : ""}" data-i="${i}">${TarotArt.face(cards[i])}</div>
            <div>
              <div class="head"><span class="pos">${esc(d.position)}</span><span class="nm">${esc(d.name)}</span>
                <span class="ori ${cards[i].reversed ? "rv" : ""}">${esc(d.orientation)}</span></div>
              <div class="kw">${esc(d.keywords)}</div>
              <p class="mean">${esc(d.meaning)}</p>
            </div>
          </div>`).join("")}</div>
      </section>
      <section class="section panel"><h3 class="section-title">命运的低语</h3><div class="ornament">— ✦ —</div><div class="callig" id="story"></div></section>
      <section class="section panel"><h3 class="section-title">行动指引</h3><div class="ornament">— ✦ —</div><ul class="advice callig" id="advice"></ul></section>
      <section class="section panel followup" id="follow">
        <h3 class="section-title">说说你的故事</h3><div class="ornament">— ✦ —</div>
        <p style="text-align:center;color:var(--muted);margin:0">回答下面的问题（可以只答一部分），塔罗师会基于这几张牌，为你定制更贴合的方案。</p>
        <div id="fqs">${r.followup_questions.map((q, i) => `
          <div class="q">${CN_NUM[i]}、${esc(q)}</div><textarea rows="2" data-q="${esc(q)}" maxlength="800"></textarea>`).join("")}
          <div class="q">还有什么想补充的？（可选）</div><textarea rows="2" data-q="其他补充" maxlength="800"></textarea>
        </div>
        <div class="actions"><button class="btn" id="followBtn" type="button">定制我的方案</button><button class="btn ghost" id="againBtn" type="button">重新占卜</button></div>
      </section>
      <div id="plans"></div>
      <p class="disclaimer">塔罗是自我反思的工具，解读仅供参考；涉及健康、法律、财务等重大决定，请以专业人士意见为准。</p>`;
    res.classList.add("on");
    res.querySelectorAll(".mini").forEach((m) => (m.onclick = () => zoom(cards[+m.dataset.i])));
    $("#againBtn").onclick = () => location.reload();
    $("#followBtn").onclick = submitFollowup;
    res.addEventListener("click", (e) => { if (e.target.closest(".callig")) skipInk(); });

    const secs = [...res.querySelectorAll(".section")];
    secs[0].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    reveal(secs[0]); await sleep(900);
    reveal(secs[1]); await sleep(1200);
    reveal(secs[2]); await sleep(500);
    await inkWrite($("#story"), r.story);
    reveal(secs[3]); await sleep(400);
    await inkWrite($("#advice"), r.advice, "li", 18);
    reveal(secs[4]);
  }
  function skipInk() {
    state.skip = true;
    document.querySelectorAll(".ink").forEach((s) => (s.style.animationDelay = "0ms"));
  }

  // ---------------- 追问 → 定制方案 ----------------
  async function submitFollowup() {
    const areas = [...document.querySelectorAll("#fqs textarea")];
    const parts = areas.filter((a) => a.value.trim()).map((a) => `问：${a.dataset.q}\n答：${a.value.trim()}`);
    if (!parts.length) { toast("先写下一点你的情况吧", 3000); return; }
    const btn = $("#followBtn");
    btn.disabled = true; btn.textContent = "方案生成中…";
    const plans = $("#plans");
    const wait = document.createElement("div");
    wait.className = "oracle on";
    wait.innerHTML = $("#oracle svg").outerHTML + `<div class="msg">塔罗师正在为你定制方案……</div>`;
    plans.appendChild(wait);
    wait.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    try {
      const p = await api("/api/followup", { id: state.id, answers: parts.join("\n\n") });
      wait.remove();
      await renderPlan(p);
      // 之后可以继续补充：换成一个自由输入框
      $("#fqs").innerHTML = `<div class="q">还想补充或追问什么？</div><textarea rows="3" data-q="继续补充" maxlength="800"></textarea>`;
      btn.textContent = "继续追问";
    } catch (e) {
      wait.remove();
      toast(e.message, 10000);
      btn.textContent = "定制我的方案";
    } finally {
      btn.disabled = false;
    }
  }
  async function renderPlan(p) {
    state.skip = false;
    const sec = document.createElement("section");
    sec.className = "section panel";
    sec.innerHTML = `
      <h3 class="section-title">${esc(p.title)}</h3><div class="ornament">— ✦ —</div>
      <div class="callig plan-text"></div>
      <div class="steps">${p.steps.map((s, i) => `
        <div class="step"><div class="seal">${CN_NUM[i] || i + 1}</div>
          <div><h4>${esc(s.title)}<small>${esc(s.card)}</small></h4><p>${esc(s.detail)}</p></div></div>`).join("")}</div>
      <p class="closing"></p>`;
    $("#plans").appendChild(sec);
    sec.querySelectorAll(".step").forEach((s) => { s.style.opacity = "0"; s.style.transition = "opacity .8s"; });
    await sleep(50);
    reveal(sec);
    sec.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    await sleep(500);
    await inkWrite($(".plan-text", sec), p.paragraphs);
    for (const s of sec.querySelectorAll(".step")) { s.style.opacity = "1"; await sleep(350); }
    await inkWrite($(".closing", sec), [p.closing], "span", 40);
  }

  // ---------------- 主流程 ----------------
  async function begin() {
    if (state.phase !== "idle") return;
    const q = $("#question").value.trim();
    if (!q) { toast("先写下你想问的问题吧", 3000); $("#question").focus(); return; }
    const code = $("#accessCode").value.trim();
    if (state.needCode && !code) { toast("请先输入访问口令", 3000); $("#accessCode").focus(); return; }
    try { if (code) localStorage.setItem("tarot-code", code); } catch (e) {}
    state.phase = "shuffle";
    $("#startBtn").disabled = true;
    $("#ask").classList.add("leaving");
    await sleep(600);
    $("#ask").style.display = "none";
    $("#table").classList.add("on");
    $("#qEcho").textContent = `「${q}」`;
    layout(3);
    makeDeck();
    await sleep(500);

    let plan;
    try {
      plan = await shuffleUntil(api("/api/start", { question: q, reversed: $("#useRev").checked, code }));
    } catch (e) { return fail(e); }
    state.id = plan.id; state.plan = plan; state.n = plan.positions.length;
    relayout();
    if (plan.question && plan.question !== q) $("#qEcho").textContent = `「${plan.question}」`;
    $("#spreadName").textContent = `${plan.spread_name} · ${plan.positions.join(" · ")}`;
    const intro = plan.intro || `我们用「${plan.spread_name}」来看这个问题。`;
    await narrate(intro);
    await sleep(Math.max(2400, intro.length * 110)); // 留够时间读完塔罗师的话

    state.phase = "pick";
    makeSlots(plan.positions);
    await spreadFan();
    await narrate(`${intro}\n${N_VIS} 张牌已经摊开。默念你的问题，凭直觉亲手选出 ${N_PICK} 张牌——第一张放在「${plan.positions[0]}」`);
    const picks = await pickCards(plan.positions);

    state.phase = "draw";
    narrate("三张牌已经选定……");
    const drawP = api("/api/draw", { id: state.id, picks });
    drawP.catch(() => {});
    await clearFan();
    let draw;
    try { draw = await drawP; } catch (e) { return fail(e); }
    state.cards = draw.cards;
    const interpretP = api("/api/interpret", { id: state.id }); // 翻牌动画的同时让 GPT 开始解读
    interpretP.catch(() => {});
    await narrate("翻开属于你的牌");
    await flipAll(draw.cards);
    state.phase = "done";
    await narrate("点击牌面可以放大查看");

    showOracle(true);
    let reading;
    try { reading = await interpretP; } catch (e) { return fail(e); }
    showOracle(false);
    await renderReading(reading);
  }

  $("#startBtn").onclick = begin;
  $("#question").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) begin(); });
  document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { $("#question").value = c.textContent; $("#question").focus(); }));
})();
