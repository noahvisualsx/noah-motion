// 窗外一天：一扇窗、一盆植物、一盏落地灯和一面挂钟。窗外从午夜走到清晨、正午、黄昏再回到夜里：
// 天空颜色、太阳和月亮的轨迹、星星、飘过的云、远处楼里的灯都跟着时间变，屋里的墙也跟着明暗，入夜后灯亮起来。
// 一天就是一轮循环，所有周期都按整数圈设计，首尾相接。
import { timeline } from '../timeline.ts';
import { clamp, mix, mixColor } from '../track.ts';
import { createStage, el, svg, injectCSS, seeded, smooth, TAU, type SceneDef } from './util.ts';

const D = 16;
const WX = 150;
const WY = 44;
const WW = 300;
const WH = 232;
// 天空的颜色：[小时, 顶部, 底部]
const SKY: [number, string, string][] = [
  [0, '#0b1026', '#1b2a4a'],
  [4.5, '#141c3c', '#2c3561'],
  [6, '#4b5a9c', '#f2a98a'],
  [7.5, '#6fb3ff', '#d8ecff'],
  [12, '#3f9cff', '#bfe2ff'],
  [16.5, '#5ea6f0', '#dcefff'],
  [18, '#4a5aa6', '#ff9a6b'],
  [19.5, '#20275a', '#6a4a7c'],
  [21, '#0e1430', '#22305a'],
  [24, '#0b1026', '#1b2a4a'],
];

function skyAt(h: number) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i]!;
    const [h1, t1, b1] = SKY[i + 1]!;
    if (h <= h1) {
      const k = smooth(h0, h1, h);
      return [mixColor(t0, t1, k), mixColor(b0, b1, k)] as const;
    }
  }
  return [SKY[0]![1], SKY[0]![2]] as const;
}

/** 两个十六进制颜色混合，结果仍是十六进制，可以接着再混（mixColor 返回的是 rgb()，不能嵌套） */
const mixHex = (a: string, b: string, p: number) =>
  '#' +
  [1, 3, 5]
    .map((i) => Math.round(mix(parseInt(a.slice(i, i + 2), 16), parseInt(b.slice(i, i + 2), 16), clamp(p))).toString(16).padStart(2, '0'))
    .join('');

/** 夜晚程度：0 是白天，1 是深夜 */
const nightAt = (h: number) => (h < 12 ? 1 - smooth(4.5, 7.5, h) : smooth(17.5, 20.5, h));

