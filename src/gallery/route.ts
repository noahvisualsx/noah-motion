// 路线：一张简笔地图上，四个地点依次落下图钉；路线沿着街道自己画出来，
// 一个小圆点沿路线走过去，右上角的距离跟着累加；到达终点时终点图钉泛起一圈波纹。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { easeInOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, type SceneDef } from './util.ts';

const D = 8;
const STOPS = [
  { x: 96, y: 300, name: '家' },
  { x: 252, y: 170, name: '咖啡馆' },
  { x: 412, y: 268, name: '公园' },
  { x: 552, y: 146, name: '工作室' },
];
// 路线沿着横平竖直的街道走，拐角处圆角
const ROUTE = 'M 96 300 L 96 236 Q 96 220 112 220 L 236 220 Q 252 220 252 204 L 252 170 L 252 140 Q 252 124 268 124 L 380 124 Q 396 124 396 140 L 396 252 Q 396 268 412 268 L 480 268 Q 496 268 496 252 L 496 162 Q 496 146 512 146 L 552 146'; // 终点放低一点，别被右上角的距离卡片挡住
const KM = 3.8;

export const route: SceneDef = {
  title: '路线',
  category: '界面',
  description: '简笔地图上四个地点依次落下图钉，路线沿街道画出来，小圆点走过去，距离一起累加，到终点泛起波纹。',
  tags: ['spring', '路径长度', 'SVG'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-route');
    injectCSS(
      'nm-route',
      `.nm-route{background:#eef0ea}
.nm-route svg{position:absolute;inset:0;width:640px;height:400px}
.nm-route .card{position:absolute;right:28px;top:24px;padding:10px 14px;border-radius:14px;background:#fff;box-shadow:0 6px 18px rgba(0,0,0,.08);font-size:12px;color:#6e6e73}
.nm-route .card b{display:block;font-size:22px;color:#1d1d1f;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.nm-route .lab{position:absolute;padding:3px 8px;border-radius:8px;background:#fff;font-size:12px;font-weight:600;color:#1d1d1f;box-shadow:0 2px 6px rgba(0,0,0,.08);white-space:nowrap;transform:translate(-50%,0)}`,
    );
    const g = svg('svg', { viewBox: '0 0 640 400' }, stage);
    // 街区和街道
    const blocks = [
      [20, 20, 200, 180],
      [130, 240, 110, 140],
      [280, 150, 100, 230],
      [420, 140, 60, 110],
      [520, 140, 100, 240],
      [280, 20, 200, 90],
    ];
    blocks.forEach(([x, y, w, h]) => svg('rect', { x: x!, y: y!, width: w!, height: h!, rx: 10, fill: '#e2e5dc' }, g));
    svg('rect', { x: 540, y: 300, width: 80, height: 70, rx: 12, fill: '#cfe3c5' }, g); // 一小块绿地
    svg('rect', { x: 140, y: 30, width: 70, height: 60, rx: 10, fill: '#cfe0f3' }, g); // 一小片水
    const path = svg('path', { d: ROUTE, fill: 'none', stroke: 'rgba(0,113,227,.18)', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    const drawn = svg('path', { d: ROUTE, fill: 'none', stroke: '#0071e3', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    const total = path.getTotalLength();
    drawn.setAttribute('stroke-dasharray', `${total} ${total}`);
    const ring = svg('circle', { cx: STOPS[3]!.x, cy: STOPS[3]!.y, r: 10, fill: 'none', stroke: '#0071e3', 'stroke-width': 2 }, g);
    const pins = STOPS.map((s, i) => {
      const pin = svg('g', {}, g);
      svg('ellipse', { cx: 0, cy: 0, rx: 6, ry: 2.5, fill: 'rgba(0,0,0,.18)' }, pin);
      const head = svg('g', {}, pin);
      svg('path', { d: 'M 0 0 C -4 -10 -11 -14 -11 -22 A 11 11 0 1 1 11 -22 C 11 -14 4 -10 0 0 Z', fill: i === 3 ? '#ff375f' : '#1d1d1f' }, head);
      svg('circle', { cx: 0, cy: -22, r: 4, fill: '#fff' }, head);
      return { pin, head, s };
    });
    const dot = svg('circle', { r: 7, fill: '#fff', stroke: '#0071e3', 'stroke-width': 3 }, g);
    const labels = STOPS.map((s) => {
      const l = el('div', 'lab', stage, s.name);
      l.style.left = `${s.x}px`;
      l.style.top = `${s.y + 8}px`;
      return l;
    });
    const card = el('div', 'card', stage, options.text ?? '步行路线');
    const km = el('b', '', card);

    const drop = spring({ duration: 0.5, bounce: 0.4 });
    const fade = spring({ duration: 0.5, bounce: 0 });
    const pinIn = STOPS.map((_, i) => track(0, [[0.3 + i * 0.18, 1, drop], [6.9, 0, fade]]));
    const routeO = track(0, [[1.0, 1, fade], [6.9, 0, fade]]);

    const render = (t: number) => {
      const p = easeInOut(clamp((t - 1.3) / 3.4));
      drawn.setAttribute('stroke-dashoffset', String(total * (1 - p)));
      const o = clamp(routeO(t));
      drawn.setAttribute('opacity', String(o));
      path.setAttribute('opacity', String(o));
      const pt = path.getPointAtLength(total * p);
      dot.setAttribute('cx', String(pt.x));
      dot.setAttribute('cy', String(pt.y));
      dot.setAttribute('opacity', String(o));
      km.textContent = `${(KM * p).toFixed(1)} km`;
      pins.forEach(({ pin, head, s }, i) => {
        const k = pinIn[i]!(t);
        pin.setAttribute('transform', `translate(${s.x} ${s.y})`);
        pin.setAttribute('opacity', String(clamp(k * 3)));
        head.setAttribute('transform', `translate(0 ${(1 - k) * -60}) scale(1 ${0.9 + 0.1 * clamp(k)})`);
        labels[i]!.style.opacity = String(clamp(k));
      });
      // 到达终点：一圈波纹
      const arrive = clamp((t - 4.8) / 1.1);
      ring.setAttribute('r', String(10 + arrive * 34));
      ring.setAttribute('opacity', String(arrive > 0 && arrive < 1 ? 1 - arrive : 0));
      card.style.opacity = String(o);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 5.5 });
  },
};
