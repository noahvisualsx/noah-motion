// 纸飞机：一架有折面的纸飞机在云层间飞——滑翔、横滚一周、翻一个筋斗、俯冲再拉起。
// 机身是几块三角折面，按航向、翻滚角和朝向观众的角度算出每块面的透视和明暗（正面纸白、背面偏暗、逆光透一点光）。
// 镜头跟着飞机走，远、中、近三层云按不同速度后退形成视差；两个翼尖拖出一条尾迹带，横滚时它也跟着拧一圈。
// 航线是按航向和速度预先积分出来的一张表，render(t) 只查表，仍是时间的纯函数；镜头和每层云都按整数圈循环，首尾无缝。
import { spring } from '../spring.ts';
import { track, clamp, mix, type Key } from '../track.ts';
import { cubicBezier } from '../easing.ts';
import { timeline } from '../timeline.ts';
import type { Spring } from '../spring.ts';
import { createStage, createCanvas, el, injectCSS, seeded, smooth, TAU, type SceneDef } from './util.ts';

const D = 10;
const DPR = 2;
const STEP = 1 / 100; // 航线表的时间步长
const N = Math.round(D / STEP);
const AX = 316; // 镜头大致把飞机保持在这个位置
const AY = 196;
const SIZE = 56; // 机身半长（px）
const FOC = 460; // 透视的焦距：越小近大远小越明显
const TRAIL = 2.4; // 尾迹保留的秒数
const TRAIL_STEP = 1 / 30;

// 纸飞机的顶点（机身坐标：x 朝前，y 朝右翼，z 朝上），单位是机身半长
const VERTS: readonly (readonly [number, number, number])[] = [
  [1.08, 0, 0], // 0 机头
  [-0.94, 0, 0], // 1 机尾（脊线）
  [-0.98, -0.24, 0.15], // 2 左翼内折线
  [-0.88, -0.72, 0.42], // 3 左翼尖（外折面上翘得更多）
  [-0.98, 0.24, 0.15], // 4 右翼内折线
  [-0.88, 0.72, 0.42], // 5 右翼尖
  [-0.8, -0.04, -0.36], // 6 左龙骨
  [-0.8, 0.04, -0.36], // 7 右龙骨
];
// 折面：三个顶点 + 朝外的参考方向（0 = 机身上方，-1 / 1 = 左 / 右）
const FACES: readonly { v: readonly [number, number, number]; side: number }[] = [
  { v: [0, 1, 6], side: -1 },
  { v: [0, 1, 7], side: 1 },
  { v: [0, 1, 2], side: 0 },
  { v: [0, 2, 3], side: 0 },
  { v: [0, 1, 4], side: 0 },
  { v: [0, 4, 5], side: 0 },
];
// 机翼上的横线（机身坐标的 y），第一条是红色的页边线
const RULES = [-0.62, -0.46, -0.3, -0.14, 0.14, 0.3, 0.46];
// 光从右上方照过来（x 右、y 下、z 朝向观众）
const LIGHT = norm(0.5, -0.72, 0.48);
// 纸的颜色：[受光, 背光]，正面（外侧）和背面（内侧）各一组
const PAPER_FRONT = [[255, 254, 250], [146, 166, 202]] as const;
const PAPER_BACK = [[238, 233, 224], [118, 134, 166]] as const;

type V3 = [number, number, number];
function norm(x: number, y: number, z: number): V3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rgb = (a: readonly number[], b: readonly number[], k: number) =>
  `rgb(${Math.round(mix(a[0]!, b[0]!, k))},${Math.round(mix(a[1]!, b[1]!, k))},${Math.round(mix(a[2]!, b[2]!, k))})`;

/** 循环用的轨道：把上一轮还没停稳的尾巴叠到这一轮开头（终值和初值可以差整数圈） */
function cyclic(initial: number, keys: readonly Key[], motion?: Spring) {
  const tr = track(initial, keys, motion);
  const end = tr(1e6);
  return (t: number) => tr(t) + tr(t + D) - end;
}

