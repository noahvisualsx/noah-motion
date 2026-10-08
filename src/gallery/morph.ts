// 形状变形：一个形状在圆、圆角方、星、心、云之间变形，最后回到圆。
// 轮廓是 144 个按角度取样的半径，每次变形都叠加一条弹簧，所以会冲过头再弹回来，像果冻；
// 每次变形同时转 72°，五次正好一圈，颜色也跟着弹簧过渡。
import { spring } from '../spring.ts';
import { clamp, mixColor } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, TAU, type SceneDef } from './util.ts';

const D = 10;
const M = 144;
const R0 = 105;
const CX = 320;
const CY = 182;
const TIMES = [0.6, 2.4, 4.2, 6.0, 7.8];
const COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#0a84ff'];
const NAMES = { zh: ['圆', '圆角方', '星', '心', '云', '圆'], en: ['Circle', 'Squircle', 'Star', 'Heart', 'Cloud', 'Circle'] };

const angles = Array.from({ length: M }, (_, j) => (TAU * j) / M - Math.PI / 2);

/** 从中心发出的射线和多边形的交点距离 */
function rayPolygon(theta: number, pts: [number, number][]) {
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    const ex = x2 - x1;
    const ey = y2 - y1;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = (x1 * ey - y1 * ex) / den;
    const u = (x1 * dy - y1 * dx) / den;
    if (s > 0 && u >= 0 && u <= 1) best = Math.min(best, s);
  }
  return best;
}

/** 把一条闭合曲线按角度重新取样成半径 */
function radial(points: [number, number][]) {
  const polar = points.map(([x, y]) => [Math.atan2(y, x), Math.hypot(x, y)] as const).sort((a, b) => a[0] - b[0]);
  return angles.map((theta) => {
    const a = Math.atan2(Math.sin(theta), Math.cos(theta));
    let i = polar.findIndex((p) => p[0] >= a);
    if (i <= 0) i = i === 0 ? 0 : polar.length - 1;
    const p1 = polar[(i - 1 + polar.length) % polar.length]!;
    const p2 = polar[i]!;
    let span = p2[0] - p1[0];
    if (span <= 0) span += TAU;
    let off = a - p1[0];
    if (off < 0) off += TAU;
    return p1[1] + (p2[1] - p1[1]) * clamp(off / span);
  });
}

const SHAPES: number[][] = [
  angles.map(() => R0),
  angles.map((a) => (R0 * 0.93) / Math.pow(Math.abs(Math.cos(a)) ** 4 + Math.abs(Math.sin(a)) ** 4, 1 / 4)),
  (() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (TAU * i) / 10 - Math.PI / 2;
      const r = i % 2 ? R0 * 0.55 : R0 * 1.2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return angles.map((a) => rayPolygon(a, pts));
  })(),
  (() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 720; i++) {
      const s = (TAU * i) / 720;
      const x = 16 * Math.sin(s) ** 3;
      const y = -(13 * Math.cos(s) - 5 * Math.cos(2 * s) - 2 * Math.cos(3 * s) - Math.cos(4 * s));
      pts.push([x * 7, (y - 2.6) * 7]);
    }
    return radial(pts);
  })(),
  angles.map((a) => R0 * (1 + 0.12 * Math.sin(3 * a + 0.5) + 0.07 * Math.sin(5 * a + 1.3) + 0.05 * Math.cos(7 * a))),
  angles.map(() => R0),
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export const morph: SceneDef = {
  title: '形状变形',
  category: '图形',
  description: '一个形状在圆、圆角方、星、心、云之间变形，每次都冲过头再弹回来，同时转 72°，五次正好转一圈。',
  tags: ['spring', '取样插值', 'SVG'],
  tone: 'light',
  en: {
    title: 'Shape morph',
    description: 'One shape morphs through a circle, squircle, star, heart and cloud, overshooting and springing back each time while turning 72°, so five morphs make a full turn.',
    tags: ['spring', 'resampling', 'SVG'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const names = NAMES[en ? 'en' : 'zh'];
    const stage = createStage(host, 'light', 'nm-morph');
    injectCSS(
      'nm-morph',
      `.nm-morph{background:radial-gradient(70% 70% at 50% 40%,#ffffff,#eceef2)}
.nm-morph svg{position:absolute;inset:0;width:640px;height:400px;overflow:visible}
.nm-morph .name{position:absolute;left:0;right:0;top:322px;text-align:center;font-size:17px;font-weight:700}
.nm-morph .dots{position:absolute;left:0;right:0;top:354px;display:flex;justify-content:center;gap:8px}
.nm-morph .dots i{width:7px;height:7px;border-radius:50%;background:#d1d1d6}`,
    );
    const g = svg('svg', { viewBox: '0 0 640 400' }, stage);
    const shadow = svg('ellipse', { cx: CX, cy: 300, rx: 90, ry: 9, fill: 'rgba(0,0,0,.08)' }, g);
    const path = svg('path', {}, g);
    const shine = svg('path', { fill: 'rgba(255,255,255,.22)' }, g);
    const name = el('div', 'name', stage);
    const dots = el('div', 'dots', stage);
    const dotEls = names.slice(0, 5).map(() => el('i', '', dots));
    const cols = COLORS.map(rgb);

    const jelly = spring({ duration: 0.85, bounce: 0.38 });
    const weights = (t: number) => TIMES.map((at) => (t > at ? jelly(t - at) : 0));

    const outline = (radii: number[], scale = 1, dx = 0, dy = 0, rot = 0) =>
      radii
        .map((r, j) => {
          const a = angles[j]! + rot;
          return `${j ? 'L' : 'M'}${(CX + dx + Math.cos(a) * r * scale).toFixed(1)} ${(CY + dy + Math.sin(a) * r * scale).toFixed(1)}`;
        })
        .join(' ') + 'Z';

    const render = (t: number) => {
      const w = weights(t);
      // 半径：从圆出发，每次变形叠加（下一个形状 − 上一个形状）× 弹簧
      const radii = SHAPES[0]!.map((r0, j) => w.reduce((r, wk, k) => r + (SHAPES[k + 1]![j]! - SHAPES[k]![j]!) * wk, r0));
      const rot = w.reduce((s, wk) => s + wk * (TAU / 5), 0);
      const c = cols[0]!.map((v0, ch) => w.reduce((v, wk, k) => v + (cols[k + 1]![ch]! - cols[k]![ch]!) * clamp(wk), v0));
      const fill = `rgb(${c.map((x) => Math.round(x)).join(',')})`;
      path.setAttribute('d', outline(radii, 1, 0, 0, rot));
      path.setAttribute('fill', fill);
      // 左上角一块高光，跟着形状一起变
      shine.setAttribute('d', outline(radii, 0.42, -26, -30, rot));
      const avg = radii.reduce((a, b) => a + b, 0) / M;
      shadow.setAttribute('rx', String(avg * 0.85));
      // 当前形状的名字：最近一次过半的变形
      let cur = 0;
      w.forEach((wk, k) => wk > 0.5 && (cur = k + 1));
      name.textContent = names[cur]!;
      name.style.color = mixColor('#1d1d1f', COLORS[cur]!, 0.6);
      dotEls.forEach((d, i) => (d.style.background = i === cur % 5 ? COLORS[cur]! : '#d1d1d6'));
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 6.8 });
  },
};
