// 形状变形：一块软糖在圆、圆角方、心、星、云之间变形，最后回到圆。
// 每个形状先画成稠密的闭合曲线，归一到同样的面积，再按弧长等距重采样成 N 个点；
// 相邻两个形状的起点对齐到“逐点距离最小”的位置，变形就是逐点插值，用 Catmull-Rom 连成平滑轮廓。
// 每次变形前先压扁蓄力、变形时弹起、落回时果冻般晃两下；颜色在 OKLCH 里过渡，名字等形状基本成形才换。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, svg, injectCSS, smooth, TAU, type SceneDef } from './util.ts';

const D = 10;
const N = 180; // 重采样后的点数
const R = 90; // 等面积圆的半径
const CX = 320;
const CY = 160;
const GROUND = 280;
const PX = 2; // canvas 像素密度：阴影的模糊和偏移按设备像素算
const TIMES = [1.1, 2.9, 4.7, 6.5, 8.3];
// 名字、颜色、视觉大小（尖角形状面积相同也会显大，略缩一点）
const META = [
  { zh: '圆', en: 'Circle', color: '#5b6cff', size: 1 },
  { zh: '圆角方', en: 'Squircle', color: '#9a5cf5', size: 0.93 },
  { zh: '心', en: 'Heart', color: '#f2557f', size: 1 },
  { zh: '星', en: 'Star', color: '#ffa62b', size: 0.97 },
  { zh: '云', en: 'Cloud', color: '#6cc0fa', size: 1.02 },
];

type Pt = [number, number];

// ---------- 几何：稠密轮廓 → 归一 → 等弧长重采样 → 对齐起点 ----------

/** 有向面积：屏幕坐标（y 向下）里顺时针为正 */
function area(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[(i + 1) % p.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function centroid(p: Pt[]): Pt {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[(i + 1) % p.length]!;
    const c = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * c;
    cy += (y1 + y2) * c;
  }
  const a = area(p) * 6;
  return [cx / a, cy / a];
}

/** 沿弧长等距取 n 个点 */
function resample(p: Pt[], n: number): Pt[] {
  const len = [0];
  for (let i = 1; i <= p.length; i++) {
    const [x1, y1] = p[i - 1]!;
    const [x2, y2] = p[i % p.length]!;
    len.push(len[i - 1]! + Math.hypot(x2 - x1, y2 - y1));
  }
  const total = len[p.length]!;
  const out: Pt[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (total * i) / n;
    while (len[j + 1]! < s) j++;
    const k = (s - len[j]!) / (len[j + 1]! - len[j]! || 1);
    const [x1, y1] = p[j]!;
    const [x2, y2] = p[(j + 1) % p.length]!;
    out.push([mix(x1, x2, k), mix(y1, y2, k)]);
  }
  return out;
}

/** 拉普拉斯平滑：把尖角磨圆 */
function soften(p: Pt[], iterations: number) {
  let cur = p;
  for (let it = 0; it < iterations; it++) {
    cur = cur.map(([x, y], i) => {
      const a = cur[(i - 1 + cur.length) % cur.length]!;
      const b = cur[(i + 1) % cur.length]!;
      return [x * 0.5 + (a[0] + b[0]) * 0.25, y * 0.5 + (a[1] + b[1]) * 0.25] as Pt;
    });
  }
  return cur;
}

/** 顺时针、重心放到原点、面积缩放到 π(R·size)²，再重采样成 N 个点 */
function normalize(p: Pt[], size: number) {
  const pts = area(p) < 0 ? [...p].reverse() : p;
  const [gx, gy] = centroid(pts);
  const k = (R * size) / Math.sqrt(area(pts) / Math.PI);
  return resample(
    pts.map(([x, y]) => [(x - gx) * k, (y - gy) * k] as Pt),
    N,
  );
}

/** 循环移动起点，让它和上一个形状逐点距离的平方和最小 */
function align(p: Pt[], prev: Pt[]) {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s < N; s++) {
    let d = 0;
    for (let i = 0; i < N; i++) {
      const a = p[(i + s) % N]!;
      const b = prev[i]!;
      d += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    }
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return p.map((_, i) => p[(i + best) % N]!);
}

const dense = (f: (u: number) => Pt, n = 1440) => Array.from({ length: n }, (_, i) => f(i / n));

/** 圆角多边形：每个顶点按边长的 cut 比例切掉，用二次曲线圆过去 */
function roundedPolygon(v: Pt[], cut: (i: number) => number) {
  const out: Pt[] = [];
  v.forEach((p1, i) => {
    const p0 = v[(i - 1 + v.length) % v.length]!;
    const p2 = v[(i + 1) % v.length]!;
    const c = cut(i);
    const a: Pt = [mix(p1[0], p0[0], c), mix(p1[1], p0[1], c)];
    const b: Pt = [mix(p1[0], p2[0], c), mix(p1[1], p2[1], c)];
    for (let k = 0; k <= 24; k++) {
      const u = k / 24;
      const m = 1 - u;
      out.push([m * m * a[0] + 2 * m * u * p1[0] + u * u * b[0], m * m * a[1] + 2 * m * u * p1[1] + u * u * b[1]]);
    }
  });
  return out;
}

/** 平滑并集（多项式 smin），云的几团之间是圆润的凹口而不是尖角 */
const smin = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return mix(b, a, h) - k * h * (1 - h);
};

