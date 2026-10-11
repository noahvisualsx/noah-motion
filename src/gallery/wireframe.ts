// 线框变成品：设计画布上，一张灰色线框页面（导航、标题、按钮、头图、卡片）一块块浮现；
// 光标依次点选每一块，选中框用弹簧在元素之间变形、尺寸数字跟着滚，被点到的地方填上颜色、文字和图片；
// 全部完成后页面微微浮起、扫过一道高光，最后淡出回到空白画布，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, seeded, TAU, type SceneDef } from './util.ts';

const D = 11.6;
// 画板在舞台上的位置和尺寸
const BX = 80;
const BY = 42;
const BW = 480;
const BH = 320;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif';
const INK = '#1b1a19';

const COPY = {
  zh: {
    label: '首页 — 桌面端',
    links: ['作品', '工作室', '关于'],
    contact: '联系我们',
    badge: '新 · 秋季作品集',
    head: '把想法|做成作品',
    sub: ['从线框到成品，', '只差一次认真的打磨。'],
    cta: '开始创作',
    cards: [
      ['形体', '12 件作品'],
      ['色彩', '8 件作品'],
      ['光影', '15 件作品'],
    ],
  },
  en: {
    label: 'Home — Desktop',
    links: ['Work', 'Studio', 'About'],
    contact: 'Contact',
    badge: 'New · Autumn collection',
    head: 'Ideas, made|tangible.',
    sub: ['From wireframe to finished,', 'one careful pass at a time.'],
    cta: 'Start creating',
    cards: [
      ['Form', '12 pieces'],
      ['Color', '8 pieces'],
      ['Light', '15 pieces'],
    ],
  },
};

// 每一步操作的时刻：光标先到，选中框跟上，点下去后开始填充
const ACT = [1.7, 2.35, 3.0, 3.8, 4.4, 5.0, 5.75];
const LIFT = 6.7;
const OUT = 10.4;

// ---------- 程序化插画：柔和的几何体静物 ----------

type G = CanvasRenderingContext2D;

function art(w: number, h: number, draw: (g: G) => void) {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  draw(g);
  return c;
}

/** 地面上一团柔和的椭圆影子 */
function shade(g: G, x: number, y: number, rx: number, ry: number, a = 0.24) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  grd.addColorStop(0, `rgba(90,40,30,${a})`);
  grd.addColorStop(1, 'rgba(90,40,30,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.restore();
}

function sphere(g: G, x: number, y: number, r: number, c: [string, string, string]) {
  shade(g, x + r * 0.3, y + r * 0.95, r * 1.15, r * 0.3);
  const grd = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.04, x, y, r * 1.05);
  grd.addColorStop(0, c[0]);
  grd.addColorStop(0.5, c[1]);
  grd.addColorStop(1, c[2]);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** 拱门：顶部是半圆的厚边框 */
function arch(g: G, x: number, y: number, w: number, h: number, th: number, c: [string, string]) {
  shade(g, x + w * 0.62, y + h, w * 0.75, w * 0.12, 0.2);
  const r = w / 2;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + r);
  g.arc(x + r, y + r, r, Math.PI, 0);
  g.lineTo(x + w, y + h);
  g.lineTo(x + w - th, y + h);
  g.lineTo(x + w - th, y + r);
  g.arc(x + r, y + r, r - th, 0, Math.PI, true);
  g.lineTo(x + th, y + h);
  g.closePath();
  const grd = g.createLinearGradient(x, 0, x + w, 0);
  grd.addColorStop(0, c[0]);
  grd.addColorStop(1, c[1]);
  g.fillStyle = grd;
  g.fill();
}

function cylinder(g: G, cx: number, y: number, rx: number, h: number, c: [string, string, string]) {
  const ry = rx * 0.32;
  shade(g, cx + rx * 0.4, y + h, rx * 1.4, rx * 0.36, 0.22);
  const grd = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  grd.addColorStop(0, c[0]);
  grd.addColorStop(0.45, c[1]);
  grd.addColorStop(1, c[2]);
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(cx - rx, y);
  g.lineTo(cx - rx, y + h);
  g.ellipse(cx, y + h, rx, ry, 0, Math.PI, 0, true);
  g.lineTo(cx + rx, y);
  g.closePath();
  g.fill();
  g.fillStyle = c[0];
  g.beginPath();
  g.ellipse(cx, y, rx, ry, 0, 0, TAU);
  g.fill();
}