// ---------- 飞行剧本 ----------
const glide = spring({ duration: 1.3, bounce: 0 });
const nose = spring({ duration: 0.9, bounce: 0.15 });
// 俯仰：先抬头爬一点、改平；5.6 秒压机头俯冲，6.5 秒拉起，之后两段缓坡回到开头
const pitch = cyclic(-0.05, [
  [0.1, -0.3, glide],
  [0.95, -0.02, glide],
  [5.55, 0.82, nose],
  [6.45, -0.5, nose],
  [7.35, 0.16, glide],
  [8.55, -0.05, glide],
]);
// 筋斗：3.0–5.5 秒航向转一整圈，中段几乎匀速，所以圈是圆的
const loopEase = cubicBezier(0.42, 0, 0.5, 1);
const LOOP_AT = 3.0;
const LOOP_LEN = 2.5;
const loopTurn = (t: number) => -TAU * loopEase(clamp((t - LOOP_AT) / LOOP_LEN));
// 速度（px/s）：筋斗顶上慢、俯冲时快
const speed = cyclic(190, [
  [3.2, 150],
  [4.3, 205],
  [5.6, 290],
  [6.9, 190],
]);
// 横滚：1.35 秒滚一整圈，弹簧带一点过冲，停下时机翼晃两下
const rollS = spring({ duration: 1.25, bounce: 0.22 });
const roll = cyclic(0, [[1.35, TAU, rollS]]);
// 俯冲时机头朝镜头偏、离镜头更近
const dive = cyclic(0, [
  [5.5, 1, spring({ duration: 0.9, bounce: 0 })],
  [6.6, 0, spring({ duration: 1.4, bounce: 0 })],
]);

// 积分出一圈的航线：R 是减去匀速前进之后的“相对位置”，首尾相接
const RX = new Float64Array(N + 1);
const RY = new Float64Array(N + 1);
let V = 0;
{
  let x = 0;
  let y = 0;
  const heading = (t: number) => pitch(t) + loopTurn(t);
  for (let i = 0; i <= N; i++) {
    RX[i] = x;
    RY[i] = y;
    const t = (i + 0.5) * STEP;
    const th = heading(t);
    const s = speed(t);
    x += Math.cos(th) * s * STEP;
    y += Math.sin(th) * s * STEP;
  }
  // 竖直方向的一点点误差均摊掉，保证一圈后回到原高度；水平方向的总位移就是镜头的平均速度
  const dy = RY[N]! - RY[0]!;
  V = (RX[N]! - RX[0]!) / D;
  for (let i = 0; i <= N; i++) {
    RY[i] = RY[i]! - (dy * i) / N;
    RX[i] = RX[i]! - V * i * STEP;
  }
}
// 镜头：跟着航线的“平滑版本”走（周期性的盒式模糊做两遍），飞机在画面里有余量地晃
const SX = blurCyclic(blurCyclic(RX, 110), 110);
const SY = blurCyclic(blurCyclic(RY, 110), 110);
const MX = mean(RX);
const MY = mean(RY);
const FOLLOW_X = 0.82;
const FOLLOW_Y = 0.62;

function mean(a: Float64Array) {
  let s = 0;
  for (let i = 0; i < N; i++) s += a[i]!;
  return s / N;
}
function blurCyclic(a: Float64Array, r: number) {
  const out = new Float64Array(N + 1);
  let s = 0;
  for (let k = -r; k <= r; k++) s += a[((k % N) + N) % N]!;
  for (let i = 0; i < N; i++) {
    out[i] = s / (2 * r + 1);
    s += a[(i + r + 1) % N]! - a[(((i - r) % N) + N) % N]!;
  }
  out[N] = out[0]!;
  return out;
}
function lookup(a: Float64Array, t: number) {
  const u = ((((t % D) + D) % D) / STEP);
  const i = Math.min(N - 1, Math.floor(u));
  return mix(a[i]!, a[i + 1]!, u - i);
}
/** t 时刻飞机在“世界”里的位置（x 含匀速前进） */
const worldX = (t: number) => lookup(RX, t) + V * t;
const worldY = (t: number) => lookup(RY, t);
/** t 时刻的镜头位置 */
const camX = (t: number) => V * t + MX + FOLLOW_X * (lookup(SX, t) - MX);
const camY = (t: number) => MY + FOLLOW_Y * (lookup(SY, t) - MY);

