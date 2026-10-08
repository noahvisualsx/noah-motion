// 数据生长：一周浏览量的折线图自己画出来。线头经过的数据点依次弹出，
// 画完后提示框弹到最高点，顶部总数跟着线一起涨；最后线从右往左收回，回到空白。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, type SceneDef } from './util.ts';

const D = 8;
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const VALUES = [3200, 5400, 4100, 8800, 7600, 12400, 9800];
const X0 = 70;
const X1 = 590;
const Y0 = 318; // 基线
const Y1 = 118; // 最高值的位置

/** 越过终点再弹回来的曲线，用来做“弹出” */
const backOut = (p: number) => {
  const c = 1.9;
  const q = p - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
};

export const chart: SceneDef = {
  title: '数据生长',
  category: '数据',
  description: '一周浏览量的折线图自己画出来：线头经过的点依次弹出，提示框跳到最高点，总数跟着线一起涨。',
  tags: ['spring', 'track', 'SVG'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-chart');
    injectCSS(
      'nm-chart',
      `.nm-chart{background:linear-gradient(180deg,#fff,#f3f4f7)}
.nm-chart svg{position:absolute;inset:0;width:640px;height:400px;overflow:visible}
.nm-chart .k{position:absolute;left:70px;top:34px;font-size:12px;letter-spacing:.18em;color:#86868b;font-weight:600}
.nm-chart .big{position:absolute;left:70px;top:52px;font-size:34px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.nm-chart .delta{position:absolute;left:250px;top:66px;font-size:13px;font-weight:600;color:#1f9d55;font-variant-numeric:tabular-nums}
.nm-chart .tip{position:absolute;left:0;top:0;padding:7px 11px;border-radius:10px;background:#1d1d1f;color:#fff;font-size:13px;font-weight:600;white-space:nowrap;transform-origin:50% 100%;font-variant-numeric:tabular-nums}
.nm-chart .tip::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:#1d1d1f}
.nm-chart .day{position:absolute;top:${Y0 + 16}px;width:60px;margin-left:-30px;text-align:center;font-size:12px;color:#86868b}`,
    );
    const max = Math.max(...VALUES);
    const pts = VALUES.map((v, i) => [X0 + ((X1 - X0) * i) / (VALUES.length - 1), Y0 - ((Y0 - Y1) * v) / max] as const);
    const total = VALUES.reduce((a, b) => a + b, 0);

    const g = svg('svg', { viewBox: '0 0 640 400' }, stage);
    const defs = svg('defs', {}, g);
    const grad = svg('linearGradient', { id: 'nmChartFill', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: 0, 'stop-color': '#0071e3', 'stop-opacity': 0.22 }, grad);
    svg('stop', { offset: 1, 'stop-color': '#0071e3', 'stop-opacity': 0 }, grad);
    for (let k = 0; k <= 3; k++) {
      const y = Y0 - ((Y0 - Y1) * k) / 3;
      svg('line', { x1: X0, x2: X1, y1: y, y2: y, stroke: 'rgba(0,0,0,.06)', 'stroke-width': 1 }, g);
    }
    const area = svg('path', { fill: 'url(#nmChartFill)' }, g);
    const line = svg('path', { fill: 'none', stroke: '#0071e3', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    const dots = pts.map(([x, y]) => svg('circle', { cx: x, cy: y, r: 5, fill: '#fff', stroke: '#0071e3', 'stroke-width': 2.5 }, g));
    const head = svg('circle', { r: 7, fill: '#0071e3', opacity: 0 }, g);
    DAYS.forEach((d, i) => {
      const day = el('div', 'day', stage, d);
      day.style.left = `${pts[i]![0]}px`;
    });
    el('div', 'k', stage, options.text ?? 'WEEKLY VIEWS · 本周浏览');
    const big = el('div', 'big', stage);
    const delta = el('div', 'delta', stage, '↑ 38%');
    const tip = el('div', 'tip', stage);

    const draw = spring({ duration: 1.9, bounce: 0 });
    const retract = spring({ duration: 0.9, bounce: 0 });
    const pop = spring({ duration: 0.45, bounce: 0.35 });
    const progress = track(0, [[0.6, 1, draw], [6.5, 0, retract]]);
    const tipIn = track(0, [[2.9, 1, pop], [6.2, 0, spring({ duration: 0.3 })]]);
    const headO = track(0, [[0.55, 1, spring({ duration: 0.3 })], [2.7, 0, spring({ duration: 0.4 })]]);
    const n = pts.length - 1;
    const maxIndex = VALUES.indexOf(max);

    const render = (t: number) => {
      const p = clamp(progress(t));
      const pos = p * n;
      const whole = Math.floor(pos);
      const frac = pos - whole;
      const visible = pts.slice(0, whole + 1).map(([x, y]) => [x, y] as [number, number]);
      if (whole < n) {
        const [ax, ay] = pts[whole]!;
        const [bx, by] = pts[whole + 1]!;
        visible.push([ax + (bx - ax) * frac, ay + (by - ay) * frac]);
      }
      const d = 'M' + visible.map(([x, y]) => `${x},${y}`).join(' L');
      line.setAttribute('d', visible.length > 1 ? d : '');
      const last = visible[visible.length - 1]!;
      area.setAttribute('d', visible.length > 1 ? `${d} L${last[0]},${Y0} L${X0},${Y0} Z` : '');
      head.setAttribute('cx', String(last[0]));
      head.setAttribute('cy', String(last[1]));
      head.setAttribute('opacity', String(clamp(headO(t)) * (p > 0.001 ? 1 : 0)));
      dots.forEach((dot, i) => {
        const k = clamp((pos - i) * 2.5 + 0.2);
        dot.setAttribute('r', String(5 * Math.max(0, backOut(k)) * (k > 0 ? 1 : 0)));
      });
      // 总数和线同步增长
      big.textContent = Math.round(total * p).toLocaleString('en-US');
      delta.style.opacity = String(clamp((p - 0.9) * 10));
      // 提示框弹到最高点上方
      const tp = tipIn(t);
      const [mx, my] = pts[maxIndex]!;
      tip.textContent = `${DAYS[maxIndex]} · ${VALUES[maxIndex]!.toLocaleString('en-US')}`;
      tip.style.transform = `translate(${mx - tip.offsetWidth / 2}px, ${my - 46 + (1 - tp) * 10}px) scale(${Math.max(0, tp)})`;
      tip.style.opacity = String(clamp(tp * 2));
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 4.5 });
  },
};
