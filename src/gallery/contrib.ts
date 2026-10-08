// 活跃热力图：30 周 × 7 天的格子沿对角线依次弹出并上色，顶部的总数跟着涨；
// 然后一道高亮沿“最长连续天数”逐格走过，最活跃的那天弹出提示框；最后格子反向收回，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mixColor } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, seeded, type SceneDef } from './util.ts';

const D = 10;
const WEEKS = 30;
const CELL = 13;
const PITCH = 17;
const LEFT = (640 - (WEEKS * PITCH - 4)) / 2 + 12;
const TOP = 152;
const LEVELS = ['#ececf0', '#cfe0ff', '#94bcff', '#5b8cff', '#3346d3'];
// 最后一天是 2026 年 10 月 8 日（星期四），每一列是一周，从星期日开始
const END = Date.UTC(2026, 9, 8);
const END_ROW = 4;
const MONTHS_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const contrib: SceneDef = {
  title: '活跃热力图',
  category: '数据',
  description: '30 周的每日格子沿对角线依次弹出上色，总数跟着涨；一道高亮走过最长的连续天数，最活跃的那天弹出提示。',
  tags: ['spring', 'stagger', 'track'],
  tone: 'light',
  en: {
    title: 'Activity heatmap',
    description: 'Thirty weeks of daily squares pop in and color along a diagonal while the total climbs; a highlight walks the longest streak and the busiest day gets a tooltip.',
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-heat');
    injectCSS(
      'nm-heat',
      `.nm-heat{background:#fff}
.nm-heat .big{position:absolute;left:${LEFT}px;top:44px;font-size:36px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.nm-heat .sub{position:absolute;left:${LEFT}px;top:90px;font-size:13px;color:#86868b}
.nm-heat .streak{position:absolute;right:${LEFT}px;top:52px;text-align:right;font-size:13px;color:#86868b}
.nm-heat .streak b{display:block;font-size:22px;color:#1d1d1f;font-variant-numeric:tabular-nums}
.nm-heat .sq{position:absolute;width:${CELL}px;height:${CELL}px;border-radius:3px}
.nm-heat .sq.hl{box-shadow:0 0 0 2px #ff9f0a}
.nm-heat .mon,.nm-heat .wd{position:absolute;font-size:11px;color:#86868b}
.nm-heat .legend{position:absolute;right:${LEFT}px;top:${TOP + 7 * PITCH + 14}px;display:flex;align-items:center;gap:4px;font-size:11px;color:#86868b}
.nm-heat .legend i{width:11px;height:11px;border-radius:3px}
.nm-heat .tip{position:absolute;padding:6px 10px;border-radius:8px;background:#1d1d1f;color:#fff;font-size:12px;font-weight:600;white-space:nowrap;transform-origin:50% 100%;pointer-events:none}
.nm-heat .tip::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:#1d1d1f}`,
    );
    const big = el('div', 'big', stage);
    el('div', 'sub', stage, en ? 'creations in the last 30 weeks' : '次创作 · 最近 30 周');
    const streakBox = el('div', 'streak', stage, en ? 'Longest streak' : '最长连续');
    const streakNum = el('b', '', streakBox);

    // 每天的创作次数：越接近现在越活跃，周末更多，偶尔空几天
    const rnd = seeded(12);
    type Day = { node: HTMLElement; c: number; r: number; count: number; level: number; date: Date; appear: number };
    const days: Day[] = [];
    for (let c = 0; c < WEEKS; c++) {
      for (let r = 0; r < 7; r++) {
        const offset = (WEEKS - 1 - c) * 7 + (END_ROW - r);
        if (offset < 0) continue; // 未来的日子不画
        const trend = 1 - offset / (WEEKS * 7);
        const weekend = r === 0 || r === 6 ? 1.4 : 1;
        const raw = rnd() * 7 * (0.35 + trend) * weekend - (rnd() < 0.18 ? 99 : 0);
        const count = Math.max(0, Math.round(raw));
        const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 7 ? 3 : 4;
        const node = el('div', 'sq', stage);
        node.style.left = `${LEFT + c * PITCH}px`;
        node.style.top = `${TOP + r * PITCH}px`;
        days.push({ node, c, r, count, level, date: new Date(END - offset * 864e5), appear: 0.4 + (c + r * 0.6) * 0.045 });
      }
    }
    // 月份标签：某一列的第一天换了月份就标一下
    let lastMonth = -1;
    for (let c = 0; c < WEEKS; c++) {
      const first = days.find((d) => d.c === c);
      if (!first) continue;
      const m = first.date.getUTCMonth();
      if (m !== lastMonth && c < WEEKS - 2) {
        const lab = el('div', 'mon', stage, (en ? MONTHS_EN : MONTHS_ZH)[m]);
        lab.style.left = `${LEFT + c * PITCH}px`;
        lab.style.top = `${TOP - 20}px`;
      }
      lastMonth = m;
    }
    (en ? ['Mon', 'Wed', 'Fri'] : ['一', '三', '五']).forEach((t, k) => {
      const lab = el('div', 'wd', stage, t);
      lab.style.left = `${LEFT - (en ? 30 : 18)}px`;
      lab.style.top = `${TOP + (1 + k * 2) * PITCH - 1}px`;
    });
    const legend = el('div', 'legend', stage, en ? 'Less' : '少');
    LEVELS.forEach((c) => (el('i', '', legend).style.background = c));
    legend.append(en ? 'More' : '多');

    // 最长连续天数（按日期顺序）
    const ordered = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
    let best: Day[] = [];
    let run: Day[] = [];
    for (const d of ordered) {
      run = d.count > 0 ? [...run, d] : [];
      if (run.length > best.length) best = run;
    }
    const total = days.reduce((s, d) => s + d.count, 0);
    const peak = days.reduce((a, b) => (b.count > a.count ? b : a));
    const tip = el('div', 'tip', stage);
    tip.textContent = en
      ? `${MONTHS_EN[peak.date.getUTCMonth()]} ${peak.date.getUTCDate()} · ${peak.count} creations`
      : `${peak.date.getUTCMonth() + 1}月${peak.date.getUTCDate()}日 · ${peak.count} 次`;
    tip.style.left = `${LEFT + peak.c * PITCH + CELL / 2}px`;
    tip.style.top = `${TOP + peak.r * PITCH - 36}px`;

    const popIn = spring({ duration: 0.45, bounce: 0.45 });
    const out = spring({ duration: 0.3, bounce: 0 });
    const EXIT = 8.0;
    const exitAt = (d: Day) => EXIT + ((WEEKS - 1 - d.c) + (6 - d.r) * 0.6) * 0.03;
    const scales = days.map((d) => track(0, [[d.appear, 1, popIn], [exitAt(d), 0, out]]));
    const tipIn = track(0, [[5.0, 1, spring({ duration: 0.45, bounce: 0.35 })], [7.5, 0, out]]);
    const STREAK = [3.0, 4.6];

    const render = (t: number) => {
      let shown = 0;
      days.forEach((d, i) => {
        const s = scales[i]!(t);
        d.node.style.transform = `scale(${Math.max(0, s)})`;
        // 先以最浅的颜色出现，0.25 秒后变成自己的颜色
        const tint = clamp((t - d.appear - 0.1) / 0.25) * clamp((exitAt(d) - t) / 0.15 + 1);
        d.node.style.background = mixColor(LEVELS[0]!, LEVELS[d.level]!, tint);
        if (clamp(s) > 0.5) shown += d.count;
      });
      // 总数跟着出现的格子涨，收回时跟着降
      big.textContent = Math.round(Math.min(total, shown)).toLocaleString('en-US');
      // 连续天数：高亮逐格走过
      const p = clamp((t - STREAK[0]!) / (STREAK[1]! - STREAK[0]!));
      const n = Math.round(p * best.length);
      best.forEach((d, i) => d.node.classList.toggle('hl', t < EXIT && i < n && t > STREAK[0]!));
      streakNum.textContent = en ? `${t < EXIT ? n : 0} days` : `${t < EXIT ? n : 0} 天`;
      const k = tipIn(t);
      tip.style.opacity = String(clamp(k));
      tip.style.transform = `translate(-50%, 0) scale(${0.6 + 0.4 * k})`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 6.2 });
  },
};