export const daylight: SceneDef = {
  title: '窗外一天',
  category: '插画',
  description: '窗外从午夜走到正午再回到夜里：天色、日月、星星、云和远处的灯光一起变化，屋里入夜后亮起落地灯。',
  tags: ['timeline', 'loop', 'SVG'],
  tone: 'light',
  en: {
    title: 'A day at the window',
    description: 'Outside the window it goes from midnight to noon and back to night: the sky, sun and moon, stars, clouds and distant city lights all change, and the floor lamp comes on after dark.',
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-win');
    injectCSS(
      'nm-win',
      `.nm-win svg{position:absolute;inset:0;width:640px;height:400px}
.nm-win .time{position:absolute;left:504px;top:128px;width:72px;text-align:center;font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}`,
    );
    const g = svg('svg', { viewBox: '0 0 640 400' }, stage);
    const uid = `nmWin${Math.floor(Math.random() * 1e6)}`;
    const defs = svg('defs', {}, g);
    const skyGrad = svg('linearGradient', { id: `${uid}sky`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    const stopTop = svg('stop', { offset: 0 }, skyGrad);
    const stopBot = svg('stop', { offset: 1 }, skyGrad);
    const clip = svg('clipPath', { id: `${uid}clip` }, defs);
    svg('rect', { x: WX, y: WY, width: WW, height: WH }, clip);
    const glowGrad = svg('radialGradient', { id: `${uid}glow` }, defs);
    svg('stop', { offset: 0, 'stop-color': '#ffcf7a', 'stop-opacity': 0.75 }, glowGrad);
    svg('stop', { offset: 1, 'stop-color': '#ffcf7a', 'stop-opacity': 0 }, glowGrad);
    const sunGrad = svg('radialGradient', { id: `${uid}sun` }, defs);
    svg('stop', { offset: 0, 'stop-color': '#fff6d5', 'stop-opacity': 0.9 }, sunGrad);
    svg('stop', { offset: 1, 'stop-color': '#fff6d5', 'stop-opacity': 0 }, sunGrad);

    // 屋里的墙和地板
    const wall = svg('rect', { x: 0, y: 0, width: 640, height: 400 }, g);
    const floor = svg('rect', { x: 0, y: 352, width: 640, height: 48 }, g);

    // 窗外：天空、星星、日月、云、城市
    const outside = svg('g', { 'clip-path': `url(#${uid}clip)` }, g);
    svg('rect', { x: WX, y: WY, width: WW, height: WH, fill: `url(#${uid}sky)` }, outside);
    const rnd = seeded(31);
    const stars = Array.from({ length: 26 }, () => ({
      node: svg('circle', { cx: WX + rnd() * WW, cy: WY + rnd() * WH * 0.6, r: 0.6 + rnd() * 1.1, fill: '#fff' }, outside),
      m: 2 + Math.floor(rnd() * 6),
      ph: rnd() * TAU,
    }));
    const sunGlow = svg('circle', { r: 46, fill: `url(#${uid}sun)` }, outside);
    const sun = svg('circle', { r: 17 }, outside);
    const moon = svg('g', {}, outside);
    svg('circle', { r: 14, fill: '#f4f1e1' }, moon);
    [[-4, -3, 2.6], [4, 3, 1.8], [1, -6, 1.3]].forEach(([x, y, r]) => svg('circle', { cx: x!, cy: y!, r: r!, fill: '#dedac6' }, moon));
    const clouds = [
      { x: 30, y: 84, s: 1, speed: 1 },
      { x: 250, y: 120, s: 0.75, speed: 2 },
      { x: 400, y: 70, s: 0.6, speed: 1 },
    ].map((c) => {
      const grp = svg('g', {}, outside);
      const parts = [[0, 0, 30], [24, -9, 22], [46, 2, 19], [22, 6, 26]].map(([dx, dy, r]) => svg('ellipse', { cx: dx!, cy: dy!, rx: r!, ry: r! * 0.6 }, grp));
      return { grp, parts, ...c };
    });
    const buildings = [] as { body: SVGRectElement; lights: { node: SVGRectElement; on: number; off: number }[] }[];
    let bx = WX - 6;
    while (bx < WX + WW) {
      const w = 26 + rnd() * 30;
      const h = 44 + rnd() * 70;
      const y = WY + WH - h;
      const body = svg('rect', { x: bx, y, width: w, height: h }, outside);
      const lights = [];
      for (let ly = y + 8; ly < WY + WH - 8; ly += 11) {
        for (let lx = bx + 5; lx < bx + w - 7; lx += 9) {
          if (rnd() < 0.45) continue;
          lights.push({ node: svg('rect', { x: lx, y: ly, width: 4, height: 5, fill: '#ffd27a' }, outside), on: 17.5 + rnd() * 3.5, off: 0.5 + rnd() * 4.5 });
        }
      }
      buildings.push({ body, lights });
      bx += w + 2;
    }
    // 玻璃反光
    svg('path', { d: `M${WX + 40} ${WY} l40 0 l-90 ${WH} l-40 0z M${WX + 120} ${WY} l14 0 l-90 ${WH} l-14 0z`, fill: 'rgba(255,255,255,.07)' }, outside);

    // 窗框、窗台、植物
    const frame = svg('path', {
      d: `M${WX - 12} ${WY - 12}h${WW + 24}v${WH + 24}h${-WW - 24}z M${WX} ${WY}v${WH}h${WW}v${-WH}z M${WX + WW / 2 - 4} ${WY}h8v${WH}h-8z M${WX} ${WY + 92}h${WW}v8h${-WW}z`,
      'fill-rule': 'evenodd',
    }, g);
    const sill = svg('rect', { x: WX - 26, y: WY + WH + 10, width: WW + 52, height: 14, rx: 3 }, g);
    const plant = svg('g', {}, g);
    const leaves = [-38, -14, 10, 32, -60, 55].map((a, i) => ({
      node: svg('ellipse', { cx: 0, cy: -22, rx: 7, ry: 22 }, plant),
      a,
      i,
    }));
    const pot = svg('path', { d: 'M-16 0h32l-4 26h-24z' }, plant);

    // 落地灯、挂钟
    const lampGlow = svg('circle', { cx: 540, cy: 200, r: 150, fill: `url(#${uid}glow)` }, g);
    const pole = svg('path', { d: 'M540 352V196M520 352h40', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }, g);
    const shade = svg('path', { d: 'M512 196h56l-12-42h-32z' }, g);
    const bulb = svg('ellipse', { cx: 540, cy: 197, rx: 22, ry: 4 }, g);
    const face = svg('circle', { cx: 540, cy: 80, r: 30, 'stroke-width': 3 }, g);
    const hourHand = svg('line', { x1: 540, y1: 80, x2: 540, y2: 64, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, g);
    const minHand = svg('line', { x1: 540, y1: 80, x2: 540, y2: 58, 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    const time = el('div', 'time', stage);

    const render = (t: number) => {
      const h = (24 * t) / D;
      const night = nightAt(h);
      const [top, bot] = skyAt(h);
      stopTop.setAttribute('stop-color', top);
      stopBot.setAttribute('stop-color', bot);

      // 屋里：白天暖白，夜里偏蓝暗，灯亮后带一点暖色
      const lampOn = clamp(h > 12 ? smooth(18.5, 19.5, h) : 1 - smooth(5.5, 6.5, h));
      wall.setAttribute('fill', mixColor('#efe5d8', '#2b2d45', night * 0.85));
      floor.setAttribute('fill', mixColor('#d9c7b0', '#1f2033', night * 0.85));
      const wood = mixColor('#fbfaf7', '#4a4b63', night * 0.8);
      frame.setAttribute('fill', wood);
      sill.setAttribute('fill', mixColor('#e9e1d6', '#3d3e56', night * 0.8));
      lampGlow.setAttribute('opacity', String(lampOn));
      pole.setAttribute('stroke', mixColor('#3a3a3c', '#1c1c24', night));
      shade.setAttribute('fill', mixColor('#f2e3c6', '#ffd998', lampOn));
      bulb.setAttribute('fill', mixColor('#d8cdb8', '#fff3c4', lampOn));
      face.setAttribute('fill', mixColor('#ffffff', '#3c3e57', night * 0.8));
      face.setAttribute('stroke', mixColor('#3a3a3c', '#b8b9cc', night));
      hourHand.setAttribute('stroke', mixColor('#1d1d1f', '#e5e5ea', night));
      minHand.setAttribute('stroke', mixColor('#1d1d1f', '#e5e5ea', night));
      hourHand.setAttribute('transform', `rotate(${((h % 12) / 12) * 360} 540 80)`);
      minHand.setAttribute('transform', `rotate(${(h % 1) * 360} 540 80)`);
      time.textContent = `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
      time.style.color = mixColor('#6e6e73', '#a1a1a6', night);

      // 太阳：5:30 升起，18:30 落下
      const su = (h - 5.5) / 13;
      const sunUp = su > 0 && su < 1;
      const sx = WX + WW * (0.12 + 0.76 * su);
      const sy = WY + WH + 14 - 190 * Math.sin(Math.PI * clamp(su));
      sun.setAttribute('cx', String(sx));
      sun.setAttribute('cy', String(sy));
      sun.setAttribute('fill', mixColor('#ff9f4a', '#fff1c1', Math.sin(Math.PI * clamp(su))));
      sunGlow.setAttribute('cx', String(sx));
      sunGlow.setAttribute('cy', String(sy));
      sun.setAttribute('opacity', sunUp ? '1' : '0');
      sunGlow.setAttribute('opacity', sunUp ? '1' : '0');
      // 月亮：18:30 升起，第二天 5:30 落下
      const mu = (((h - 18.5 + 24) % 24) / 11);
      const moonUp = mu > 0 && mu < 1;
      moon.setAttribute('transform', `translate(${WX + WW * (0.15 + 0.7 * mu)} ${WY + WH + 14 - 160 * Math.sin(Math.PI * clamp(mu))})`);
      moon.setAttribute('opacity', moonUp ? String(0.3 + 0.7 * night) : '0');
      // 星星：只在夜里，闪烁频率是每轮整数次
      for (const s of stars) s.node.setAttribute('opacity', String(night * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin((TAU * t * s.m) / D + s.ph)))));
      // 云：每轮正好飘过整数个来回；颜色白天白、黄昏粉、夜里暗蓝
      const dusk = Math.max(smooth(16.5, 18, h) * (1 - smooth(18.5, 20, h)), smooth(5, 6, h) * (1 - smooth(6.5, 8, h)));
      const cloudColor = mixHex(mixHex('#ffffff', '#ffc4a3', dusk), '#2f3a66', night);
      for (const c of clouds) {
        const x = WX - 80 + ((c.x + (t / D) * 460 * c.speed) % 460);
        c.grp.setAttribute('transform', `translate(${x} ${c.y}) scale(${c.s})`);
        c.parts.forEach((p) => p.setAttribute('fill', cloudColor));
        c.grp.setAttribute('opacity', String(mix(0.95, 0.6, night)));
      }
      // 远处的楼：白天浅灰蓝，夜里几乎是剪影，窗户按各自的时间亮灯、熄灯
      const bColor = mixHex(mixHex('#a9bccf', '#c98f86', dusk * 0.4), '#161c38', night);
      for (const b of buildings) {
        b.body.setAttribute('fill', bColor);
        for (const l of b.lights) l.node.setAttribute('opacity', h >= l.on || h < l.off ? String(0.9 * night) : '0');
      }
      // 植物：叶子轻轻摆，夜里变暗
      plant.setAttribute('transform', `translate(${WX + WW - 46} ${WY + WH + 10})`);
      const leaf = mixColor('#4fae6a', '#24453a', night * 0.85);
      for (const l of leaves) {
        l.node.setAttribute('fill', leaf);
        l.node.setAttribute('transform', `rotate(${l.a + 3 * Math.sin((TAU * t * 2) / D + l.i)})`);
      }
      pot.setAttribute('fill', mixColor('#d9825b', '#6b3f33', night * 0.8));
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 6.7 });
  },
};