interface Pose {
  x: number;
  y: number;
  f: V3;
  r: V3;
  u: V3;
  k: number;
}
/** t 时刻飞机的位置和姿态；位置换算到 now 时刻的镜头下（画尾迹时 now ≠ t） */
function pose(t: number, now: number): Pose {
  const h = 0.015;
  const dx = worldX(t + h) - worldX(t - h);
  const dy = worldY(t + h) - worldY(t - h);
  const th = Math.atan2(dy, dx);
  const dv = dive(t);
  const psi = 0.22 + 0.3 * dv; // 机头朝镜头偏的角度
  const beta = 0.78 - 0.1 * dv; // 看到机背的程度（0 = 正侧面，π/2 = 正俯视）
  const phi = roll(t) + 0.16 * Math.sin((TAU * 3 * t) / D) * (1 - smooth(1.1, 1.4, t) * (1 - smooth(2.9, 3.2, t)));
  const ct = Math.cos(th);
  const st = Math.sin(th);
  const f: V3 = [ct * Math.cos(psi), st * Math.cos(psi), Math.sin(psi)];
  // 机身“上方”：画面内垂直于航向的方向和朝向观众的方向按 β 混合，再扣掉在航向上的分量
  let u0: V3 = [st * Math.cos(beta), -ct * Math.cos(beta), Math.sin(beta)];
  const d = dot(u0, f);
  u0 = norm(u0[0] - d * f[0], u0[1] - d * f[1], u0[2] - d * f[2]);
  const side = cross(f, u0);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const u: V3 = [cp * u0[0] + sp * side[0], cp * u0[1] + sp * side[1], cp * u0[2] + sp * side[2]];
  return { x: AX + worldX(t) - camX(now), y: AY + worldY(t) - camY(now), f, r: cross(f, u), u, k: SIZE * (1 + 0.16 * dv) };
}
/** 机身坐标的一个点 → 画面坐标和深度 */
function project(p: Pose, v: readonly [number, number, number]): V3 {
  const x = (v[0] * p.f[0] + v[1] * p.r[0] + v[2] * p.u[0]) * p.k;
  const y = (v[0] * p.f[1] + v[1] * p.r[1] + v[2] * p.u[1]) * p.k;
  const z = (v[0] * p.f[2] + v[1] * p.r[2] + v[2] * p.u[2]) * p.k;
  const s = FOC / (FOC - z);
  return [p.x + x * s, p.y + y * s, z];
}

// ---------- 云 ----------
interface Sprite {
  img: HTMLCanvasElement;
  /** 贴图左上角相对云的原点（左端、云底）的偏移 */
  ox: number;
  oy: number;
  w: number;
  h: number;
}
interface Cloud {
  s: Sprite;
  x: number;
  y: number;
}
type Puff = [x: number, y: number, r: number];

/** 按鼓包的范围建一块刚好装得下的贴图，draw 里的坐标仍以云的原点为准 */
function sprite(puffs: Puff[], grow: number, draw: (g: CanvasRenderingContext2D) => void): Sprite {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y, r] of puffs) {
    x0 = Math.min(x0, x - r * grow);
    y0 = Math.min(y0, y - r * grow);
    x1 = Math.max(x1, x + r * grow);
    y1 = Math.max(y1, y + r * grow);
  }
  x0 = Math.floor(x0 - 2);
  y0 = Math.floor(y0 - 2);
  const w = Math.ceil(x1 + 2) - x0;
  const h = Math.ceil(y1 + 2) - y0;
  const img = document.createElement('canvas');
  img.width = w * DPR;
  img.height = h * DPR;
  const g = img.getContext('2d')!;
  g.scale(DPR, DPR);
  g.translate(-x0, -y0);
  draw(g);
  return { img, ox: x0, oy: y0, w, h };
}