function cloudOutline() {
  const puffs = [
    [-0.58, 0.12, 0.36],
    [-0.16, -0.2, 0.5],
    [0.38, -0.08, 0.42],
    [0.72, 0.18, 0.28],
  ] as const;
  const sd = (x: number, y: number) => {
    // 底部一条圆角长条，让云底平一些
    const qx = Math.abs(x - 0.06) - 0.62;
    const qy = Math.abs(y - 0.3) - 0.01;
    let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.24;
    for (const [cx, cy, r] of puffs) d = smin(d, Math.hypot(x - cx, y - cy) - r, 0.14);
    return d;
  };
  // 从云里一点向外打射线，二分找边界
  return dense((u) => {
    const a = TAU * u - Math.PI / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let lo = 0;
    let hi = 2;
    for (let i = 0; i < 36; i++) {
      const m = (lo + hi) / 2;
      if (sd(dx * m, 0.08 + dy * m) < 0) lo = m;
      else hi = m;
    }
    return [dx * lo, 0.08 + dy * lo];
  });
}

function buildShapes() {
  const circle = dense((u) => [Math.cos(TAU * u - Math.PI / 2), Math.sin(TAU * u - Math.PI / 2)]);
  const e = 2 / 4.6; // 超椭圆 |x|^4.6 + |y|^4.6 = 1，接近手机图标的圆角
  const squircle = dense((u) => {
    const c = Math.cos(TAU * u - Math.PI / 2);
    const s = Math.sin(TAU * u - Math.PI / 2);
    return [Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e];
  });
  const heart = soften(
    resample(
      dense((u) => {
        const s = TAU * u;
        return [16 * Math.sin(s) ** 3, -(13 * Math.cos(s) - 5 * Math.cos(2 * s) - 2 * Math.cos(3 * s) - Math.cos(4 * s))];
      }),
      720,
    ),
    260,
  );
  const starV = Array.from({ length: 10 }, (_, i): Pt => {
    const a = (TAU * i) / 10 - Math.PI / 2;
    const r = i % 2 ? 0.52 : 1;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const star = roundedPolygon(starV, (i) => (i % 2 ? 0.2 : 0.24));
  const raw = [circle, squircle, heart, star, cloudOutline()];
  const shapes = raw.map((p, i) => normalize(p, META[i]!.size));
  shapes.push(shapes[0]!); // 回到圆
  for (let i = 1; i < shapes.length; i++) shapes[i] = align(shapes[i]!, shapes[i - 1]!);
  return shapes;
}

// ---------- 颜色：在 OKLCH 里插值，色相走近路，中间色不发灰 ----------

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** OKLCH → [r, g, b]（0~255） */
function fromOklch([L, C, h]: [number, number, number]): [number, number, number] {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((c) => Math.round(clamp(toGamma(clamp(c))) * 255)) as [number, number, number];
}

/** 在 OKLab 里直线插值（色相相距远时不会绕出第三种颜色），结果仍用 LCH 表示，方便调明暗 */
function mixLab(a: [number, number, number], b: [number, number, number], p: number): [number, number, number] {
  const A = mix(a[1] * Math.cos(a[2]), b[1] * Math.cos(b[2]), p);
  const B = mix(a[1] * Math.sin(a[2]), b[1] * Math.sin(b[2]), p);
  return [mix(a[0], b[0], p), Math.hypot(A, B), Math.atan2(B, A)];
}

/** 把颜色往亮或暗推：L 加减、色度略收 */
const shade = ([L, C, h]: [number, number, number], dL: number, kC = 1): [number, number, number] => [clamp(L + dL), C * kC, h];
const css = (c: [number, number, number], a = 1) => `rgba(${fromOklch(c).join(',')},${a})`;

export const morph: SceneDef = {
  title: '形状变形',
  category: '图形',
  description: '一块软糖在圆、圆角方、心、星、云之间变形：轮廓按弧长等点重采样、起点对齐后插值，蓄力、弹起、落地都带着果冻般的回弹。',
  tags: ['spring', 'track', '等弧长重采样', 'canvas'],
  tone: 'light',
  en: {
    title: 'Shape morph',
    description: 'A soft jelly morphs through a circle, squircle, heart, star and cloud. Outlines are resampled by arc length with aligned start points, and every change crouches, hops and lands with a wobbly spring.',
    tags: ['spring', 'track', 'arc-length resampling', 'canvas'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    // options.text 可以用 | 分隔，依次替换五个形状的名字
    const custom = options.text?.split('|') ?? [];
    const names = META.map((m, i) => custom[i]?.trim() || (en ? m.en : m.zh));
    const stage = createStage(host, 'light', 'nm-morph');
    injectCSS(
      'nm-morph',
      `.nm-morph{background:linear-gradient(180deg,#f7f7fa,#eceef3)}
.nm-morph .name{position:absolute;left:0;right:0;top:295px;text-align:center;font-size:17px;font-weight:650;letter-spacing:.01em;color:#1d1d1f;white-space:nowrap}
.nm-morph .seg{position:absolute;left:50%;top:333px;width:222px;height:38px;margin-left:-111px;border-radius:19px;background:rgba(20,20,40,.055);box-shadow:inset 0 0 0 .5px rgba(20,20,40,.06)}
.nm-morph .thumb{position:absolute;left:3px;top:3px;width:40px;height:32px;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(20,20,40,.08),0 4px 12px rgba(20,20,40,.1)}
.nm-morph .seg svg{position:absolute;top:10px;width:18px;height:18px;overflow:visible}`,
    );
    const { ctx } = createCanvas(stage, PX);
    const labels = [...names, names[0]!].map((n) => el('div', 'name', stage, n));
    const seg = el('div', 'seg', stage);
    const thumb = el('div', 'thumb', seg);

    const shapes = buildShapes();
    const X = shapes.map((s) => Float64Array.from(s, (p) => p[0]));
    const Y = shapes.map((s) => Float64Array.from(s, (p) => p[1]));
    const colors = META.map((m) => toOklch(m.color));
    colors.push(colors[0]!);

    // 分段控件里的五个小图标，就用同一套轮廓缩小
    const icons = shapes.slice(0, 5).map((s, i) => {
      const box = svg('svg', { viewBox: '-9 -9 18 18' }, seg);
      box.style.left = `${3 + i * 43 + 11}px`;
      const k = 8.2 / Math.max(...s.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]))));
      const d = s.filter((_, j) => j % 3 === 0).map((p, j) => `${j ? 'L' : 'M'}${(p[0] * k).toFixed(2)} ${(p[1] * k).toFixed(2)}`).join('') + 'Z';
      return svg('path', { d }, box);
    });

    // ---------- 动作 ----------
    const morphS = spring({ duration: 0.8, bounce: 0.28 });
    const crouch = spring({ duration: 0.32, bounce: 0 });
    const pop = spring({ duration: 0.34, bounce: 0.1 });
    const jelly = spring({ duration: 0.62, bounce: 0.55 });
    const fall = spring({ duration: 0.7, bounce: 0.4 });
    // 压扁量：正数压扁、负数拉长。蓄力压扁 → 弹起拉长 → 落地后果冻般晃回
    const squash = track(0, TIMES.flatMap((at) => [[at - 0.2, 1, crouch], [at, -0.75, pop], [at + 0.3, 0, jelly]] as const));
    // 离地高度：蓄力时下沉一点，弹起，再落回
    const lift = track(0, TIMES.flatMap((at) => [[at - 0.2, -5, crouch], [at, 16, pop], [at + 0.3, 0, fall]] as const));
    // 每次弹起时轻轻歪一下头，左右交替
    const tilt = track(0, TIMES.flatMap((at, k) => [[at, k % 2 ? -0.07 : 0.07, pop], [at + 0.28, 0, jelly]] as const));
    // 分段控件的滑块
    const slide = spring({ duration: 0.5, bounce: 0.22 });
    const thumbX = track(0, TIMES.map((at, k) => [at + 0.1, ((k + 1) % 5) * 43, slide] as const));
    // 名字：旧的在蓄力时向上淡出，新的等形状基本成形（约七成）才从下面淡入
    const fadeOut = spring({ duration: 0.28, bounce: 0 });
    const fadeIn = spring({ duration: 0.5, bounce: 0.15 });
    const labelO = labels.map((_, k) =>
      track(k === 0 ? 1 : 0, [
        ...(k > 0 ? [[TIMES[k - 1]! + 0.3, 1, fadeIn] as const] : []),
        ...(k < 5 ? [[TIMES[k]! - 0.12, 0, fadeOut] as const] : []),
      ]),
    );
    const labelY = labels.map((_, k) =>
      track(k === 0 ? 0 : 12, [
        ...(k > 0 ? [[TIMES[k - 1]! + 0.3, 0, fadeIn] as const] : []),
        ...(k < 5 ? [[TIMES[k]! - 0.12, -12, fadeOut] as const] : []),
      ]),
    );

    const xs = new Float64Array(N);
    const ys = new Float64Array(N);
    const L = [-0.56, -0.83]; // 光从左上来

    const render = (t: number) => {
      // 1. 逐点插值：从圆出发，每次变形叠加（下一个 − 上一个）× 弹簧
      const w = TIMES.map((at) => morphS(t - at));
      xs.set(X[0]!);
      ys.set(Y[0]!);
      w.forEach((wk, k) => {
        if (wk === 0) return;
        const x0 = X[k]!;
        const x1 = X[k + 1]!;
        const y0 = Y[k]!;
        const y1 = Y[k + 1]!;
        for (let i = 0; i < N; i++) {
          xs[i]! += (x1[i]! - x0[i]!) * wk;
          ys[i]! += (y1[i]! - y0[i]!) * wk;
        }
      });
      // 颜色跟着变形进度走；过渡中段整体提亮、略褪色，像变身时的一下闪光，也盖住中间色
      let lch = colors[0]!;
      let flash = 0;
      w.forEach((wk, k) => {
        const p = clamp(wk);
        lch = mixLab(lch, colors[k + 1]!, smooth(0.2, 0.85, p)); // 形状过了两成才开始换色，成形时换完
        flash = Math.max(flash, 4 * p * (1 - p));
      });
      lch = [clamp(lch[0] + 0.09 * flash), lch[1] * (1 - 0.1 * flash), lch[2]];

      // 2. 压扁、歪头、离地，换算到舞台坐标
      const sq = squash(t);
      const sx = 1 + 0.075 * sq;
      const sy = 1 - 0.095 * sq;
      const h = lift(t) + 2.5 * Math.sin((TAU * t) / 2);
      const rot = tilt(t);
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < N; i++) {
        const x = xs[i]! * sx;
        const y = ys[i]! * sy + R * 0.5 * (1 - sy); // 以底部附近为支点压扁
        xs[i] = CX + x * cos - y * sin;
        ys[i] = CY - h + x * sin + y * cos;
        minX = Math.min(minX, xs[i]!);
        maxX = Math.max(maxX, xs[i]!);
        minY = Math.min(minY, ys[i]!);
        maxY = Math.max(maxY, ys[i]!);
      }
      const path = new Path2D();
      path.moveTo(xs[0]!, ys[0]!);
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N;
        const b = (i + 1) % N;
        const c = (i + 2) % N;
        path.bezierCurveTo(
          xs[i]! + (xs[b]! - xs[a]!) / 6,
          ys[i]! + (ys[b]! - ys[a]!) / 6,
          xs[b]! - (xs[c]! - xs[i]!) / 6,
          ys[b]! - (ys[c]! - ys[i]!) / 6,
          xs[b]!,
          ys[b]!,
        );
      }
      path.closePath();
      const bw = maxX - minX;
      const bh = maxY - minY;
      const mx = (minX + maxX) / 2;
      const my = (minY + maxY) / 2;

      ctx.clearRect(0, 0, 640, 400);
      // 背景：身后一团很淡的同色光
      const glow = ctx.createRadialGradient(CX, CY + 10, 20, CX, CY + 10, 300);
      glow.addColorStop(0, css(shade(lch, 0.12, 0.6), 0.16));
      glow.addColorStop(1, css(shade(lch, 0.12, 0.6), 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 640, 400);

      // 3. 地上的影子：离地越高越小越淡
      const air = clamp((h + 6) / 40);
      ctx.save();
      ctx.translate(mx, GROUND);
      ctx.scale(bw * 0.52 * (1 - 0.25 * air), 13 * (1 - 0.2 * air));
      const fs = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      const ink = shade(lch, -0.4, 0.45);
      fs.addColorStop(0, css(ink, 0.3 * (1 - 0.45 * air)));
      fs.addColorStop(0.45, css(ink, 0.13 * (1 - 0.45 * air)));
      fs.addColorStop(1, css(ink, 0));
      ctx.fillStyle = fs;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 落地时地上荡开一圈淡淡的涟漪
      for (const at of TIMES) {
        const k = (t - at - 0.36) / 0.7;
        if (k <= 0 || k >= 1) continue;
        // 先在压扁的坐标里建路径，恢复后再描边，线宽才不会被压扁
        ctx.save();
        ctx.translate(mx, GROUND);
        ctx.scale(1, 0.085);
        ctx.beginPath();
        ctx.arc(0, 0, bw * (0.45 + 0.42 * k), 0, TAU);
        ctx.restore();
        ctx.strokeStyle = css(shade(lch, -0.3, 0.6), 0.22 * (1 - k) ** 2);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 4. 本体：带同色投影，填充用左上亮、右下暗的径向渐变
      ctx.save();
      ctx.shadowColor = css(shade(lch, -0.18), 0.32);
      ctx.shadowBlur = 34 * PX;
      ctx.shadowOffsetY = 18 * PX;
      const body = ctx.createRadialGradient(mx - bw * 0.28, my - bh * 0.34, 0, mx - bw * 0.1, my - bh * 0.1, Math.max(bw, bh) * 0.85);
      body.addColorStop(0, css(shade(lch, 0.13, 0.75)));
      body.addColorStop(0.5, css(lch));
      body.addColorStop(1, css(shade(lch, -0.1, 1.05)));
      ctx.fillStyle = body;
      ctx.fill(path);
      ctx.restore();

      // 5. 内阴影与边缘高光：把“形状外面”画到画面外，只让它的阴影落进形状里，于是光影都贴着轮廓走
      const ring = new Path2D();
      ring.rect(-2000, -1000, 3640, 2400); // 比画面大得多的矩形，挖掉形状（evenodd）
      ring.addPath(path);
      const inner = (color: string, blur: number, dx: number, dy: number) => {
        ctx.save();
        ctx.clip(path);
        ctx.shadowColor = color;
        ctx.shadowBlur = blur * PX;
        ctx.shadowOffsetX = (dx + 3000) * PX;
        ctx.shadowOffsetY = dy * PX;
        ctx.translate(-3000, 0);
        ctx.fillStyle = '#000';
        ctx.fill(ring, 'evenodd');
        ctx.restore();
      };
      inner(css(shade(lch, -0.22, 1.1), 0.55), 26, -10, -14);
      inner('rgba(255,255,255,.75)', 9, 4, 6);

      // 6. 高光：取“法线朝向光源、位置也最靠近光源”的那段轮廓，往里收一点，沿切线方向放一块柔光
      //    （只看法线的话，心形两瓣的左上侧会被平均到中间的凹口上）
      let sw = 0;
      let hx = 0;
      let hy = 0;
      let tx = 0;
      let ty = 0;
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N;
        const b = (i + 1) % N;
        const dx = xs[b]! - xs[a]!;
        const dy = ys[b]! - ys[a]!;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len; // 顺时针轮廓的外法线
        const ny = -dx / len;
        const k = Math.exp(10 * (nx * L[0]! + ny * L[1]!) + (7 * ((xs[i]! - mx) * L[0]! + (ys[i]! - my) * L[1]!)) / R);
        sw += k;
        hx += (xs[i]! - nx * R * 0.26) * k;
        hy += (ys[i]! - ny * R * 0.26) * k;
        tx += (dx / len) * k;
        ty += (dy / len) * k;
      }
      ctx.save();
      ctx.clip(path);
      ctx.translate(hx / sw, hy / sw);
      ctx.rotate(Math.atan2(ty, tx));
      ctx.scale(R * 0.34, R * 0.13);
      const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      spec.addColorStop(0, 'rgba(255,255,255,.62)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 7. 名字和分段控件
      labels.forEach((node, k) => {
        const o = clamp(labelO[k]!(t));
        node.style.opacity = String(o);
        node.style.transform = `translateY(${labelY[k]!(t)}px)`;
        node.style.filter = o > 0.01 && o < 0.99 ? `blur(${(1 - o) * 4}px)` : 'none';
      });
      thumb.style.transform = `translateX(${thumbX(t)}px)`;
      // 只有滑块离开的和要去的那两个图标会上色（路过的不亮），离滑块近才亮
      const near = thumbX(t) / 43;
      const cur = TIMES.filter((at) => t > at + 0.1).length % 5;
      const prev = (cur + 4) % 5;
      icons.forEach((p, i) => {
        const on = i === cur || i === prev ? clamp(1.5 - Math.abs(near - i) * 1.5) : 0;
        p.setAttribute('fill', on > 0.4 ? META[i]!.color : 'rgba(60,60,67,.42)');
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 6.1 });
  },
};
