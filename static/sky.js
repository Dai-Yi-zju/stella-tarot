/* 星空背景：闪烁的星星 + 偶尔划过的流星 */
(function () {
  const cv = document.getElementById("sky");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W, H, stars = [], meteor = null;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((W * H) / 5200);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.2,
      p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.4, gold: Math.random() < 0.12,
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const a = reduce ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(s.p + (t / 1000) * s.s));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.gold ? "#f3d68a" : "#ffffff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduce) {
      if (!meteor && Math.random() < 0.004) meteor = { x: Math.random() * W * 0.8 + W * 0.2, y: Math.random() * H * 0.3, l: 0 };
      if (meteor) {
        meteor.l += 14;
        const x = meteor.x - meteor.l, y = meteor.y + meteor.l * 0.5;
        const g = ctx.createLinearGradient(x, y, x + 90, y - 45);
        g.addColorStop(0, "rgba(255,240,200,.9)"); g.addColorStop(1, "rgba(255,240,200,0)");
        ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y - 45); ctx.stroke();
        if (meteor.l > 600) meteor = null;
      }
    }
    ctx.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(frame);
  }

  addEventListener("resize", () => { resize(); if (reduce) frame(0); });
  resize();
  requestAnimationFrame(frame);
})();