/** 背景：一面渐变墙、一块地面，再撒一层细颗粒 */
function room(g: G, w: number, h: number, floorY: number, wall: [string, string], floor: [string, string], seed: number) {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, wall[0]);
  bg.addColorStop(1, wall[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const fl = g.createLinearGradient(0, floorY, 0, h);
  fl.addColorStop(0, floor[0]);
  fl.addColorStop(1, floor[1]);
  g.fillStyle = fl;
  g.fillRect(0, floorY, w, h - floorY);
  const rnd = seeded(seed);
  for (let i = 0; i < (w * h) / 14; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(80,40,30,.05)';
    g.fillRect(rnd() * w, rnd() * h, 0.6, 0.6);
  }
}

// ---------- 场景 ----------

export const wireframe: SceneDef = {
  title: '线框变成品',
  category: '界面',
  description: '灰色线框页面被光标一块块点选，选中框在元素之间弹性变形，填上颜色、文字和图片，最后整张页面浮起展示。',
  tags: ['track', 'spring', 'stagger', 'clip-path'],
  tone: 'light',
  en: {
    title: 'Wireframe to final',
    description: 'A cursor selects a gray wireframe block by block while the selection box springs between them, filling in color, type and imagery until the finished page lifts off the canvas.',
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const C = COPY[en ? 'en' : 'zh'];
    const stage = createStage(host, 'light', 'nm-wire');
    injectCSS(
      'nm-wire',
      `.nm-wire{background:#ebe8e3;perspective:1600px}
.nm-wire .grid{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(60,50,40,.16) 1px,transparent 1.3px);background-size:16px 16px;background-position:8px 6px}
.nm-wire .lab{position:absolute;left:${BX}px;top:${BY - 21}px;font-size:11px;font-weight:500;color:#8b8781;display:flex;align-items:center;gap:6px}
.nm-wire .lab svg{display:block}
.nm-wire .drop{position:absolute;left:${BX}px;top:${BY}px;width:${BW}px;height:${BH}px;border-radius:12px;box-shadow:0 46px 70px -18px rgba(70,45,25,.42),0 16px 28px -14px rgba(70,45,25,.3)}
.nm-wire .board{position:absolute;left:${BX}px;top:${BY}px;width:${BW}px;height:${BH}px;border-radius:10px;background:#fff;box-shadow:0 0 0 1px rgba(40,30,20,.07),0 2px 8px rgba(40,30,20,.05)}
.nm-wire .board>*{position:absolute}
.nm-wire .paint{left:0;top:0;width:100%;height:100%;border-radius:10px;background:radial-gradient(circle at 76% 34%,rgba(255,190,160,.5),rgba(255,190,160,0) 46%),radial-gradient(circle at 12% 96%,rgba(214,200,255,.4),rgba(214,200,255,0) 40%),#fbf7f1}
.nm-wire .bar{background:#e9e8ec;border-radius:4px}
.nm-wire .ph{background:#f3f3f5;border:1px solid #e3e3e7;overflow:hidden}
.nm-wire .ph svg{position:absolute;inset:0;width:100%;height:100%}
.nm-wire .tw{white-space:nowrap}
.nm-wire .tw span{display:block;padding:1px 0}
.nm-wire .tw i{position:absolute;top:12%;bottom:12%;width:2px;margin-left:1px;border-radius:1px;background:#0d99ff}
.nm-wire .img{overflow:hidden}
.nm-wire .mark{border-radius:5px;background:linear-gradient(135deg,#ff8a5c,#ffb86b)}
.nm-wire .mark::after{content:"";position:absolute;left:4px;top:4px;width:6px;height:6px;border-radius:50%;background:#fff}
.nm-wire .pill{border-radius:999px;display:flex;align-items:center;justify-content:center;white-space:nowrap}
.nm-wire .card{border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(60,40,20,.05),0 6px 16px rgba(60,40,20,.07)}
.nm-wire .card .img{position:absolute;left:8px;top:8px;width:40px;height:40px;border-radius:9px}
.nm-wire .card b{position:absolute;left:58px;top:11px;font-size:12px;font-weight:650;color:${INK}}
.nm-wire .card em{position:absolute;left:58px;top:29px;font-size:10px;font-style:normal;color:#8d8882}
.nm-wire .wcard{border:1px solid #e6e6ea;border-radius:12px}
.nm-wire .sheen{left:0;top:0;width:100%;height:100%;border-radius:10px;overflow:hidden;pointer-events:none}
.nm-wire .sheen i{position:absolute;top:-40%;left:0;width:70px;height:180%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.38),rgba(255,255,255,0));transform-origin:0 0}
.nm-wire .sel{position:absolute;left:0;top:0;border:1.5px solid #0d99ff;pointer-events:none}
.nm-wire .sel i{position:absolute;width:7px;height:7px;background:#fff;border:1.5px solid #0d99ff;border-radius:1.5px}
.nm-wire .sel b{position:absolute;left:50%;top:100%;margin-top:6px;transform:translateX(-50%);padding:1px 6px;border-radius:4px;background:#0d99ff;color:#fff;font-size:10px;line-height:15px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.nm-wire .cur{position:absolute;left:0;top:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.28));transform-origin:2px 2px}
.nm-wire .tap{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(13,153,255,.3)}`,
    );

    // 量文字宽度：线框条的长度和真实文字对齐
    const measure = document.createElement('canvas').getContext('2d')!;
    const textW = (s: string, size: number, weight = 400) => {
      measure.font = `${weight} ${size}px ${FONT}`;
      return Math.ceil(measure.measureText(s).width);
    };
    const pos = (n: HTMLElement, x: number, y: number, w?: number, h?: number) => {
      n.style.left = `${x}px`;
      n.style.top = `${y}px`;
      if (w !== undefined) n.style.width = `${w}px`;
      if (h !== undefined) n.style.height = `${h}px`;
      return n;
    };

    const grid = el('div', 'grid', stage);
    const lab = el('div', 'lab', stage);
    const frameIcon = svg('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, lab);
    svg('path', { d: 'M3 0v10M7 0v10M0 3h10M0 7h10', stroke: '#a39e97', 'stroke-width': 1.2 }, frameIcon);
    el('span', '', lab, C.label);
    const drop = el('div', 'drop', stage);
    const board = el('div', 'board', stage);
    const paint = el('div', 'paint', board);

    // ---- 线框元素：入场时依次浮现 ----
    // gone：成品盖住它之后就把它藏起来（半透明的成品下面不该透出灰块）
    const wires: { node: HTMLElement; gone: number }[] = [];
    const wire = (cls: string, x: number, y: number, w: number, h: number, r = 4, gone = Infinity) => {
      const n = pos(el('div', cls, board), x, y, w, h);
      n.style.borderRadius = `${r}px`;
      wires.push({ node: n, gone });
      return n;
    };
    /** 图片占位：浅灰底加一个对角线叉 */
    const placeholder = (x: number, y: number, w: number, h: number, r: number, gone: number) => {
      const n = wire('ph', x, y, w, h, r, gone);
      const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' }, n);
      svg('path', { d: `M0 0L${w} ${h}M${w} 0L0 ${h}`, stroke: '#dcdce1', 'stroke-width': 1, fill: 'none' }, s);
      return n;
    };

    // ---- 成品元素 ----
    type Line = { bar: HTMLElement; text: HTMLElement; caret: HTMLElement; t0: number; t1: number };
    const lines: Line[] = [];
    /** 一行文字：线框条从左边被“吃掉”，文字从左往右打出来，光标跟在末尾 */
    const typeLine = (s: string, x: number, y: number, size: number, weight: number, color: string, lh: number, t0: number, cps: number, caret = true) => {
      const w = textW(s, size, weight);
      const barH = Math.max(6, Math.round(size * 0.62));
      const bar = wire('bar', x, y + (lh - barH) / 2, w, barH, barH / 2);
      const wrap = pos(el('div', 'tw', board), x, y);
      const text = el('span', '', wrap, s);
      Object.assign(text.style, { fontSize: `${size}px`, fontWeight: String(weight), color, lineHeight: `${lh - 2}px` });
      if (size > 20) text.style.letterSpacing = '-0.02em';
      const c = el('i', '', wrap);
      c.style.display = caret ? '' : 'none';
      const line = { bar, text, caret: c, t0, t1: t0 + Math.max(0.16, [...s].length / cps) };
      lines.push(line);
      return line;
    };

    type Pop = { node: HTMLElement; k: ReturnType<typeof track>; spin: boolean };
    const pops: Pop[] = [];
    const pop = spring({ duration: 0.5, bounce: 0.35 });
    /** 缩放着弹出来；spin 的会顺便转半圈（比如图标） */
    const popIn = (node: HTMLElement, at: number, spin = false) => {
      pops.push({ node, k: track(0, [[at, 1, pop]]), spin });
      return node;
    };

    type Flood = { node: HTMLElement; cx: number; cy: number; R: number; k: ReturnType<typeof track>; inner?: HTMLElement };
    const floods: Flood[] = [];
    const pour = spring({ duration: 0.9, bounce: 0 });
    /** 从点击处泼开的圆形填充 */
    const floodIn = (node: HTMLElement, cx: number, cy: number, w: number, h: number, at: number, inner?: HTMLElement) => {
      const R = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)) + 4;
      floods.push({ node, cx, cy, R, k: track(0, [[at, 1, pour]]), inner });
    };

    const F = ACT.map((a) => a + 0.06); // 每一步开始填充的时刻

    // 0 · 画板底色
    floodIn(paint, 200, 228, BW, BH, F[0]!);

    // 1 · 导航
    const navLine = wire('bar', 0, 44, BW, 1, 0);
    navLine.style.background = '#efece8';
    wire('bar', 22, 15, 14, 14, 5, F[1]! + 0.3);
    popIn(pos(el('div', 'mark', board), 22, 15, 14, 14), F[1]!, true);
    typeLine('Forma', 42, 12, 14, 700, INK, 20, F[1]! + 0.06, 30, false);
    const cW = textW(C.contact, 10.5, 600) + 26;
    const cX = BW - 22 - cW;
    wire('bar', cX, 11, cW, 22, 11, F[1]! + 0.6);
    const contact = popIn(pos(el('div', 'pill', board, C.contact), cX, 11, cW, 22), F[1]! + 0.32);
    Object.assign(contact.style, { background: INK, color: '#fff', fontSize: '10.5px', fontWeight: '600' });
    // 链接从联系按钮左边往左排
    let lx = cX - 6;
    const linkX = [...C.links].reverse().map((s) => (lx -= textW(s, 11, 500) + 20)).reverse();
    linkX.forEach((x, i) => typeLine(C.links[i]!, x, 13, 11, 500, '#5d5a55', 18, F[1]! + 0.12 + i * 0.07, 26, false));

    // 2 · 角标 + 大标题
    const badgeW = textW(C.badge, 10, 600) + 20;
    wire('bar', 26, 58, badgeW, 18, 9, F[2]! + 0.3);
    const badge = popIn(pos(el('div', 'pill', board, C.badge), 26, 58, badgeW, 18), F[2]!);
    Object.assign(badge.style, { background: 'rgba(255,122,80,.13)', color: '#e2552f', fontSize: '10px', fontWeight: '600' });
    const headLines = (options.text ?? C.head).split(/\||\n/).slice(0, 2);
    // 一行打完再打下一行
    let at = F[2]! + 0.14;
    headLines.forEach((s, i) => (at = typeLine(s, 26, 84 + i * 34, 28, 700, INK, 36, at, en ? 28 : 11).t1 + 0.04));
    const headW = Math.max(...headLines.map((s) => textW(s, 28, 700)));

    // 3 · 副标题
    const subW = Math.max(...C.sub.map((s) => textW(s, 11.5, 400)));
    at = F[3]!;
    C.sub.forEach((s, i) => (at = typeLine(s, 26, 162 + i * 17, 11.5, 400, '#6f6b65', 17, at, en ? 70 : 30).t1));

    // 4 · 按钮
    const btnW = textW(C.cta, 12, 600) + 52;
    const btnWire = wire('bar', 26, 208, btnW, 30, 15, F[4]! + 0.3);
    btnWire.style.background = '#e4e3e8';
    const btn = popIn(pos(el('div', 'pill', board), 26, 208, btnW, 30), F[4]!);
    Object.assign(btn.style, { background: INK, color: '#fff', fontSize: '12px', fontWeight: '600', gap: '8px', boxShadow: '0 6px 14px -6px rgba(27,26,25,.6)' });
    el('span', '', btn, C.cta);
    const arrow = el('span', '', btn, '→');
    arrow.style.color = '#ffb08a';

    // 5 · 头图
    const HX = 250;
    const HY = 60;
    const HW = 206;
    const HH = 178;
    placeholder(HX, HY, HW, HH, 14, F[5]! + 0.9);
    const hero = pos(el('div', 'img', board), HX, HY, HW, HH);
    hero.style.borderRadius = '14px';
    const heroArt = art(HW, HH, (g) => {
      room(g, HW, HH, 132, ['#ffdcc4', '#e8d4fb'], ['#f6c4ae', '#eab3b9'], 3);
      const sun = g.createRadialGradient(152, 54, 0, 152, 54, 46);
      sun.addColorStop(0, 'rgba(255,248,236,.95)');
      sun.addColorStop(1, 'rgba(255,248,236,0)');
      g.fillStyle = sun;
      g.fillRect(0, 0, HW, HH);
      arch(g, 22, 48, 66, 92, 16, ['#c6dcc0', '#86ac8b']);
      cylinder(g, 170, 112, 17, 28, ['#fff8ec', '#f1dcc3', '#d2ac88']);
      sphere(g, 116, 114, 30, ['#ffd2b8', '#ff7d5a', '#c9453a']);
    });
    hero.append(heroArt);
    floodIn(hero, 68, 72, HW, HH, F[5]!, heroArt);

    // 6 · 三张卡片
    const CW = (430 - 22) / 3;
    const thumbs: [string, string, (g: G) => void][] = [
      ['#e3e9ff', '#c9d3ff', (g) => arch(g, 10, 9, 20, 24, 6, ['#9fb0ff', '#5b6cf0'])],
      ['#fff1d6', '#ffe0b0', (g) => sphere(g, 19, 21, 10, ['#fff0c2', '#ffb53d', '#e0782a'])],
      ['#ffe3ea', '#ffc9d6', (g) => cylinder(g, 20, 15, 9, 15, ['#ffffff', '#ffd1dc', '#e28ba3'])],
    ];
    const cards = C.cards.map(([title, desc], i) => {
      const x = 26 + i * (CW + 11);
      const y = 252;
      const at = F[6]! + i * 0.13;
      wire('wcard', x, y, CW, 56, 12, at + 0.4);
      placeholder(x + 8, y + 8, 40, 40, 9, at + 0.4);
      wire('bar', x + 58, y + 14, 34, 8, 4, at + 0.4);
      wire('bar', x + 58, y + 32, 52, 6, 3, at + 0.4);
      const card = pos(el('div', 'card', board), x, y, CW, 56);
      const img = el('div', 'img', card);
      const [a, b, draw] = thumbs[i]!;
      img.append(
        art(40, 40, (g) => {
          room(g, 40, 40, 30, [a, b], [b, b], 10 + i);
          draw(g);
        }),
      );
      el('b', '', card, title);
      el('em', '', card, desc);
      floodIn(img, 8, 32, 40, 40, at + 0.08);
      // 展示阶段：三张卡片依次像被悬停一样轻轻抬起
      const hv = LIFT + 1.5 + i * 0.32;
      return { card, k: track(0, [[at, 1, pop]]), hover: track(0, [[hv, 1], [hv + 0.55, 0]], spring({ duration: 0.5, bounce: 0.25 })) };
    });

    const sheen = el('div', 'sheen', board);
    const sheenBar = el('i', '', sheen);

    // ---- 选中框、光标、点击波纹（画在舞台上，坐标 = 画板坐标 + 画板位置） ----
    const BOXES = [
      { x: 0, y: 0, w: BW, h: BH },
      { x: 14, y: 8, w: BW - 28, h: 28 },
      { x: 20, y: 52, w: Math.max(headW, badgeW) + 14, h: 104 },
      { x: 20, y: 158, w: subW + 14, h: 40 },
      { x: 26, y: 208, w: btnW, h: 30 },
      { x: HX, y: HY, w: HW, h: HH },
      { x: 26, y: 252, w: 430, h: 56 },
    ];
    const CLICKS = [
      { x: 200, y: 228 },
      { x: 30, y: 22 },
      { x: 92, y: 104 },
      { x: 110, y: 170 },
      { x: 26 + btnW * 0.55, y: 224 },
      { x: HX + 68, y: HY + 72 },
      { x: 236, y: 284 },
    ];
    const sel = el('div', 'sel', stage);
    [
      [-4.5, -4.5],
      [null, -4.5],
      [-4.5, null],
      [null, null],
    ].forEach(([l, t]) => {
      const h = el('i', '', sel);
      if (l === null) h.style.right = '-4.5px';
      else h.style.left = `${l}px`;
      if (t === null) h.style.bottom = '-4.5px';
      else h.style.top = `${t}px`;
    });
    const size = el('b', '', sel);
    const taps = CLICKS.map(() => el('div', 'tap', stage));
    const cur = svg('svg', { class: 'cur', width: 16, height: 22, viewBox: '0 0 16 22' }, stage);
    svg('path', { d: 'M1.5 1.5v16.2l4.3-4 2.9 6.6 2.7-1.2-2.9-6.4h5.9z', fill: '#111', stroke: '#fff', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, cur);

    // ---- 轨道 ----
    const glide = spring({ duration: 0.55, bounce: 0.06 });
    const snap = spring({ duration: 0.42, bounce: 0.18 });
    const fade = spring({ duration: 0.35, bounce: 0 });
    const curX = track(BX + BW + 50, [...CLICKS.map((c, i) => [ACT[i]! - 0.5, BX + c.x] as const), [6.35, BX + BW + 40]], glide);
    const curY = track(BY + BH + 30, [...CLICKS.map((c, i) => [ACT[i]! - 0.5, BY + c.y] as const), [6.35, BY + BH + 20]], glide);
    const curO = track(0, [[1.05, 1, fade], [6.45, 0, fade]]);
    const selKeys = (k: 'x' | 'y' | 'w' | 'h') => BOXES.slice(1).map((b, i) => [ACT[i + 1]! - 0.22, b[k]] as const);
    const sx = track(BOXES[0]!.x, selKeys('x'), snap);
    const sy = track(BOXES[0]!.y, selKeys('y'), snap);
    const sw = track(BOXES[0]!.w, selKeys('w'), snap);
    const sh = track(BOXES[0]!.h, selKeys('h'), snap);
    const selO = track(0, [[ACT[0]! - 0.25, 1, fade], [6.3, 0, fade]]);
    // 线框入场：画板先出现，元素自上而下错峰浮现
    const boardIn = track(0, [[0.12, 1, spring({ duration: 0.7, bounce: 0.1 })]]);
    const rise = spring({ duration: 0.6, bounce: 0.2 });
    const wireIn = wires.map(({ node }, i) => track(0, [[0.35 + (parseFloat(node.style.top) / BH) * 0.7 + (i % 3) * 0.02, 1, rise]]));
    // 浮起、淡出
    const lift = track(0, [[LIFT, 1, spring({ duration: 1.2, bounce: 0.18 })]]);
    const btnNudge = track(0, [[LIFT + 1.1, 1], [LIFT + 1.45, 0]], spring({ duration: 0.45, bounce: 0.3 }));
    const out = track(0, [[OUT, 1, spring({ duration: 0.8, bounce: 0 })]]);
    const press = (t: number) => {
      let s = 1;
      for (const a of ACT) if (t >= a && t < a + 0.2) s = Math.min(s, 1 - 0.16 * Math.sin(((t - a) / 0.2) * Math.PI));
      return s;
    };

    const render = (t: number) => {
      const L = lift(t);
      const O = clamp(out(t));
      const bin = clamp(boardIn(t));
      // 画板：入场从下方浮上来；完成后抬起、略微后仰，影子变大变淡；最后下沉淡出
      const float = L * Math.sin((t - LIFT) * 1.6) * 1.5;
      const by = (1 - boardIn(t)) * 14 - L * 12 + float + O * 10;
      const bs = 1 + L * 0.035 - O * 0.03;
      board.style.opacity = String(bin * (1 - O));
      board.style.transform = `translateY(${by}px) scale(${bs}) rotateX(${L * 3}deg) rotateY(${L * 2.5 * Math.sin((t - LIFT) * 0.8)}deg)`;
      drop.style.opacity = String(clamp(L) * (1 - O));
      drop.style.transform = `translateY(${by + 6 - L * 4}px) scale(${bs * (0.94 + 0.04 * L)})`;
      grid.style.opacity = String(1 - 0.75 * clamp(L) * (1 - O));
      lab.style.opacity = String(bin * (1 - clamp(L * 1.6)));
      lab.style.transform = `translateY(${(1 - boardIn(t)) * 14}px)`;

      wires.forEach(({ node, gone }, i) => {
        const k = wireIn[i]!(t);
        node.style.opacity = t > gone ? '0' : String(clamp(k * 1.5));
        node.style.transform = `translateY(${(1 - k) * 8}px)`;
      });
      for (const l of lines) {
        const p = clamp((t - l.t0) / (l.t1 - l.t0));
        l.text.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
        l.bar.style.clipPath = `inset(0 0 0 ${p * 100}%)`;
        l.caret.style.left = `${p * 100}%`;
        l.caret.style.opacity = t > l.t0 - 0.05 && t < l.t1 + 0.18 ? '1' : '0';
      }
      for (const p of pops) {
        const k = p.k(t);
        p.node.style.opacity = String(clamp(k * 2));
        p.node.style.transform = `scale(${0.6 + 0.4 * k})${p.spin ? ` rotate(${(1 - clamp(k)) * -90}deg)` : ''}`;
      }
      for (const f of floods) {
        const k = f.k(t);
        f.node.style.visibility = k > 0.001 ? 'visible' : 'hidden';
        f.node.style.clipPath = k > 0.999 ? 'none' : `circle(${k * f.R}px at ${f.cx}px ${f.cy}px)`;
        if (f.inner) f.inner.style.transform = `scale(${mix(1.12, 1, clamp(k))})`;
      }
      // 浮起时内容稍微落后于画板，再追上来（跟随）；展示阶段卡片依次被“悬停”抬起
      const lag = 9 * (L - lift(t - 0.09));
      for (const c of cards) {
        const k = c.k(t);
        const hv = c.hover(t);
        c.card.style.opacity = String(clamp(k * 2));
        c.card.style.transform = `translateY(${(1 - k) * 8 + lag - 4 * hv}px) scale(${(0.94 + 0.06 * k) * (1 + 0.03 * hv)})`;
        c.card.style.zIndex = hv > 0.01 ? '1' : '';
      }
      // 按钮箭头往前探一下
      const nudge = btnNudge(t);
      arrow.style.transform = `translateX(${nudge * 4}px)`;
      btn.style.transform += ` scale(${1 + 0.04 * nudge})`;
      hero.style.transform = `translateY(${lag * 0.6}px)`;
      // 高光扫过
      const sp = clamp((t - LIFT - 0.45) / 0.9);
      sheenBar.style.opacity = sp > 0 && sp < 1 ? '1' : '0';
      sheenBar.style.transform = `translateX(${mix(-140, BW + 60, sp)}px) rotate(18deg)`;

      // 选中框
      const x = sx(t);
      const y = sy(t);
      const w = sw(t);
      const h = sh(t);
      sel.style.opacity = String(clamp(selO(t)));
      sel.style.transform = `translate(${BX + x}px, ${BY + y}px)`;
      sel.style.width = `${w}px`;
      sel.style.height = `${h}px`;
      size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      // 光标和点击波纹
      cur.style.opacity = String(clamp(curO(t)));
      cur.style.transform = `translate(${curX(t) - 2}px, ${curY(t) - 2}px) scale(${press(t)})`;
      taps.forEach((n, i) => {
        const k = (t - ACT[i]!) / 0.5;
        const on = k >= 0 && k < 1;
        n.style.opacity = on ? String((1 - k) * 0.9) : '0';
        n.style.transform = `translate(${BX + CLICKS[i]!.x}px, ${BY + CLICKS[i]!.y}px) scale(${on ? 0.3 + k : 0})`;
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 10 });
  },
};