/**
 * 给一组圆鼓包上色：先把所有鼓包画成一整块底色（圆和圆之间没有接缝），
 * 再只在这块形状里叠光影：每个鼓包右上一团柔和的受光、左下一团冷色背光，云底压一层冷灰，右上一层暖光。
 */
function shadePuffs(g: CanvasRenderingContext2D, puffs: Puff[], x0: number, x1: number, top: number, bottom: number, haze: number, warmLight = true) {
  g.fillStyle = rgb([226, 235, 247], [224, 233, 245], haze);
  g.beginPath();
  for (const [x, y, r] of puffs) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  }
  g.fill();
  g.globalCompositeOperation = 'source-atop';
  const hi = 1 - 0.6 * haze;
  for (const [x, y, r] of puffs) {
    const s = g.createRadialGradient(x - r * 0.4, y + r * 0.5, 0, x - r * 0.4, y + r * 0.5, r);
    s.addColorStop(0, `rgba(150,174,210,${0.3 * hi})`);
    s.addColorStop(1, 'rgba(150,174,210,0)');
    g.fillStyle = s;
    g.fillRect(x - r * 1.4, y - r * 0.5, r * 2, r * 2);
  }
  for (const [x, y, r] of puffs) {
    const l = g.createRadialGradient(x + r * 0.25, y - r * 0.4, 0, x + r * 0.25, y - r * 0.4, r * 0.95);
    l.addColorStop(0, `rgba(255,255,255,${0.9 * hi + 0.1})`);
    l.addColorStop(0.55, `rgba(255,255,255,${0.5 * hi})`);
    l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l;
    g.fillRect(x - r * 0.7, y - r * 1.35, r * 1.9, r * 1.9);
  }
  const sh = g.createLinearGradient(0, top, 0, bottom);
  sh.addColorStop(0, 'rgba(136,162,204,0)');
  sh.addColorStop(0.5, 'rgba(136,162,204,0)');
  sh.addColorStop(1, `rgba(136,162,204,${0.5 * hi})`);
  g.fillStyle = sh;
  g.fillRect(x0, top, x1 - x0, bottom - top);
  if (warmLight) {
    const warm = g.createLinearGradient(x1, top, mix(x0, x1, 0.3), bottom);
    warm.addColorStop(0, `rgba(255,238,212,${0.45 * hi})`);
    warm.addColorStop(1, 'rgba(255,238,212,0)');
    g.fillStyle = warm;
    g.fillRect(x0, top, x1 - x0, bottom - top);
  }
  g.globalCompositeOperation = 'source-over';
}

