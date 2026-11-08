/* 星语塔罗 · 牌面绘制（原创 SVG 图案）
 * TarotArt.face(card) -> SVG 字符串；TarotArt.back() -> 牌背 SVG 字符串
 * card.id: 0~21 大阿尔卡那；22~77 小阿尔卡那（权杖、圣杯、宝剑、星币各 14 张：一~十、侍从、骑士、王后、国王）
 */
(function () {
  const GOLD = "#c9973a", GOLD_D = "#8a6420", INK = "#2a1d3a";
  const SUITS = [
    { key: "wands", cn: "权杖", accent: "#a8432a", sky: "g-sky-wands", el: "火" },
    { key: "cups", cn: "圣杯", accent: "#2d5c96", sky: "g-sky-cups", el: "水" },
    { key: "swords", cn: "宝剑", accent: "#47567a", sky: "g-sky-swords", el: "风" },
    { key: "pentacles", cn: "星币", accent: "#3c7438", sky: "g-sky-pentacles", el: "土" },
  ];
  const MAJOR_ACCENT = "#5b3a8c";
  const NIGHT = new Set([2, 9, 15, 16, 17, 18]);

  // ---------- 小工具 ----------
  const f = (n) => +n.toFixed(2);
  function starPts(cx, cy, R, r, n = 5, rot = -90) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = ((rot + (i * 180) / n) * Math.PI) / 180;
      const rad = i % 2 ? r : R;
      pts.push(`${f(cx + rad * Math.cos(a))},${f(cy + rad * Math.sin(a))}`);
    }
    return pts.join(" ");
  }
  function pentagram(cx, cy, r, inverted = false) {
    const base = inverted ? 90 : -90;
    const p = [0, 2, 4, 1, 3].map((k) => {
      const a = ((base + k * 72) * Math.PI) / 180;
      return `${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`;
    });
    return `M${p.join(" L")} Z`;
  }
  const star = (cx, cy, R, r, n, fill, extra = "") =>
    `<polygon points="${starPts(cx, cy, R, r, n)}" fill="${fill}" ${extra}/>`;
  function rays(cx, cy, r1, r2, n, stroke, w = 1.5, wavy = false) {
    let s = "";
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n;
      const rr = wavy && i % 2 ? r2 * 0.85 : r2;
      s += `<line x1="${f(cx + r1 * Math.cos(a))}" y1="${f(cy + r1 * Math.sin(a))}" x2="${f(cx + rr * Math.cos(a))}" y2="${f(cy + rr * Math.sin(a))}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
    }
    return s;
  }
  const use = (id, x, y, s = 1, rot = 0) =>
    `<use href="#${id}" transform="translate(${x},${y}) rotate(${rot}) scale(${s})"/>`;
  const heart = (x, y, s, fill, stroke = "none") =>
    `<path transform="translate(${x},${y}) scale(${s})" d="M0,6 C-10,-4 -18,4 -10,12 L0,22 L10,12 C18,4 10,-4 0,6 Z" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  const cloud = (x, y, s = 1, fill = "#fbf7ef") =>
    `<g transform="translate(${x},${y}) scale(${s})" fill="${fill}" opacity=".95"><circle cx="0" cy="0" r="12"/><circle cx="14" cy="-5" r="14"/><circle cx="30" cy="0" r="11"/><rect x="-6" y="0" width="42" height="9" rx="4"/></g>`;
  const crescent = (x, y, r, fill, bg) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/><circle cx="${x + r * 0.45}" cy="${y - r * 0.15}" r="${r * 0.85}" fill="${bg}"/>`;
  const flower = (x, y, r, petal, center) => {
    let s = "";
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      s += `<circle cx="${f(x + r * Math.cos(a))}" cy="${f(y + r * Math.sin(a))}" r="${f(r * 0.75)}" fill="${petal}"/>`;
    }
    return s + `<circle cx="${x}" cy="${y}" r="${f(r * 0.55)}" fill="${center}"/>`;
  };
  const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

  // ---------- 全局 defs：渐变、花色符号、牌背 ----------
  const DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
 <defs>
  <linearGradient id="g-parch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf3dc"/><stop offset="1" stop-color="#ead7aa"/></linearGradient>
  <linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d58a"/><stop offset=".5" stop-color="#c9973a"/><stop offset="1" stop-color="#f0cd78"/></linearGradient>
  <linearGradient id="g-sky-major" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbb8ea"/><stop offset=".65" stop-color="#f3dcb5"/><stop offset="1" stop-color="#f7e9c8"/></linearGradient>
  <linearGradient id="g-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1846"/><stop offset=".7" stop-color="#3a3170"/><stop offset="1" stop-color="#5a4a86"/></linearGradient>
  <linearGradient id="g-sky-wands" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8d9a8"/><stop offset="1" stop-color="#f3e6c8"/></linearGradient>
  <linearGradient id="g-sky-cups" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3daf2"/><stop offset="1" stop-color="#eef2ea"/></linearGradient>
  <linearGradient id="g-sky-swords" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd5e3"/><stop offset="1" stop-color="#eeeae3"/></linearGradient>
  <linearGradient id="g-sky-pentacles" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4e6c3"/><stop offset="1" stop-color="#f1ecd6"/></linearGradient>
  <radialGradient id="g-glow"><stop offset="0" stop-color="#fff6c8" stop-opacity="1"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>
  <radialGradient id="g-sun"><stop offset="0" stop-color="#fff1a8"/><stop offset="1" stop-color="#f2b52e"/></radialGradient>
  <linearGradient id="g-back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1540"/><stop offset=".5" stop-color="#2c1f5e"/><stop offset="1" stop-color="#150f33"/></linearGradient>

  <symbol id="sym-wands" overflow="visible">
   <rect x="-3.2" y="-22" width="6.4" height="44" rx="3" fill="#9a6633" stroke="#5c3a1a" stroke-width="1"/>
   <ellipse cx="-6" cy="-12" rx="4.5" ry="2" fill="#6c9a3e" transform="rotate(-30 -6 -12)"/>
   <ellipse cx="6" cy="-4" rx="4.5" ry="2" fill="#6c9a3e" transform="rotate(30 6 -4)"/>
   <ellipse cx="-6" cy="6" rx="4" ry="1.8" fill="#6c9a3e" transform="rotate(-30 -6 6)"/>
   <circle cx="0" cy="-22" r="3.2" fill="#c9973a"/>
  </symbol>
  <symbol id="sym-cups" overflow="visible">
   <path d="M-14,-18 H14 Q14,2 2,6 L2,13 Q9,15 10,19 H-10 Q-9,15 -2,13 L-2,6 Q-14,2 -14,-18 Z" fill="#dcae45" stroke="#8a6420" stroke-width="1.2"/>
   <path d="M-12,-14 H12" stroke="#4d86c6" stroke-width="2.5"/>
   <circle cx="0" cy="-5" r="2.4" fill="#c04a5a"/>
  </symbol>
  <symbol id="sym-swords" overflow="visible">
   <path d="M0,-24 L3.2,-18 V9 H-3.2 V-18 Z" fill="#dfe4ec" stroke="#56627a" stroke-width="1"/>
   <line x1="0" y1="-17" x2="0" y2="8" stroke="#9aa6ba" stroke-width=".8"/>
   <rect x="-10" y="9" width="20" height="3.4" rx="1.5" fill="#c9973a" stroke="#8a6420" stroke-width=".6"/>
   <rect x="-2" y="12.4" width="4" height="8" fill="#5a3b6b"/>
   <circle cx="0" cy="22" r="2.8" fill="#c9973a"/>
  </symbol>
  <symbol id="sym-pentacles" overflow="visible">
   <circle r="17" fill="#e3b94c" stroke="#8a6420" stroke-width="1.6"/>
   <circle r="13.5" fill="none" stroke="#8a6420" stroke-width=".8"/>
   <path d="M0,-12 L7.05,9.71 L-11.41,-3.71 L11.41,-3.71 L-7.05,9.71 Z" fill="none" stroke="#8a6420" stroke-width="1.3" stroke-linejoin="round"/>
  </symbol>
  <symbol id="flourish" overflow="visible">
   <path d="M0,0 Q20,0 22,16 M0,0 Q0,20 16,22" fill="none" stroke="#c9973a" stroke-width="1.3"/>
   <path d="M5,5 Q13,5 13,13" fill="none" stroke="#c9973a" stroke-width="1"/>
   <circle cx="5" cy="5" r="2.2" fill="#c9973a"/>
  </symbol>

  <symbol id="card-back" viewBox="0 0 200 340">
   <rect x="2" y="2" width="196" height="336" rx="12" fill="url(#g-back)" stroke="url(#g-gold)" stroke-width="3"/>
   <rect x="11" y="11" width="178" height="318" rx="8" fill="none" stroke="#c9973a" stroke-width="1" opacity=".8"/>
   <rect x="15" y="15" width="170" height="310" rx="6" fill="none" stroke="#c9973a" stroke-width=".6" stroke-dasharray="2 3" opacity=".7"/>
   ${[[12, 12, 0], [188, 12, 90], [188, 328, 180], [12, 328, 270]].map(([x, y, r]) => `<use href="#flourish" transform="translate(${x},${y}) rotate(${r})"/>`).join("")}
   <g opacity=".9">
    <circle cx="100" cy="170" r="66" fill="none" stroke="#c9973a" stroke-width="1"/>
    <circle cx="100" cy="170" r="58" fill="none" stroke="#c9973a" stroke-width=".7" stroke-dasharray="1 3"/>
    <circle cx="100" cy="170" r="48" fill="#211953" stroke="#c9973a" stroke-width="1.2"/>
    ${rays(100, 170, 48, 64, 24, "#c9973a", 0.8)}
    <polygon points="${starPts(100, 170, 44, 20, 8)}" fill="none" stroke="#e8c777" stroke-width="1.2"/>
    <polygon points="${starPts(100, 170, 30, 13, 8, -67.5)}" fill="#c9973a" opacity=".85"/>
    <circle cx="100" cy="170" r="9" fill="#1b1540" stroke="#f0d283" stroke-width="1.2"/>
    <circle cx="100" cy="170" r="3" fill="#f0d283"/>
   </g>
   ${crescent(100, 62, 13, "#e8c777", "#241a52")}
   <g transform="rotate(180 100 278)">${crescent(100, 278, 13, "#e8c777", "#241a52")}</g>
   ${[[40, 70], [160, 70], [40, 270], [160, 270], [30, 170], [170, 170], [62, 110], [138, 110], [62, 230], [138, 230]].map(([x, y]) => star(x, y, 3.2, 1.2, 4, "#f0d283")).join("")}
  </symbol>
 </defs>
</svg>`;

  // ---------- 22 张大阿尔卡那的图案 ----------
  const M = [];
  // 0 愚者
  M[0] = () => `
    <circle cx="140" cy="86" r="26" fill="url(#g-glow)"/>${rays(140, 86, 16, 26, 16, "#e9b43a", 1.5)}<circle cx="140" cy="86" r="14" fill="url(#g-sun)"/>
    <polygon points="22,250 55,185 80,215 112,160 150,215 178,190 178,250" fill="#b9a8d6" opacity=".75"/>
    <path d="M22,280 V238 H118 L140,280 Z" fill="#8c7a9e"/>
    <line x1="62" y1="230" x2="104" y2="158" stroke="#7a4a22" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="106" cy="155" r="10" fill="#c0503a"/><circle cx="103" cy="152" r="3" fill="#e3836e"/>
    ${flower(78, 205, 5, "#ffffff", "#f2d36b")}
    <line x1="78" y1="210" x2="78" y2="232" stroke="#4c7a33" stroke-width="2"/>
    ${star(52, 80, 4, 1.6, 4, "#fff")}${star(88, 66, 3, 1.2, 4, "#fff")}`;
  // 1 魔术师
  M[1] = () => `
    <path d="M84,76 C84,66 97,66 100,76 C103,86 116,86 116,76 C116,66 103,66 100,76 C97,86 84,86 84,76 Z" fill="none" stroke="${GOLD}" stroke-width="3"/>
    <circle cx="100" cy="135" r="34" fill="url(#g-glow)"/>
    <line x1="100" y1="98" x2="100" y2="182" stroke="#fffdf4" stroke-width="6" stroke-linecap="round"/>
    <line x1="100" y1="98" x2="100" y2="182" stroke="#d9c79a" stroke-width="1" />
    ${rays(100, 98, 6, 16, 10, "#f2c650", 1.2)}
    ${[[40, 62], [58, 58], [142, 58], [160, 62]].map(([x, y]) => flower(x, y, 3.5, "#c74a4a", "#f0d06a")).join("")}
    <rect x="36" y="214" width="128" height="12" rx="2" fill="#8a5a2b"/><rect x="44" y="226" width="6" height="46" fill="#6b4320"/><rect x="150" y="226" width="6" height="46" fill="#6b4320"/>
    ${use("sym-wands", 52, 198, 0.55, -20)}${use("sym-cups", 82, 202, 0.55)}${use("sym-swords", 118, 198, 0.55, 20)}${use("sym-pentacles", 148, 204, 0.55)}`;
  // 2 女祭司
  M[2] = () => `
    <rect x="38" y="92" width="24" height="176" fill="#15131f" stroke="#c9973a" stroke-width="1"/><text x="50" y="140" fill="#fff" font-size="16" text-anchor="middle" font-family="Cinzel, serif">B</text>
    <rect x="138" y="92" width="24" height="176" fill="#f2ede0" stroke="#c9973a" stroke-width="1"/><text x="150" y="140" fill="#15131f" font-size="16" text-anchor="middle" font-family="Cinzel, serif">J</text>
    <rect x="62" y="100" width="76" height="150" fill="#4d6fa3" opacity=".55"/>
    ${[[78, 124], [100, 150], [122, 124], [78, 176], [122, 176], [100, 204]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#c94a5a" opacity=".85"/>`).join("")}
    ${crescent(100, 86, 9, "#f2e9c8", "#2d2860")}<circle cx="100" cy="86" r="4" fill="#f2e9c8"/>
    <rect x="88" y="170" width="24" height="34" rx="3" fill="#fffaf0" stroke="#c9973a"/><text x="100" y="191" font-size="7" text-anchor="middle" fill="${INK}" font-family="Cinzel, serif">TORA</text>
    <path d="M70,262 Q100,282 130,262 Q100,270 70,262 Z" fill="#f2e9c8"/>`;
  // 3 皇后
  M[3] = () => {
    let stars = "";
    for (let i = 0; i < 12; i++) { const a = (200 + i * 140 / 11) * Math.PI / 180; stars += star(f(100 + 44 * Math.cos(a)), f(122 + 44 * Math.sin(a)), 4.5, 1.8, 6, "#f3c64b"); }
    return `${stars}
    <ellipse cx="45" cy="150" rx="24" ry="38" fill="#7fa66a" opacity=".6"/><ellipse cx="158" cy="140" rx="22" ry="40" fill="#7fa66a" opacity=".6"/>
    ${heart(100, 150, 2.8, "#e6c26a", GOLD_D)}
    <circle cx="100" cy="183" r="8" fill="none" stroke="#fff" stroke-width="2.5"/><line x1="100" y1="191" x2="100" y2="207" stroke="#fff" stroke-width="2.5"/><line x1="93" y1="200" x2="107" y2="200" stroke="#fff" stroke-width="2.5"/>
    ${[40, 58, 76, 124, 142, 160].map((x) => `<line x1="${x}" y1="276" x2="${x + 3}" y2="240" stroke="#c99a3a" stroke-width="1.5"/>${[0, 1, 2, 3].map((k) => `<ellipse cx="${x + 1 + k * 0.6}" cy="${244 + k * 7}" rx="2" ry="4" fill="#e0b94e"/>`).join("")}`).join("")}`;
  };
  // 4 皇帝
  M[4] = () => `
    <polygon points="22,200 60,120 95,180 130,110 178,200" fill="#c0503a" opacity=".45"/>
    <rect x="55" y="112" width="90" height="150" rx="4" fill="#9a958e" stroke="#5a5650" stroke-width="1.5"/>
    <rect x="68" y="128" width="64" height="120" fill="#b8b2a8"/>
    ${[60, 140].map((x) => `<circle cx="${x}" cy="114" r="9" fill="#d8d2c6" stroke="#5a5650"/><path d="M${x - 4},114 a4,4 0 1,1 4,4" fill="none" stroke="#5a5650" stroke-width="1.5"/>`).join("")}
    <circle cx="100" cy="150" r="10" fill="none" stroke="${GOLD}" stroke-width="4"/><line x1="100" y1="160" x2="100" y2="232" stroke="${GOLD}" stroke-width="5"/><line x1="86" y1="172" x2="114" y2="172" stroke="${GOLD}" stroke-width="5"/>
    <circle cx="100" cy="246" r="9" fill="${GOLD}"/>`;
  // 5 教皇
  M[5] = () => `
    <rect x="34" y="80" width="20" height="190" fill="#a9a39a"/><rect x="146" y="80" width="20" height="190" fill="#a9a39a"/>
    <line x1="100" y1="62" x2="100" y2="80" stroke="${GOLD}" stroke-width="3"/><line x1="93" y1="68" x2="107" y2="68" stroke="${GOLD}" stroke-width="3"/>
    <path d="M86,82 Q100,74 114,82 L116,98 H84 Z" fill="${GOLD}" stroke="${GOLD_D}"/>
    <path d="M80,100 Q100,92 120,100 L123,118 H77 Z" fill="${GOLD}" stroke="${GOLD_D}"/>
    <path d="M74,120 Q100,110 126,120 L130,142 H70 Z" fill="${GOLD}" stroke="${GOLD_D}"/>
    <rect x="70" y="142" width="60" height="6" fill="#b23b3b"/>
    ${[-35, 35].map((r) => `<g transform="translate(100,215) rotate(${r})"><circle cx="0" cy="-34" r="8" fill="none" stroke="${r < 0 ? "#e8c35a" : "#d8dce4"}" stroke-width="4"/><line x1="0" y1="-26" x2="0" y2="30" stroke="${r < 0 ? "#e8c35a" : "#d8dce4"}" stroke-width="4"/><rect x="0" y="18" width="10" height="4" fill="${r < 0 ? "#e8c35a" : "#d8dce4"}"/><rect x="0" y="25" width="8" height="4" fill="${r < 0 ? "#e8c35a" : "#d8dce4"}"/></g>`).join("")}`;
  // 6 恋人
  M[6] = () => `
    <circle cx="100" cy="82" r="30" fill="url(#g-glow)"/>${rays(100, 82, 18, 30, 20, "#eab13b", 1.5, true)}<circle cx="100" cy="82" r="16" fill="url(#g-sun)"/>
    <ellipse cx="68" cy="130" rx="34" ry="14" fill="#e98a6a" opacity=".55" transform="rotate(-25 68 130)"/><ellipse cx="132" cy="130" rx="34" ry="14" fill="#e98a6a" opacity=".55" transform="rotate(25 132 130)"/>
    <polygon points="100,150 125,250 75,250" fill="#9ab07a" opacity=".5"/>
    ${heart(86, 178, 2.1, "#d8576b", "#9c2f42")}${heart(114, 190, 2.1, "#f0a0ae", "#c45a6e")}
    <polygon points="22,280 70,240 100,262 130,236 178,280" fill="#9ab07a"/>`;
  // 7 战车
  M[7] = () => `
    <polygon points="22,180 40,160 52,172 64,150 80,170 96,156 112,172 130,150 150,170 178,158 178,200 22,200" fill="#8c8aa6" opacity=".5"/>
    <rect x="40" y="66" width="120" height="24" rx="3" fill="#2d3a6b"/>${[52, 72, 92, 112, 132, 150].map((x) => star(x, 78, 4, 1.6, 6, "#f3d27a")).join("")}
    <line x1="48" y1="90" x2="48" y2="150" stroke="#7e8aa8" stroke-width="4"/><line x1="152" y1="90" x2="152" y2="150" stroke="#7e8aa8" stroke-width="4"/>
    <rect x="50" y="146" width="100" height="74" rx="4" fill="#a9b4c8" stroke="#4a5470" stroke-width="1.5"/>
    <ellipse cx="100" cy="172" rx="9" ry="6" fill="${GOLD}"/><path d="M91,172 Q74,160 66,170 Q78,168 91,176 Z M109,172 Q126,160 134,170 Q122,168 109,176 Z" fill="${GOLD}"/>
    <circle cx="62" cy="226" r="12" fill="none" stroke="#4a5470" stroke-width="3"/><circle cx="138" cy="226" r="12" fill="none" stroke="#4a5470" stroke-width="3"/>
    <circle cx="74" cy="258" r="13" fill="#1e1e26"/><path d="M61,264 h-12 v10 h25 Z" fill="#1e1e26"/>
    <circle cx="126" cy="258" r="13" fill="#f4f1e8" stroke="#888"/><path d="M139,264 h12 v10 h-25 Z" fill="#f4f1e8" stroke="#888"/>`;
  // 8 力量
  M[8] = () => `
    <path d="M84,74 C84,64 97,64 100,74 C103,84 116,84 116,74 C116,64 103,64 100,74 C97,84 84,84 84,74 Z" fill="none" stroke="${GOLD}" stroke-width="3"/>
    <polygon points="${starPts(100, 182, 52, 38, 18)}" fill="#d98a2b"/>
    <circle cx="100" cy="182" r="32" fill="#f0bf5c"/>
    <ellipse cx="88" cy="174" rx="4" ry="3" fill="${INK}"/><ellipse cx="112" cy="174" rx="4" ry="3" fill="${INK}"/>
    <path d="M94,188 L106,188 L100,196 Z" fill="#7a3d1f"/><path d="M92,202 Q100,208 108,202" fill="none" stroke="#7a3d1f" stroke-width="2"/>
    ${Array.from({ length: 9 }, (_, i) => { const a = (200 + i * 17.5) * Math.PI / 180; return flower(f(100 + 62 * Math.cos(a)), f(150 + 52 * Math.sin(a)), 3.5, i % 2 ? "#ffffff" : "#d8576b", "#f2d36b"); }).join("")}`;
  // 9 隐士
  M[9] = () => `
    ${[[40, 70], [70, 90], [150, 76], [160, 120], [50, 120]].map(([x, y]) => star(x, y, 3, 1.2, 4, "#f6efd0")).join("")}
    <polygon points="22,280 100,226 178,280" fill="#dfe5ef"/>
    <line x1="132" y1="96" x2="122" y2="276" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/>
    <circle cx="86" cy="150" r="42" fill="url(#g-glow)"/>
    <line x1="86" y1="112" x2="86" y2="126" stroke="${GOLD}" stroke-width="2"/>
    <rect x="72" y="126" width="28" height="42" rx="4" fill="#fff6c0" stroke="${GOLD}" stroke-width="2.5"/>
    <polygon points="${starPts(86, 147, 9, 4.5, 6)}" fill="#f2b52e"/>
    <path d="M70,126 L86,118 L102,126 Z" fill="${GOLD}"/><path d="M70,168 h32 l-4,6 h-24 Z" fill="${GOLD}"/>`;
  // 10 命运之轮
  M[10] = () => `
    ${cloud(26, 70, 0.75)}${cloud(146, 70, 0.75)}${cloud(26, 262, 0.75)}${cloud(146, 262, 0.75)}
    <circle cx="100" cy="166" r="56" fill="#e0a54a" stroke="#8a5a2b" stroke-width="3"/>
    <circle cx="100" cy="166" r="40" fill="#3b6fb0" stroke="#8a5a2b" stroke-width="2"/>
    ${rays(100, 166, 14, 40, 8, "#f3d27a", 2.5)}
    <circle cx="100" cy="166" r="14" fill="#e0a54a" stroke="#8a5a2b" stroke-width="2"/>
    ${["T", "A", "R", "O"].map((t, i) => { const a = (i * 90 - 90) * Math.PI / 180; return `<text x="${f(100 + 48 * Math.cos(a))}" y="${f(166 + 48 * Math.sin(a) + 5)}" font-size="13" text-anchor="middle" fill="${INK}" font-family="Cinzel, serif" font-weight="700">${t}</text>`; }).join("")}
    ${[45, 135, 225, 315].map((d) => { const a = d * Math.PI / 180; return `<circle cx="${f(100 + 48 * Math.cos(a))}" cy="${f(166 + 48 * Math.sin(a))}" r="3" fill="${INK}"/>`; }).join("")}`;
  // 11 正义
  M[11] = () => `
    <rect x="30" y="80" width="18" height="190" fill="#a9a39a"/><rect x="152" y="80" width="18" height="190" fill="#a9a39a"/>
    <rect x="48" y="86" width="104" height="120" fill="#7a3d8c" opacity=".35"/>
    ${use("sym-swords", 100, 128, 2.3)}
    <line x1="100" y1="188" x2="100" y2="262" stroke="${GOLD}" stroke-width="3"/>
    <line x1="52" y1="196" x2="148" y2="196" stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round"/>
    ${[56, 144].map((x) => `<line x1="${x}" y1="196" x2="${x - 14}" y2="230" stroke="${GOLD_D}"/><line x1="${x}" y1="196" x2="${x + 14}" y2="230" stroke="${GOLD_D}"/><path d="M${x - 18},230 Q${x},248 ${x + 18},230 Z" fill="${GOLD}" stroke="${GOLD_D}"/>`).join("")}
    <rect x="86" y="260" width="28" height="8" rx="2" fill="${GOLD}"/>`;
  // 12 倒吊人
  M[12] = () => `
    <rect x="40" y="66" width="120" height="11" rx="3" fill="#7a5230"/>
    ${[52, 70, 130, 148].map((x) => `<ellipse cx="${x}" cy="64" rx="6" ry="3" fill="#6c9a3e"/>`).join("")}
    <line x1="100" y1="77" x2="100" y2="160" stroke="#c0503a" stroke-width="8" stroke-linecap="round"/>
    <path d="M100,108 L124,98 L124,78" fill="none" stroke="#c0503a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M100,160 L80,176 L100,190 L120,176 Z" fill="#3b6fb0"/>
    <circle cx="100" cy="212" r="34" fill="url(#g-glow)"/>
    <circle cx="100" cy="210" r="22" fill="none" stroke="#f2b52e" stroke-width="3"/>
    <circle cx="100" cy="206" r="12" fill="#f3d9b5"/>`;
  // 13 死神
  M[13] = () => `
    <rect x="22" y="230" width="156" height="50" fill="#6a8cbf" opacity=".55"/>
    <rect x="34" y="176" width="24" height="70" fill="#8c8478"/><rect x="142" y="176" width="24" height="70" fill="#8c8478"/>
    <polygon points="34,176 46,162 58,176" fill="#6a6258"/><polygon points="142,176 154,162 166,176" fill="#6a6258"/>
    <circle cx="100" cy="236" r="26" fill="url(#g-glow)"/>${rays(100, 236, 16, 28, 14, "#f2b52e", 1.5)}<path d="M80,236 a20,20 0 0,1 40,0 Z" fill="url(#g-sun)"/>
    <line x1="56" y1="70" x2="56" y2="170" stroke="#5a3b22" stroke-width="3.5"/>
    <path d="M58,74 H146 L138,108 L146,142 H58 Z" fill="#17161c" stroke="#c9973a" stroke-width="1"/>
    ${flower(100, 108, 8, "#f8f6f0", "#f2d36b")}`;
  // 14 节制
  M[14] = () => `
    <ellipse cx="62" cy="150" rx="38" ry="18" fill="#f0a070" opacity=".45" transform="rotate(-35 62 150)"/><ellipse cx="138" cy="150" rx="38" ry="18" fill="#f0a070" opacity=".45" transform="rotate(35 138 150)"/>
    <circle cx="150" cy="86" r="12" fill="url(#g-sun)"/>${rays(150, 86, 13, 20, 12, "#eab13b", 1.2)}
    <rect x="88" y="88" width="24" height="24" fill="none" stroke="${GOLD}" stroke-width="2"/><polygon points="100,92 108,108 92,108" fill="${GOLD}"/>
    ${use("sym-cups", 66, 150, 1.0, -25)}${use("sym-cups", 134, 214, 1.0, 20)}
    <path d="M76,142 C100,150 110,180 128,200" fill="none" stroke="#7fb3e6" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M22,262 Q70,250 100,262 T178,262 V280 H22 Z" fill="#7fb3e6" opacity=".6"/>
    ${[[36, 236], [48, 244]].map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 24}" stroke="#4c7a33" stroke-width="1.5"/>${flower(x, y, 4, "#8b6cc4", "#f2d36b")}`).join("")}`;
  // 15 恶魔
  M[15] = () => `
    <path d="M100,150 C70,120 40,130 26,100 C46,108 54,96 64,108 C70,96 82,104 100,130 C118,104 130,96 136,108 C146,96 154,108 174,100 C160,130 130,120 100,150 Z" fill="#4a2a4a"/>
    <circle cx="100" cy="98" r="22" fill="none" stroke="#e8e0d0" stroke-width="2"/>
    <path d="${pentagram(100, 98, 19, true)}" fill="none" stroke="#e8e0d0" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="72" y="196" width="56" height="44" fill="#3a3438" stroke="#6a6266"/>
    <line x1="58" y1="150" x2="70" y2="204" stroke="#7a4a22" stroke-width="3"/><path d="M58,150 q-6,-12 0,-22 q6,10 0,22 Z" fill="#f2953a"/>
    ${[[76, 228, 52, 264], [124, 228, 148, 264]].map(([x1, y1, x2, y2]) => Array.from({ length: 6 }, (_, k) => `<circle cx="${f(x1 + (x2 - x1) * k / 5)}" cy="${f(y1 + (y2 - y1) * k / 5)}" r="3" fill="none" stroke="#b9b1a5" stroke-width="1.3"/>`).join("")).join("")}
    <circle cx="52" cy="268" r="7" fill="#c9a98a"/><circle cx="148" cy="268" r="7" fill="#c9a98a"/>`;
  // 16 高塔
  M[16] = () => `
    <polygon points="150,56 120,108 134,110 108,150 146,98 132,96 158,56" fill="#ffe066"/>
    <polygon points="78,112 122,112 128,272 72,272" fill="#9c8f86" stroke="#5e5650" stroke-width="1.5"/>
    ${[[92, 140], [106, 180], [90, 220], [104, 250]].map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="12" fill="#f2953a"/><path d="M${x + 4},${y - 2} q-6,-10 0,-18 q6,8 0,18 Z" fill="#f2b23a" opacity=".9"/>`).join("")}
    <g transform="translate(140,90) rotate(35)"><path d="M-14,8 L-14,-6 L-7,2 L0,-10 L7,2 L14,-6 L14,8 Z" fill="${GOLD}" stroke="${GOLD_D}"/></g>
    ${[[50, 120], [60, 170], [150, 160], [142, 210], [44, 220]].map(([x, y]) => `<path d="M${x},${y} q-5,-8 0,-14 q5,6 0,14 Z" fill="#ffd25a"/>`).join("")}
    <path d="M22,272 Q60,262 100,272 T178,272 V280 H22 Z" fill="#5e5650"/>`;
  // 17 星星
  M[17] = () => `
    <circle cx="100" cy="96" r="34" fill="url(#g-glow)"/>
    ${star(100, 96, 28, 10, 8, "#ffe9a0")}
    ${[[44, 72], [70, 120], [130, 124], [156, 72], [56, 150], [146, 152], [100, 146]].map(([x, y]) => star(x, y, 8, 3, 8, "#fff6cf")).join("")}
    <path d="M22,230 Q60,214 100,226 T178,222 V280 H22 Z" fill="#6a9a5a" opacity=".8"/>
    <ellipse cx="100" cy="258" rx="62" ry="16" fill="#5b8fd0"/>
    <path d="M72,200 q-10,0 -10,12 q0,14 12,14 q12,0 12,-14 q0,-12 -10,-12 Z" fill="#d9a45a"/><line x1="66" y1="224" x2="76" y2="252" stroke="#bfe0ff" stroke-width="2.5"/>
    <path d="M128,200 q-10,0 -10,12 q0,14 12,14 q12,0 12,-14 q0,-12 -10,-12 Z" fill="#d9a45a"/><path d="M136,222 q12,14 4,36" fill="none" stroke="#bfe0ff" stroke-width="2.5"/>`;
  // 18 月亮
  M[18] = () => `
    <circle cx="100" cy="98" r="44" fill="url(#g-glow)" opacity=".7"/>
    ${rays(100, 98, 30, 42, 32, "#f6e7a8", 1.2, true)}
    <circle cx="100" cy="98" r="28" fill="#f6e7a8"/><circle cx="112" cy="92" r="24" fill="#d4c487"/>
    <path d="M86,92 q4,-4 8,0" fill="none" stroke="#8a7a4a" stroke-width="1.5"/><path d="M88,108 q6,4 10,0" fill="none" stroke="#8a7a4a" stroke-width="1.5"/>
    ${[[70, 146], [92, 154], [114, 146], [134, 156]].map(([x, y]) => `<path d="M${x},${y} q-3,6 0,9 q3,-3 0,-9 Z" fill="#f2c650"/>`).join("")}
    <rect x="30" y="160" width="22" height="80" fill="#7c7488"/><polygon points="30,160 41,146 52,160" fill="#5e566c"/>
    <rect x="148" y="160" width="22" height="80" fill="#7c7488"/><polygon points="148,160 159,146 170,160" fill="#5e566c"/>
    <path d="M100,196 C90,214 116,226 96,246 C86,256 104,262 100,270" fill="none" stroke="#e8dcc0" stroke-width="5" stroke-linecap="round"/>
    <path d="M22,256 Q100,244 178,256 V280 H22 Z" fill="#3e6aa8"/>
    <path d="M94,266 q6,-8 12,0 q-6,4 -12,0 Z" fill="#d0553e"/>`;
  // 19 太阳
  M[19] = () => `
    <circle cx="100" cy="112" r="56" fill="url(#g-glow)"/>
    ${rays(100, 112, 38, 58, 24, "#f2b52e", 2.5, true)}
    <circle cx="100" cy="112" r="36" fill="url(#g-sun)" stroke="#e39a1c" stroke-width="1.5"/>
    <path d="M86,104 q4,-4 8,0 M106,104 q4,-4 8,0" fill="none" stroke="#9a5a12" stroke-width="2" stroke-linecap="round"/>
    <path d="M88,122 q12,10 24,0" fill="none" stroke="#9a5a12" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="22" y="232" width="156" height="22" fill="#cfc6b2"/>${[50, 90, 130, 170].map((x) => `<line x1="${x}" y1="232" x2="${x}" y2="254" stroke="#a89f8a"/>`).join("")}<line x1="22" y1="243" x2="178" y2="243" stroke="#a89f8a"/>
    ${[44, 76, 124, 156].map((x, i) => `<line x1="${x}" y1="${214 - (i % 2) * 8}" x2="${x}" y2="234" stroke="#4c7a33" stroke-width="2"/><polygon points="${starPts(x, 210 - (i % 2) * 8, 10, 5, 12)}" fill="#f3c33a"/><circle cx="${x}" cy="${210 - (i % 2) * 8}" r="4.5" fill="#7a4a22"/>`).join("")}
    <path d="M22,254 H178 V280 H22 Z" fill="#a8c47a"/>`;
  // 20 审判
  M[20] = () => `
    ${cloud(36, 76, 1.1, "#f4f1f8")}${cloud(104, 70, 1.1, "#ece6f4")}
    ${rays(96, 100, 8, 40, 12, "#f2c650", 1.2)}
    <polygon points="88,96 96,92 140,150 128,158" fill="${GOLD}" stroke="${GOLD_D}"/>
    <path d="M128,158 Q126,174 140,176 Q154,170 140,150 Z" fill="${GOLD}" stroke="${GOLD_D}"/>
    <rect x="104" y="116" width="24" height="20" fill="#fff" stroke="#ccc" transform="rotate(54 116 126)"/><path d="M112,122 h8 M116,118 v8" stroke="#c43a3a" stroke-width="3" transform="rotate(54 116 126)"/>
    <polygon points="22,230 50,196 70,220 100,190 132,222 152,200 178,230" fill="#eef0f6"/>
    <path d="M22,240 H178 V280 H22 Z" fill="#6a8cbf" opacity=".7"/>
    ${[54, 100, 146].map((x) => `<rect x="${x - 16}" y="246" width="32" height="12" rx="2" fill="#8c7a66"/><line x1="${x}" y1="246" x2="${x}" y2="226" stroke="#d9b8a0" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="220" r="6" fill="#f0d4bc"/><path d="M${x - 10},226 L${x - 4},236 M${x + 10},226 L${x + 4},236" stroke="#d9b8a0" stroke-width="3" stroke-linecap="round"/>`).join("")}`;
  // 21 世界
  M[21] = () => `
    ${[[40, 76, "#f4f1f8"], [160, 76, "#c9a0e0"], [40, 256, "#c89a5a"], [160, 256, "#e0a54a"]].map(([x, y, c]) => `${cloud(x - 18, y + 6, 0.7)}<circle cx="${x}" cy="${y}" r="11" fill="${c}" stroke="#fff" stroke-width="1.5"/>`).join("")}
    <ellipse cx="100" cy="166" rx="44" ry="74" fill="none" stroke="#4f8a3a" stroke-width="10" stroke-dasharray="7 3"/>
    <ellipse cx="100" cy="166" rx="44" ry="74" fill="none" stroke="#7fb05a" stroke-width="3" stroke-dasharray="3 7"/>
    <path d="M92,90 l16,10 M108,90 l-16,10 M92,232 l16,10 M108,232 l-16,10" stroke="#c43a3a" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M100,118 C130,140 70,160 104,186 C128,204 86,214 100,226" fill="none" stroke="#8b5ac4" stroke-width="7" stroke-linecap="round" opacity=".85"/>
    <circle cx="100" cy="128" r="9" fill="#f3d9b5"/>
    <line x1="74" y1="150" x2="70" y2="176" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/><line x1="128" y1="150" x2="132" y2="176" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>`;

  // ---------- 小阿尔卡那 ----------
  const PIPS = {
    2: [[.5, .18], [.5, .82]],
    3: [[.5, .14], [.5, .5], [.5, .86]],
    4: [[.25, .18], [.75, .18], [.25, .82], [.75, .82]],
    5: [[.25, .16], [.75, .16], [.5, .5], [.25, .84], [.75, .84]],
    6: [[.25, .14], [.75, .14], [.25, .5], [.75, .5], [.25, .86], [.75, .86]],
    7: [[.25, .12], [.75, .12], [.5, .31], [.25, .5], [.75, .5], [.25, .88], [.75, .88]],
    8: [[.25, .12], [.75, .12], [.5, .31], [.25, .5], [.75, .5], [.5, .69], [.25, .88], [.75, .88]],
    9: [[.25, .1], [.75, .1], [.25, .37], [.75, .37], [.5, .5], [.25, .63], [.75, .63], [.25, .9], [.75, .9]],
    10: [[.25, .1], [.75, .1], [.5, .24], [.25, .37], [.75, .37], [.25, .63], [.75, .63], [.5, .76], [.25, .9], [.75, .9]],
  };
  const CROWNS = {
    page: (a) => `${star(100, 96, 16, 7, 6, "#f3c64b", `stroke="${GOLD_D}"`)}<path d="M76,124 Q100,112 124,124" fill="none" stroke="${a}" stroke-width="3"/>`,
    knight: (a) => `<path d="M80,132 L90,96 L98,80 L104,94 L122,104 L126,118 L112,120 L104,112 L108,132 Z" fill="${a}" stroke="${GOLD_D}" stroke-width="1.2"/><circle cx="108" cy="100" r="2" fill="#fff"/><path d="M96,84 q-8,6 -10,22" fill="none" stroke="${GOLD}" stroke-width="2.5"/>`,
    queen: (a) => `<path d="M74,128 L74,104 L87,116 L100,92 L113,116 L126,104 L126,128 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.2"/>${[74, 100, 126].map((x, i) => `<circle cx="${x}" cy="${[104, 92, 104][i]}" r="4" fill="${a}"/>`).join("")}<rect x="74" y="122" width="52" height="6" fill="${a}"/>`,
    king: (a) => `<path d="M70,130 L70,100 L80,112 L90,94 L100,108 L110,94 L120,112 L130,100 L130,130 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.2"/>${[70, 90, 110, 130].map((x, i) => `<circle cx="${x}" cy="${[100, 94, 94, 100][i]}" r="3.5" fill="${a}"/>`).join("")}<line x1="100" y1="84" x2="100" y2="74" stroke="${GOLD}" stroke-width="2.5"/><line x1="95" y1="78" x2="105" y2="78" stroke="${GOLD}" stroke-width="2.5"/><rect x="70" y="124" width="60" height="6" fill="${a}"/>`,
  };
  const COURT_KEYS = ["page", "knight", "queen", "king"];
  const COURT_EN = ["PAGE", "KNIGHT", "QUEEN", "KING"];

  function minorArt(suit, rank) {
    const sym = "sym-" + suit.key;
    if (rank === 0) {
      return `<circle cx="100" cy="166" r="58" fill="url(#g-glow)"/>${rays(100, 166, 40, 64, 28, GOLD, 1, true)}
        ${cloud(26, 112, 0.9)}${cloud(132, 228, 0.8)}${use(sym, 100, 166, 2.6)}
        ${[[60, 236], [140, 100], [70, 92]].map(([x, y]) => `<path d="M${x},${y} q-4,7 0,10 q4,-3 0,-10 Z" fill="${GOLD}"/>`).join("")}`;
    }
    if (rank <= 9) {
      const n = rank + 1, pts = PIPS[n];
      const s = n <= 4 ? 1.25 : n <= 7 ? 1.0 : 0.82;
      return `${pts.map(([u, v]) => use(sym, f(48 + 104 * u), f(74 + 184 * v), s)).join("")}`;
    }
    const k = COURT_KEYS[rank - 10];
    return `<path d="M44,276 V120 Q44,64 100,64 Q156,64 156,120 V276" fill="${suit.accent}" opacity=".12" stroke="${suit.accent}" stroke-width="1" stroke-opacity=".5"/>
      ${CROWNS[k](suit.accent)}${use(sym, 100, 204, 2.0)}
      <text x="100" y="270" font-size="8" text-anchor="middle" fill="${suit.accent}" font-family="Cinzel, serif" letter-spacing="2">${COURT_EN[rank - 10]}</text>`;
  }

  // ---------- 拼装整张牌 ----------
  function frame(accent, sky, top, art, nameCn, nameEn) {
    return `<svg class="tarot-svg" viewBox="0 0 200 340" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="196" height="336" rx="12" fill="url(#g-parch)" stroke="url(#g-gold)" stroke-width="3"/>
      <rect x="10" y="10" width="180" height="320" rx="7" fill="none" stroke="${accent}" stroke-width="1.2"/>
      <rect x="14" y="14" width="172" height="312" rx="5" fill="none" stroke="${GOLD}" stroke-width=".6" stroke-dasharray="2 2.5"/>
      ${[[10, 10, 0], [190, 10, 90], [190, 330, 180], [10, 330, 270]].map(([x, y, r]) => `<use href="#flourish" transform="translate(${x},${y}) rotate(${r})"/>`).join("")}
      <rect x="22" y="52" width="156" height="228" rx="4" fill="url(#${sky})" stroke="${accent}" stroke-width="1.2"/>
      <svg x="22" y="52" width="156" height="228" viewBox="22 52 156 228" overflow="hidden">${art}</svg>
      <rect x="22" y="52" width="156" height="228" rx="4" fill="none" stroke="${GOLD}" stroke-width="2"/>
      <ellipse cx="100" cy="32" rx="28" ry="13" fill="#fbf3dc" stroke="${accent}" stroke-width="1.2"/>
      <text x="100" y="37.5" font-size="14" text-anchor="middle" fill="${accent}" font-family="Cinzel, serif" font-weight="700">${top}</text>
      <path d="M18,292 H182 L176,302 L182,312 H18 L24,302 Z" fill="${accent}"/>
      <text x="100" y="307.5" font-size="15" text-anchor="middle" fill="#fff8e4" font-family="'Noto Serif SC', 'Songti SC', serif" font-weight="700" letter-spacing="2">${nameCn}</text>
      <text x="100" y="324" font-size="7.5" text-anchor="middle" fill="${accent}" font-family="Cinzel, serif" letter-spacing="1.2">${nameEn.toUpperCase()}</text>
    </svg>`;
  }

  function face(card) {
    const id = card.id;
    if (id < 22) {
      const sky = NIGHT.has(id) ? "g-night" : "g-sky-major";
      return frame(MAJOR_ACCENT, sky, ROMAN[id], M[id](), card.name, card.name_en);
    }
    const suit = SUITS[Math.floor((id - 22) / 14)], rank = (id - 22) % 14;
    const top = rank <= 9 ? ROMAN[rank + 1] : "✦";
    return frame(suit.accent, suit.sky, top, minorArt(suit, rank), card.name, card.name_en);
  }

  const back = () => `<svg class="tarot-svg" viewBox="0 0 200 340"><use href="#card-back"/></svg>`;

  function install() {
    if (!document.getElementById("tarot-defs")) {
      const div = document.createElement("div");
      div.id = "tarot-defs";
      div.innerHTML = DEFS;
      document.body.prepend(div);
    }
  }

  window.TarotArt = { face, back, install, SUITS };
})();