/** 程序化画一朵积云：原点在云底左端，中间高两边低的几层鼓包，云底切平；soft 的是近景虚焦的云 */
function cloudSprite(rnd: () => number, w: number, h: number, soft: boolean, haze: number): Sprite {
  const n = Math.max(4, Math.round(w / 30));
  const puffs: Puff[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    const bell = Math.sin(Math.PI * p);
    const r = h * (0.22 + 0.3 * bell) * (0.8 + 0.35 * rnd());
    puffs.push([p * w, -r * (0.45 + 0.25 * bell), r]);
  }
  for (let i = 0; i < n - 2; i++) {
    const p = (i + 1.5) / n;
    const bell = Math.sin(Math.PI * p);
    const r = h * (0.16 + 0.24 * bell) * (0.75 + 0.4 * rnd());
    puffs.push([p * w + (rnd() - 0.5) * 12, -h * (0.28 + 0.3 * bell) - r * 0.5, r]);
  }
  if (soft) {
    return sprite(puffs, 1.25, (g) => {
      for (const [x, y, r] of puffs) {
        const gr = g.createRadialGradient(x + r * 0.2, y - r * 0.3, 0, x, y, r * 1.25);
        gr.addColorStop(0, 'rgba(255,255,255,0.85)');
        gr.addColorStop(0.5, 'rgba(248,250,254,0.55)');
        gr.addColorStop(1, 'rgba(240,245,252,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r * 1.25, 0, TAU);
        g.fill();
      }
    });
  }
  const top = Math.min(...puffs.map(([, y, r]) => y - r));
  return sprite(puffs, 1, (g) => {
    shadePuffs(g, puffs, -h, w + h, top, 0, haze);
    // 云底切平
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.fillRect(-h, 0, w + h * 2, h);
    g.globalCompositeOperation = 'source-over';
  });
}

/** 远处的云海：一条横向首尾相接的云带（宽度 = 这一层一圈的位移），平铺着画 */
function cloudSea(rnd: () => number, wrap: number) {
  const h = 170;
  const c = document.createElement('canvas');
  c.width = Math.ceil(wrap) * DPR;
  c.height = h * DPR;
  const g = c.getContext('2d')!;
  g.scale(DPR, DPR);
  const top = 40;
  const puffs: Puff[] = [];
  const n = Math.round(wrap / 34);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * wrap + rnd() * 14;
    const big = 0.5 + 0.5 * Math.sin((i / n) * TAU * 3 + rnd());
    const r = 14 + big * 24 + rnd() * 10;
    const y = top + 36 - r * 0.6 + rnd() * 6;
    for (const ox of [-wrap, 0, wrap]) puffs.push([x + ox, y, r]);
  }
  // 往下几排越来越扁平，铺满底部
  for (let row = 1; row <= 3; row++) {
    const m = Math.round(wrap / (34 + row * 10));
    for (let j = 0; j < m; j++) for (const ox of [-wrap, 0, wrap]) puffs.push([(j * wrap) / m + row * 13 + ox, top + 40 + row * 24, 30 + row * 8]);
  }
  shadePuffs(g, puffs, 0, wrap, top, h, 0.4, false); // 云海要首尾相接，不加斜向的暖光
  g.fillStyle = '#e6eef7';
  g.fillRect(0, top + 120, wrap, h);
  // 越远越淡：上缘压一层天色的雾
  g.globalCompositeOperation = 'source-atop';
  const fog = g.createLinearGradient(0, 0, 0, h);
  fog.addColorStop(0, 'rgba(198,218,242,0.6)');
  fog.addColorStop(0.4, 'rgba(198,218,242,0.12)');
  fog.addColorStop(1, 'rgba(232,240,248,0.6)');
  g.fillStyle = fog;
  g.fillRect(0, 0, wrap, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}

const STEPS_ZH = ['滑翔', '横滚', '筋斗', '俯冲'];
const STEPS_EN = ['Glide', 'Roll', 'Loop', 'Dive'];
// 每个动作在时间轴上的区间（滑翔跨过循环点）
const PHASES: [number, number][] = [
  [7.3, 11.2],
  [1.2, 3.2],
  [3.2, 5.5],
  [5.5, 7.3],
];

export const plane: SceneDef = {
  title: '纸飞机',
  category: '插画',
  description: '一架有折面明暗的纸飞机在三层云之间滑翔、横滚、翻筋斗、俯冲，镜头跟着飞，翼尖拖出一条会跟着翻滚拧转的尾迹带。',
  tags: ['spring', 'track', 'cubicBezier', '透视投影', '视差', 'canvas'],
  tone: 'light',
  en: {
    title: 'Paper plane',
    description: 'A faceted paper plane glides, rolls, loops and dives between three layers of cloud. The camera follows it, and its wingtips trail a ribbon that twists along with every roll.',
    tags: ['spring', 'track', 'cubicBezier', 'perspective', 'parallax', 'canvas'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-plane');
    injectCSS(
      'nm-plane',
      `.nm-plane{background:
  radial-gradient(60% 70% at 86% 6%,rgba(255,244,222,.95),rgba(255,236,206,.35) 38%,rgba(255,236,206,0) 70%),
  linear-gradient(180deg,#5d97dd 0%,#86b4ea 38%,#bcd6f2 68%,#e9eef4 100%)}
.nm-plane .cap{position:absolute;left:30px;bottom:24px;color:#22436d}
.nm-plane .cap b{display:block;font-size:11px;font-weight:600;letter-spacing:.24em;opacity:.8}
.nm-plane .steps{display:flex;gap:16px;margin-top:8px;font-size:14px;font-weight:600}
.nm-plane .steps i{font-style:normal;position:relative;padding-bottom:7px}
.nm-plane .steps i::after{content:"";position:absolute;left:0;bottom:0;height:2px;border-radius:1px;background:currentColor;width:100%;transform:scaleX(var(--k,0));transform-origin:0 50%}`,
    );
    const { ctx } = createCanvas(stage, DPR);
    const cap = el('div', 'cap', stage);
    el('b', '', cap, options.text ?? (en ? 'FLIGHT · PAPER PLANE' : 'FLIGHT · 纸飞机'));
    const stepRow = el('div', 'steps', cap);
    const steps = (en ? STEPS_EN : STEPS_ZH).map((s) => el('i', '', stepRow, s));

    // 三层云：每层一圈正好后退整数个“平铺宽度”，循环时位置首尾一致
    const travel = V * D;
    const rnd = seeded(7);
    const seaWrap = 720;
    const sea = { img: cloudSea(rnd, seaWrap), p: seaWrap / travel };
    const farWrap = seaWrap;
    const far: Cloud[] = [
      { s: cloudSprite(rnd, 90, 30, false, 0.8), x: 60, y: 118 },
      { s: cloudSprite(rnd, 120, 36, false, 0.75), x: 330, y: 182 },
      { s: cloudSprite(rnd, 70, 26, false, 0.85), x: 560, y: 86 },
    ];
    const midWrap = 1100;
    const mid: Cloud[] = [
      { s: cloudSprite(rnd, 200, 74, false, 0.15), x: 40, y: 292 },
      { s: cloudSprite(rnd, 150, 58, false, 0.2), x: 380, y: 124 },
      { s: cloudSprite(rnd, 240, 82, false, 0.1), x: 640, y: 318 },
      { s: cloudSprite(rnd, 130, 50, false, 0.25), x: 900, y: 168 },
    ];
    // 近景：比飞机离镜头更近，后退得更快，虚焦
    const nearWrap = travel * 1.5;
    const near: Cloud[] = [
      { s: cloudSprite(rnd, 440, 120, true, 0), x: 0, y: 452 },
      { s: cloudSprite(rnd, 320, 90, true, 0), x: 1830, y: 74 },
    ];
    const layers = [
      { clouds: far, wrap: farWrap, p: farWrap / travel },
      { clouds: mid, wrap: midWrap, p: midWrap / travel },
    ];
    const nearLayer = { clouds: near, wrap: nearWrap, p: nearWrap / travel };

    const drawLayer = (L: { clouds: Cloud[]; wrap: number; p: number }, cx: number, cy: number) => {
      const off = -((((L.p * cx) % L.wrap) + L.wrap) % L.wrap);
      for (const c of L.clouds) {
        const { img, ox, oy, w, h } = c.s;
        for (const k of [-1, 0, 1]) {
          const x = c.x + ox + off + k * L.wrap;
          if (x > 660 || x + w < -20) continue;
          ctx.drawImage(img, x, c.y + oy - L.p * cy, w, h);
        }
      }
    };

    // 尾迹：两条翼尖轨迹之间的一条带子，越往后越窄；带子翻到背面的段落颜色偏蓝
    const K = Math.round(TRAIL / TRAIL_STEP);
    const lx = new Float64Array(K + 1);
    const ly = new Float64Array(K + 1);
    const rx = new Float64Array(K + 1);
    const ry = new Float64Array(K + 1);
    const tipL = VERTS[3]!;
    const tipR = VERTS[5]!;
    const drawTrail = (t: number) => {
      for (let k = 0; k <= K; k++) {
        const tk = t - k * TRAIL_STEP;
        const p = pose(tk, t);
        const a = project(p, tipL);
        const b = project(p, tipR);
        const age = k / K;
        const w = Math.pow(1 - age, 0.9) * (1 + 0.35 * age); // 往后越窄，同时有一点扩散
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        lx[k] = mx + ((a[0] - b[0]) / 2) * w;
        ly[k] = my + ((a[1] - b[1]) / 2) * w;
        rx[k] = mx + ((b[0] - a[0]) / 2) * w;
        ry[k] = my + ((b[1] - a[1]) / 2) * w;
      }
      // 按带子朝向（正面 / 背面）分段填充
      let start = 0;
      const facing = (k: number) => {
        const j = Math.min(K, k + 1);
        const ex = rx[k]! - lx[k]!;
        const ey = ry[k]! - ly[k]!;
        const mx = (lx[k]! + rx[k]! - lx[j]! - rx[j]!) / 2;
        const my = (ly[k]! + ry[k]! - ly[j]! - ry[j]!) / 2;
        return ex * my - ey * mx >= 0;
      };
      let side = facing(0);
      for (let k = 1; k <= K; k++) {
        const s = k === K ? !side : facing(k);
        if (s === side) continue;
        ctx.beginPath();
        for (let i = start; i <= k; i++) ctx.lineTo(lx[i]!, ly[i]!);
        for (let i = k; i >= start; i--) ctx.lineTo(rx[i]!, ry[i]!);
        ctx.closePath();
        ctx.fillStyle = side ? 'rgba(255,255,255,0.42)' : 'rgba(214,230,252,0.5)';
        ctx.fill();
        start = k;
        side = s;
      }
      // 两条翼尖的细线
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      for (const [xs, ys] of [
        [lx, ly],
        [rx, ry],
      ] as const) {
        ctx.beginPath();
        for (let k = 0; k <= K; k++) ctx.lineTo(xs[k]!, ys[k]!);
        ctx.stroke();
      }
    };

    // 速度线：飞得快（俯冲）时机身周围掠过几道细白线，沿航向往后跑
    const streaks = Array.from({ length: 7 }, (_, k) => ({ side: (k % 2 ? 1 : -1) * (18 + ((k * 23) % 50)), ph: (k * 0.37) % 1, len: 28 + ((k * 17) % 26) }));
    const drawStreaks = (p: Pose, t: number) => {
      const fast = clamp((speed(t) - 215) / 60);
      if (fast <= 0.01) return;
      const l = Math.hypot(p.f[0], p.f[1]) || 1;
      const fx = p.f[0] / l;
      const fy = p.f[1] / l;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.4;
      for (const s of streaks) {
        const u = (((t * 2.6 + s.ph) % 1) + 1) % 1;
        const back = -30 + u * 190;
        const x = p.x - fx * back - fy * s.side;
        const y = p.y - fy * back + fx * s.side;
        ctx.strokeStyle = `rgba(255,255,255,${(0.75 * fast * Math.sin(Math.PI * u)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - fx * s.len, y - fy * s.len);
        ctx.stroke();
      }
    };

    const pts: V3[] = VERTS.map(() => [0, 0, 0]);
    const drawPlane = (p: Pose) => {
      VERTS.forEach((v, i) => (pts[i] = project(p, v)));
      const world = VERTS.map((v) => [v[0] * p.f[0] + v[1] * p.r[0] + v[2] * p.u[0], v[0] * p.f[1] + v[1] * p.r[1] + v[2] * p.u[1], v[0] * p.f[2] + v[1] * p.r[2] + v[2] * p.u[2]] as V3);
      const faces = FACES.map((F) => {
        const [a, b, c] = F.v.map((i) => world[i]!) as [V3, V3, V3];
        let n = norm(...cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
        const ref = F.side === 0 ? p.u : F.side > 0 ? p.r : ([-p.r[0], -p.r[1], -p.r[2]] as V3);
        if (dot(n, ref) < 0) n = [-n[0], -n[1], -n[2]];
        const front = n[2] >= 0; // 看到的是外侧（正面）还是内侧
        const vis: V3 = front ? n : [-n[0], -n[1], -n[2]];
        const lam = dot(vis, LIGHT);
        // 漫反射 + 逆光时纸透出的一点光 + 朝上的面多接一点天光
        const b2 = clamp(0.26 + 0.86 * Math.pow(Math.max(0, lam), 0.7) + 0.22 * Math.max(0, -lam) + 0.1 * Math.max(0, -vis[1]));
        const pal = front ? PAPER_FRONT : PAPER_BACK;
        const z = (pts[F.v[0]]![2] + pts[F.v[1]]![2] + pts[F.v[2]]![2]) / 3;
        return { F, color: rgb(pal[1], pal[0], b2), z, front };
      });
      faces.sort((a, b) => a.z - b.z);
      // 先画整个轮廓带柔和投影，再逐面覆盖上去
      ctx.save();
      ctx.shadowColor = 'rgba(38,70,120,0.28)';
      ctx.shadowBlur = 16 * DPR;
      ctx.shadowOffsetY = 12 * DPR;
      ctx.fillStyle = 'rgb(200,212,230)';
      ctx.beginPath();
      for (const { F } of faces) {
        F.v.forEach((i, j) => (j ? ctx.lineTo(pts[i]![0], pts[i]![1]) : ctx.moveTo(pts[i]![0], pts[i]![1])));
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(44,62,96,0.26)';
      for (const { F, color, front } of faces) {
        ctx.beginPath();
        F.v.forEach((i, j) => (j ? ctx.lineTo(pts[i]![0], pts[i]![1]) : ctx.moveTo(pts[i]![0], pts[i]![1])));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.stroke();
        // 机翼正面印着作业本的横线：在机身坐标里取 y = 常数的线，和这块三角面求交再投影
        if (F.side !== 0 || !front) continue;
        ctx.save();
        ctx.lineWidth = 0.7;
        for (const c of RULES) {
          const seg: V3[] = [];
          for (let e = 0; e < 3; e++) {
            const a = VERTS[F.v[e]!]!;
            const b = VERTS[F.v[(e + 1) % 3]!]!;
            if ((a[1] - c) * (b[1] - c) >= 0) continue;
            const k = (c - a[1]) / (b[1] - a[1]);
            seg.push(project(p, [mix(a[0], b[0], k), c, mix(a[2], b[2], k)]));
          }
          if (seg.length < 2) continue;
          ctx.strokeStyle = c === RULES[0] ? 'rgba(232,96,96,0.45)' : 'rgba(96,142,214,0.38)';
          ctx.beginPath();
          ctx.moveTo(seg[0]![0], seg[0]![1]);
          ctx.lineTo(seg[1]![0], seg[1]![1]);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const render = (t: number) => {
      ctx.clearRect(0, 0, 640, 400);
      const cx = camX(t);
      const cy = camY(t) - MY;
      // 远处的云海和远云
      const so = -((((sea.p * cx) % seaWrap) + seaWrap) % seaWrap);
      for (const k of [0, 1]) ctx.drawImage(sea.img, so + k * seaWrap, 262 - sea.p * cy, seaWrap, 170);
      for (const L of layers) drawLayer(L, cx, cy);
      drawTrail(t);
      const p = pose(t, t);
      drawStreaks(p, t);
      drawPlane(p);
      drawLayer(nearLayer, cx, cy);
      // 当前动作的标签
      steps.forEach((s, i) => {
        const [a, b] = PHASES[i]!;
        const k = Math.max(smooth(a, a + 0.3, t) * (1 - smooth(b, b + 0.3, t)), smooth(a - D, a - D + 0.3, t) * (1 - smooth(b - D, b - D + 0.3, t)));
        s.style.opacity = String(0.5 + 0.5 * k);
        s.style.setProperty('--k', k.toFixed(3));
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 5.7 });
  },
};
