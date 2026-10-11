// 主图卖点：一瓶琥珀色精华从展台上升起，四个卖点沿引线依次弹出，指向滴管、瓶身、瓶肩和精华；
// 到手价从 329 滚到 199，“限时直降”的印章砸下来，最后手指按下“立即购买”，库存少一件。
// 信息分三层：左上标题、中间商品和卖点、底部价格和按钮。结尾整体淡出，回到只有展台的开头。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { easeInOut, easeOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, type SceneDef } from './util.ts';

const D = 10;
const CX = 320;
const OUT = 9.0; // 开始退场
const ACCENT = '#ff4a2e';
const S = 1.1; // 瓶子的整体缩放（以瓶底中心为原点）
const BASE = 294; // 展台台面
/** 瓶子坐标系里的点 → 舞台坐标 */
const onBottle = (x: number, y: number, dy = 0) => [CX + (x - CX) * S, BASE + (y - BASE) * S + dy] as const;

const TEXT = {
  zh: {
    brand: 'LUMIÈRE · 光研',
    title: '焕亮精华液',
    sub: '30ml · 敏感肌可用',
    tag: '新品首发',
    points: [
      ['精准滴管', '一滴就够 不浪费'],
      ['5% 烟酰胺', '提亮肤色 淡化暗沉'],
      ['避光琥珀瓶', '锁住活性成分'],
      ['3 重玻尿酸', '24 小时持续保湿'],
    ],
    deal: '到手价',
    cur: '¥',
    from: 329,
    to: 199,
    save: '已省 ¥130',
    stamp: ['限时', '直降', '¥130'],
    buy: '立即购买',
    stock: ['仅剩', '件'],
  },
  en: {
    brand: 'LUMIÈRE LAB',
    title: 'Glow Serum',
    sub: '30 ml · Gentle on sensitive skin',
    tag: 'NEW',
    points: [
      ['Precision dropper', 'One drop is enough'],
      ['5% Niacinamide', 'Brightens dull skin'],
      ['Amber UV glass', 'Keeps actives stable'],
      ['Triple hyaluronic', '24-hour hydration'],
    ],
    deal: 'Today',
    cur: '$',
    from: 129,
    to: 89,
    save: 'Save $40',
    stamp: ['TODAY', 'SAVE', '$40'],
    buy: 'Buy now',
    stock: ['Only', 'left'],
  },
};

// 卖点：锚点在商品上，卡片在两侧
const POINTS = [
  { ax: 307, ay: 110, side: -1, edge: 224, cy: 132, at: 1.3 },
  { ax: 298, ay: 236, side: -1, edge: 224, cy: 244, at: 1.85 },
  { ax: 360, ay: 184, side: 1, edge: 416, cy: 152, at: 2.4 },
  { ax: 352, ay: 272, side: 1, edge: 416, cy: 258, at: 2.95 },
];
const ICONS = [
  'M8 2.2c-2.3 3-3.8 5.2-3.8 7.1a3.8 3.8 0 0 0 7.6 0c0-1.9-1.5-4.1-3.8-7.1z', // 水滴
  'M8 5.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1', // 提亮
  'M8 1.8l5.2 1.9v4.1c0 3-2.2 5.1-5.2 6.4-3-1.3-5.2-3.4-5.2-6.4V3.7zM5.7 8l1.6 1.6 3-3.1', // 盾牌
  'M2 5.5c1.5-1.2 2.5-1.2 4 0s2.5 1.2 4 0 2.5-1.2 4 0M2 9c1.5-1.2 2.5-1.2 4 0s2.5 1.2 4 0 2.5-1.2 4 0M2 12.5c1.5-1.2 2.5-1.2 4 0s2.5 1.2 4 0 2.5-1.2 4 0', // 保湿
];

export const selling: SceneDef = {
  title: '主图卖点',
  category: '界面',
  description: '电商主图：精华从展台升起，卖点沿引线依次弹出指向瓶身各处，价格滚动降下来，印章砸下，最后按下“立即购买”。',
  tags: ['spring', 'track', 'velocity', 'stagger', '路径描线'],
  tone: 'light',
  en: {
    title: 'Hero shot',
    description: 'A product hero image: the serum rises from its plinth, selling points pop out along leader lines, the price rolls down, a deal stamp slams on, and Buy now gets tapped.',
    tags: ['spring', 'track', 'velocity', 'stagger', 'line drawing'],
  },
  mount(host, options = {}) {
    const L = TEXT[options.lang ?? 'zh'];
    const stage = createStage(host, 'light', 'nm-sell');
    injectCSS(
      'nm-sell',
      `.nm-sell{background:radial-gradient(70% 80% at 50% 46%,#fffaf4 0%,#f8ece0 55%,#efdccb 100%);color:#2a1d14}
.nm-sell .all{position:absolute;inset:0}
.nm-sell svg{position:absolute;left:0;top:0;width:640px;height:400px;overflow:visible}
.nm-sell .hd{position:absolute;left:34px;top:26px}
.nm-sell .brand{font-size:10.5px;font-weight:700;letter-spacing:.22em;color:#a8876a}
.nm-sell .title{margin-top:5px;font-size:25px;font-weight:800;letter-spacing:-.01em;line-height:1.15;white-space:nowrap}
.nm-sell .sub{margin-top:5px;display:flex;align-items:center;gap:8px;font-size:11.5px;color:#8e7765;white-space:nowrap}
.nm-sell .tag{padding:2px 7px;border-radius:6px;background:${ACCENT};color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.04em}
.nm-sell .hd>*{transform-origin:0 50%}
.nm-sell .card{position:absolute;height:46px;padding:0 14px 0 8px;border-radius:14px;display:flex;align-items:center;gap:9px;white-space:nowrap;
  background:rgba(255,255,255,.92);box-shadow:0 1px 1px rgba(80,40,10,.06),0 10px 24px rgba(120,60,20,.12),inset 0 0 0 1px rgba(255,255,255,.8)}
.nm-sell .card .ic{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#fff1e8,#ffe0d0)}
.nm-sell .card b{display:block;font-size:13.5px;font-weight:750;line-height:17px;color:#2a1d14}
.nm-sell .card small{display:block;font-size:11px;line-height:15px;color:#9a8270}
.nm-sell .price{position:absolute;left:34px;top:318px;transform-origin:0 100%}
.nm-sell .row1{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;color:${ACCENT};white-space:nowrap}
.nm-sell .row1 .lab{padding:2px 7px;border-radius:6px;background:${ACCENT};color:#fff}
.nm-sell .row1 .save{transform-origin:0 50%}
.nm-sell .row2{display:flex;align-items:flex-end;gap:2px;margin-top:4px;color:${ACCENT};font-weight:800}
.nm-sell .row2 .cur{font-size:22px;line-height:30px;margin-right:1px}
.nm-sell .reel{position:relative;width:27px;height:46px;overflow:hidden;font-size:46px;line-height:46px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.nm-sell .reel div{position:absolute;left:0;right:0;top:0;text-align:center}
.nm-sell .reel span{display:block;height:46px}
.nm-sell .old{position:relative;margin:0 0 7px 10px;font-size:14px;font-weight:600;color:#ae9a8a}
.nm-sell .old i{position:absolute;left:-2px;right:-2px;top:50%;height:1.5px;background:#ae9a8a;transform-origin:0 50%}
.nm-sell .stock{position:absolute;right:34px;top:310px;width:140px;display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;color:#9a6a4c;white-space:nowrap}
.nm-sell .stock .tr{flex:1;height:5px;border-radius:3px;background:#f1d9c8;overflow:hidden}
.nm-sell .stock .tr i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#ff9a4a,${ACCENT});transform-origin:0 50%}
.nm-sell .buy{position:absolute;right:34px;top:330px;width:140px;height:48px;border-radius:24px;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:6px;
  background:linear-gradient(135deg,#ff7a3d,#ff3b2f 60%,#ff2d55);color:#fff;font-size:16px;font-weight:800;letter-spacing:.04em;white-space:nowrap;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 10px 24px rgba(255,60,40,.35)}
.nm-sell .buy .shine{position:absolute;top:0;bottom:0;width:46px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent)}
.nm-sell .num{position:relative;display:inline-block;width:15px;height:14px;overflow:hidden;vertical-align:-2px;color:${ACCENT};font-weight:800;text-align:center}
.nm-sell .num b{position:absolute;left:0;right:0;top:0;line-height:14px}
.nm-sell .tap{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(60,30,10,.16);box-shadow:inset 0 0 0 2px rgba(255,255,255,.85),0 4px 12px rgba(0,0,0,.12)}
.nm-sell .rip{position:absolute;left:${640 - 34 - 70}px;top:354px;width:0;height:0}
.nm-sell .rip i{position:absolute;left:-70px;top:-24px;width:140px;height:48px;border-radius:24px;box-shadow:0 0 0 2px rgba(255,74,46,.7)}`,
    );

    // scene 整体会在印章落下时震一下；all 里是商品和信息，结尾淡出；展台一直在
    const scene = el('div', 'all', stage);
    const base = svg('svg', { viewBox: '0 0 640 400' }, scene);
    const all = el('div', 'all', scene);
    const g = svg('svg', { viewBox: '0 0 640 400' }, all);
    const uid = `nmSell${Math.floor(Math.random() * 1e6)}`;
    const defs = svg('defs', {}, base);
    const grad = (id: string, stops: [number, string, number?][], attrs: Record<string, string | number> = { x1: 0, y1: 0, x2: 1, y2: 0 }) => {
      const lg = svg('linearGradient', { id: `${uid}${id}`, ...attrs }, defs);
      for (const [o, c, a] of stops) svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }, lg);
      return `url(#${uid}${id})`;
    };
    const glass = grad('glass', [[0, '#5e2808'], [0.18, '#a9561c'], [0.42, '#e0923f'], [0.6, '#c87128'], [0.85, '#7d3a0e'], [1, '#4f2006']]);
    const top = grad('top', [[0, '#7a3a10', 0.85], [0.4, '#d48a44', 0.7], [1, '#6a2e0a', 0.85]]);
    const gold = grad('gold', [[0, '#8d6224'], [0.3, '#f6dc96'], [0.5, '#d9ad5b'], [0.75, '#fbe7ad'], [1, '#93662a']]);
    const rubber = grad('rub', [[0, '#141416'], [0.35, '#4a4a4f'], [0.55, '#2a2a2e'], [1, '#0c0c0e']]);
    const hi = grad('hi', [[0, '#fff', 0], [0.5, '#fff', 0.75], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const plinthTop = grad('pt', [[0, '#fbf2e9'], [1, '#efdfd0']], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const plinthSide = grad('ps', [[0, '#e8d3c0'], [0.5, '#f6e8db'], [1, '#dcc2ab']]);
    const blur = svg('filter', { id: `${uid}b`, x: -0.5, y: -0.5, width: 2, height: 2 }, defs);
    svg('feGaussianBlur', { stdDeviation: 7 }, blur);
    const blur2 = svg('filter', { id: `${uid}b2`, x: -0.5, y: -0.5, width: 2, height: 2 }, defs);
    svg('feGaussianBlur', { stdDeviation: 2.5 }, blur2);

    // 背后的柔光圆和展台
    svg('circle', { cx: CX, cy: 190, r: 150, fill: '#fff', opacity: 0.55, filter: `url(#${uid}b)` }, base);
    svg('ellipse', { cx: CX, cy: 326, rx: 120, ry: 14, fill: '#8a5a30', opacity: 0.16, filter: `url(#${uid}b)` }, base);
    svg('path', { d: `M${CX - 104} 294v24a104 18 0 0 0 208 0v-24z`, fill: plinthSide }, base);
    svg('ellipse', { cx: CX, cy: 294, rx: 104, ry: 18, fill: plinthTop }, base);
    svg('ellipse', { cx: CX, cy: 294, rx: 104, ry: 18, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 1 }, base);
    // 琥珀色玻璃透过来的暖色焦散 + 瓶底阴影
    const caustic = svg('ellipse', { cx: CX + 26, cy: 298, rx: 62, ry: 9, fill: '#ff9a3c', opacity: 0.35, filter: `url(#${uid}b2)` }, base);
    const shadow = svg('ellipse', { cx: CX, cy: 293, rx: 54, ry: 7, fill: '#5a3010', opacity: 0.35, filter: `url(#${uid}b2)` }, base);

    // 瓶子。台面上的倒影是同一个瓶子上下翻转，只露出台面那一圈
    const clipTop = svg('clipPath', { id: `${uid}plinth` }, defs);
    svg('ellipse', { cx: CX, cy: BASE, rx: 104, ry: 18 }, clipTop);
    const mirror = svg('g', { 'clip-path': `url(#${uid}plinth)`, opacity: 0.2 }, g);
    const bottle = svg('g', { id: `${uid}bottle` }, g);
    svg('use', { href: `#${uid}bottle`, transform: `translate(0 ${BASE * 2}) scale(1 -1)` }, mirror);
    const body = 'M272 186q0-28 28-28h40q28 0 28 28v88q0 20-20 20h-56q-20 0-20-20z';
    svg('path', { d: body, fill: glass }, bottle);
    svg('path', { d: 'M272 186q0-28 28-28h40q28 0 28 28v4h-96z', fill: top }, bottle); // 液面以上
    svg('path', { d: 'M273 190h94', stroke: '#ffd29a', 'stroke-opacity': 0.6, 'stroke-width': 1.2 }, bottle); // 液面
    svg('rect', { x: 316, y: 158, width: 8, height: 120, rx: 4, fill: '#3a1604', opacity: 0.28 }, bottle); // 里面的滴管
    // 标签纸
    svg('rect', { x: 282, y: 212, width: 76, height: 62, rx: 4, fill: '#f8f0e4' }, bottle);
    const txt = (x: number, y: number, s: string, size: number, weight: number, fill: string, ls = 0) =>
      Object.assign(svg('text', { x, y, 'font-size': size, 'font-weight': weight, fill, 'text-anchor': 'middle', 'letter-spacing': ls }, bottle), { textContent: s });
    txt(CX, 232, 'LUMIÈRE', 9, 800, '#3a2414', 1.6);
    svg('path', { d: 'M300 239h40', stroke: '#c9a46a', 'stroke-width': 0.8 }, bottle);
    txt(CX, 252, 'NIACINAMIDE', 6.4, 700, '#6d5040', 0.6);
    txt(CX, 264, '5% · 30 ml', 7.5, 600, '#9a7a5a', 0.3);
    // 高光：左边一条长的，右边一条细的，瓶肩一小块
    svg('rect', { x: 279, y: 172, width: 6, height: 112, rx: 3, fill: hi, opacity: 0.75 }, bottle);
    svg('rect', { x: 356, y: 180, width: 2.5, height: 96, rx: 1.2, fill: hi, opacity: 0.55 }, bottle);
    svg('path', { d: 'M286 170q4-8 14-9', stroke: '#fff', 'stroke-opacity': 0.65, 'stroke-width': 2.5, 'stroke-linecap': 'round', fill: 'none' }, bottle);
    // 金色瓶口，带细纹
    svg('rect', { x: 299, y: 132, width: 42, height: 28, rx: 4, fill: gold }, bottle);
    for (let i = 0; i < 7; i++) svg('rect', { x: 303 + i * 5.4, y: 134, width: 1, height: 24, fill: '#6b4a18', opacity: 0.18 }, bottle);
    svg('rect', { x: 299, y: 132, width: 42, height: 3, rx: 1.5, fill: '#fff6d6', opacity: 0.7 }, bottle);
    // 黑色橡胶滴头
    svg('path', { d: 'M305 134v-24q0-22 15-22t15 22v24z', fill: rubber }, bottle);
    svg('path', { d: 'M311 108q1-13 8-15', stroke: '#fff', 'stroke-opacity': 0.35, 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' }, bottle);
    // 掠过瓶身的一道光
    const glintClip = svg('clipPath', { id: `${uid}clip` }, defs);
    svg('path', { d: body }, glintClip);
    const glintBox = svg('g', { 'clip-path': `url(#${uid}clip)` }, bottle);
    const glint = svg('path', { d: 'M0 150h24l-40 150h-24z', fill: '#fff', opacity: 0 }, glintBox);

    // 卖点的引线和锚点
    const pts = POINTS.map((p, i) => {
      const line = svg('path', { fill: 'none', stroke: ACCENT, 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, g);
      const pulse = svg('circle', { r: 5, fill: 'none', stroke: ACCENT, 'stroke-width': 1.5 }, g);
      const dot = svg('circle', { r: 4, fill: '#fff', stroke: ACCENT, 'stroke-width': 2.2 }, g);
      const card = el('div', 'card', all);
      card.style.top = `${p.cy - 23}px`;
      if (p.side < 0) card.style.right = `${640 - p.edge}px`;
      else card.style.left = `${p.edge}px`;
      card.style.transformOrigin = p.side < 0 ? '100% 50%' : '0 50%';
      const ic = el('div', 'ic', card);
      const is = svg('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: ACCENT, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ic);
      svg('path', { d: ICONS[i]! }, is);
      is.style.position = 'static';
      is.style.width = '16px';
      is.style.height = '16px';
      const words = el('div', '', card);
      el('b', '', words, L.points[i]![0]);
      el('small', '', words, L.points[i]![1]);
      return { p, line, pulse, dot, card };
    });

    // 左上：品牌、标题、标签
    const hd = el('div', 'hd', all);
    const brand = el('div', 'brand', hd, L.brand);
    const title = el('div', 'title', hd, options.text ?? L.title);
    const sub = el('div', 'sub', hd);
    el('span', 'tag', sub, L.tag);
    el('span', '', sub, L.sub);
    const heads = [brand, title, sub];

    // 右上：印章
    const stamp = svg('g', {}, g);
    const STX = 566;
    const STY = 74;
    const sg = svg('g', { opacity: 0.94 }, stamp);
    svg('circle', { r: 46, fill: 'rgba(255,74,46,.08)', stroke: '#e5321c', 'stroke-width': 3 }, sg);
    svg('circle', { r: 39.5, fill: 'none', stroke: '#e5321c', 'stroke-width': 1, 'stroke-dasharray': '2.5 2.5' }, sg);
    const stx = (y: number, s: string, size: number, ls: number) =>
      Object.assign(svg('text', { x: 0, y, 'font-size': size, 'font-weight': 900, fill: '#e5321c', 'text-anchor': 'middle', 'letter-spacing': ls }, sg), { textContent: s });
    stx(-14, L.stamp[0]!, 11, 2);
    stx(5, L.stamp[1]!, 17, 2);
    stx(28, L.stamp[2]!, 21, 0);
    svg('path', { d: 'M-30 -8h-6M30 -8h6', stroke: '#e5321c', 'stroke-width': 1.4 }, sg);
    const dust = svg('circle', { cx: STX, cy: STY, r: 46, fill: 'none', stroke: '#e5321c', 'stroke-width': 2 }, g);
    // 印章落地溅出的几滴印泥
    const ink = Array.from({ length: 7 }, (_, i) => {
      const a = -2.6 + i * 0.62 + (i % 2) * 0.2;
      return { node: svg('circle', { r: 1.6 + (i % 3) * 0.7, fill: '#e5321c' }, g), a, d: 58 + (i % 3) * 9 };
    });

    // 底部：价格
    const price = el('div', 'price', all);
    const row1 = el('div', 'row1', price);
    el('span', 'lab', row1, L.deal);
    const save = el('span', 'save', row1, L.save);
    const row2 = el('div', 'row2', price);
    el('span', 'cur', row2, L.cur);
    const fromDigits = String(L.from).split('').map(Number);
    const toDigits = String(L.to).padStart(fromDigits.length, ' ').split('');
    const roll = spring({ duration: 0.9, bounce: 0.18 });
    const reels = fromDigits.map((d, i) => {
      const reel = el('div', 'reel', row2);
      const strip = el('div', '', reel);
      for (let k = 0; k < 30; k++) el('span', '', strip, String(k % 10));
      const target = toDigits[i]!.trim() === '' ? null : Number(toDigits[i]);
      // 往下滚：每一位至少转过一整圈，高位先停
      const end = target === null ? d : 10 + target + (target <= d ? 10 : 0);
      const pos = track(d, [[4.05 + i * 0.16, end, roll]]);
      const show = track(1, target === null ? [[4.05, 0, spring({ duration: 0.4 })]] : []);
      return { reel, strip, pos, show };
    });
    const old = el('span', 'old', row2, `${L.cur}${L.from}`);
    const strike = el('i', '', old);

    // 底部：库存和按钮
    const stock = el('div', 'stock', all);
    // 库存数：23 往上滑走，22 从下面滑上来
    const stockText = el('span', '', stock);
    stockText.append(`${L.stock[0]} `);
    const num = el('span', 'num', stockText);
    const n23 = el('b', '', num, '23');
    const n22 = el('b', '', num, '22');
    stockText.append(` ${L.stock[1]}`);
    const stockBar = el('i', '', el('div', 'tr', stock));
    const buy = el('div', 'buy', all);
    el('span', '', buy, L.buy);
    const arrow = svg('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, buy);
    Object.assign(arrow.style, { position: 'static', width: '14px', height: '14px' });
    svg('path', { d: 'M3 7h8M7.5 3.5 11 7l-3.5 3.5' }, arrow);
    const shine = el('i', 'shine', buy);
    const rip = el('div', 'rip', all);
    const ripRing = el('i', '', rip);
    const tap = el('i', 'tap', all);

    // ---------- 剧本 ----------
    const rise = spring({ duration: 0.8, bounce: 0.28 });
    const pop = spring({ duration: 0.5, bounce: 0.32 });
    const soft = spring({ duration: 0.45, bounce: 0 });
    const draw = spring({ duration: 0.5, bounce: 0 });
    const quick = spring({ duration: 0.16, bounce: 0 });
    const bottleIn = track(0, [[0.15, 1, rise]]);
    const headIn = heads.map((_, i) => track(0, [[0.55 + i * 0.09, 1, pop]]));
    const lineIn = POINTS.map((p) => track(0, [[p.at + 0.12, 1, draw]]));
    const dotIn = POINTS.map((p) => track(0, [[p.at, 1, pop]]));
    const cardIn = POINTS.map((p) => track(0, [[p.at + 0.38, 1, pop]]));
    const priceIn = track(0, [[3.55, 1, pop]]);
    const strikeIn = track(0, [[3.85, 1, draw]]);
    const saveIn = track(0, [[4.85, 1, pop]]);
    const SLAM = 5.35;
    const stampS = track(2.6, [[SLAM, 1, spring({ duration: 0.32, bounce: 0.22 })]]);
    const stampR = track(-34, [[SLAM, -14, spring({ duration: 0.4, bounce: 0.2 })]]);
    const TAP = 7.0;
    const tapX = track(590, [[6.35, 536, spring({ duration: 0.7, bounce: 0.05 })], [TAP + 0.45, 600, spring({ duration: 0.9 })]]);
    const tapY = track(430, [[6.35, 356, spring({ duration: 0.7, bounce: 0.05 })], [TAP + 0.45, 420, spring({ duration: 0.9 })]]);
    const tapO = track(0, [[6.35, 1, soft], [TAP + 0.45, 0, soft]]);
    const press = track(1, [[TAP, 0.94, quick], [TAP + 0.13, 1, spring({ duration: 0.45, bounce: 0.45 })]]);
    const stockIn = track(0, [[5.9, 1, pop]]);
    const countDown = track(0, [[TAP + 0.12, 1, spring({ duration: 0.45, bounce: 0.3 })]]);
    const stockFill = track(0.82, [[TAP + 0.1, 0.86, spring({ duration: 0.6, bounce: 0.2 })]]);
    const fadeOut = spring({ duration: 0.55, bounce: 0 });
    const out = track(0, [[OUT, 1, fadeOut]]);
    // 卖点按相反的顺序收回
    const retract = POINTS.map((_, i) => track(0, [[OUT - 0.25 + (3 - i) * 0.06, 1, fadeOut]]));

    const render = (t: number) => {
      const o = clamp(out(t));
      all.style.opacity = String(1 - o);
      // 印章砸下来时整张图震一下
      const hit = t - SLAM - 0.08;
      const shake = hit > 0 && hit < 0.4 ? Math.sin(hit * 70) * 3.2 * (1 - hit / 0.4) : 0;
      scene.style.transform = `translate(${shake * 0.4}px, ${shake}px)`;
      all.style.transform = `translateY(${o * 8}px)`;

      // 商品升起，之后轻轻浮动
      const b = bottleIn(t);
      const float = Math.sin(((t - 1.2) / 4) * Math.PI * 2) * 2.2 * clamp((t - 1.2) / 1.2) * clamp(OUT - t);
      bottle.setAttribute('transform', `translate(0 ${(1 - b) * 46 + float}) translate(${CX} ${BASE}) scale(${S * (0.9 + 0.1 * b)}) translate(${-CX} ${-BASE})`);
      bottle.setAttribute('opacity', String(clamp(b * 2.5)));
      const lift = clamp(b) * (1 - float / 20) * (1 - o);
      shadow.setAttribute('opacity', String(0.35 * lift));
      shadow.setAttribute('rx', String(58 - float * 1.5));
      caustic.setAttribute('opacity', String(0.35 * lift));
      // 一道光扫过瓶身
      const gl = clamp((t - 7.5) / 0.9);
      glint.setAttribute('transform', `translate(${mix(262, 410, easeInOut(gl))} 0)`);
      glint.setAttribute('opacity', String(gl > 0 && gl < 1 ? Math.sin(gl * Math.PI) * 0.45 : 0));

      heads.forEach((h, i) => {
        const k = headIn[i]!(t);
        h.style.opacity = String(clamp(k));
        h.style.transform = `translateX(${(1 - k) * -16}px)`;
      });

      pts.forEach(({ p, line, pulse, dot, card }, i) => {
        // 锚点跟着瓶子一起浮动
        const [ax, ay] = onBottle(p.ax, p.ay, float);
        line.setAttribute('d', `M${ax} ${ay}L${p.edge - p.side * 22} ${p.cy}L${p.edge} ${p.cy}`);
        for (const c of [dot, pulse]) {
          c.setAttribute('cx', String(ax));
          c.setAttribute('cy', String(ay));
        }
        const r = clamp(retract[i]!(t));
        const li = clamp(lineIn[i]!(t)) * (1 - r);
        line.setAttribute('stroke-dashoffset', String(1 - li));
        line.setAttribute('opacity', String(li > 0.001 ? 1 : 0));
        const di = dotIn[i]!(t) * (1 - r);
        dot.setAttribute('r', String(Math.max(0, 4 * di)));
        dot.setAttribute('opacity', String(clamp(di * 3)));
        const pk = clamp((t - p.at) / 0.9);
        pulse.setAttribute('r', String(5 + 14 * easeOut(pk)));
        pulse.setAttribute('opacity', String(pk > 0 && pk < 1 ? (1 - pk) * 0.8 : 0));
        const c = cardIn[i]!(t) * (1 - r);
        card.style.opacity = String(clamp(c * 1.6));
        card.style.transform = `translateX(${(1 - c) * 18 * p.side}px) scale(${0.6 + 0.4 * c})`;
      });

      // 价格：先出现原价，再划掉，数字往下滚到到手价
      const pi = priceIn(t);
      price.style.opacity = String(clamp(pi));
      price.style.transform = `translateY(${(1 - pi) * 14}px) scale(${0.9 + 0.1 * pi})`;
      strike.style.transform = `scaleX(${clamp(strikeIn(t))})`;
      const si = saveIn(t);
      save.style.opacity = String(clamp(si));
      save.style.transform = `scale(${0.5 + 0.5 * si})`;
      for (const r of reels) {
        const v = r.pos(t);
        r.strip.style.transform = `translateY(${-(v % 30) * 46}px)`;
        const sp = Math.abs(r.pos.velocity(t));
        r.strip.style.filter = sp > 3 ? `blur(${Math.min(2.5, (sp - 3) * 0.12)}px)` : 'none';
        const sh = clamp(r.show(t));
        r.reel.style.opacity = String(sh);
        r.reel.style.width = `${27 * sh}px`;
      }

      // 印章：从很大、很斜的位置砸下来，落地时一圈墨晕散开
      const s = stampS(t);
      const shown = t > SLAM;
      stamp.setAttribute('transform', `translate(${STX} ${STY}) rotate(${stampR(t)}) scale(${s})`);
      stamp.setAttribute('opacity', shown ? String(clamp((t - SLAM) / 0.08)) : '0');
      const dk = clamp((t - SLAM - 0.08) / 0.6);
      dust.setAttribute('r', String(46 + 22 * easeOut(dk)));
      dust.setAttribute('opacity', String(dk > 0 && dk < 1 ? (1 - dk) * 0.45 : 0));
      dust.setAttribute('stroke-width', String(2 + 6 * (1 - dk)));
      for (const d of ink) {
        const r = d.d * (0.82 + 0.3 * easeOut(dk));
        d.node.setAttribute('cx', String(STX + Math.cos(d.a) * r));
        d.node.setAttribute('cy', String(STY + Math.sin(d.a) * r));
        d.node.setAttribute('opacity', String(dk > 0 && dk < 1 ? (1 - dk) ** 1.5 * 0.85 : 0));
      }

      // 库存和按钮
      const sk = stockIn(t);
      stock.style.opacity = String(clamp(sk));
      stock.style.transform = `translateY(${(1 - sk) * 6}px)`;
      const nk = countDown(t);
      n23.style.transform = `translateY(${-14 * nk}px)`;
      n22.style.transform = `translateY(${14 * (1 - nk)}px)`;
      stockBar.style.transform = `scaleX(${stockFill(t)})`;
      const bi = priceIn(t);
      buy.style.opacity = String(clamp(bi));
      buy.style.transform = `translateY(${(1 - bi) * 14}px) scale(${(0.9 + 0.1 * bi) * press(t)})`;
      buy.style.filter = press(t) < 0.985 ? 'brightness(.9)' : 'none';
      const sh = clamp((t - 6.0) / 0.7);
      shine.style.transform = `translateX(${mix(-60, 160, easeInOut(sh))}px) skewX(-16deg)`;
      shine.style.opacity = sh > 0 && sh < 1 ? '1' : '0';
      const rk = clamp((t - TAP) / 0.6);
      ripRing.style.opacity = String(rk > 0 && rk < 1 ? (1 - rk) * 0.9 : 0);
      ripRing.style.transform = `scale(${1 + 0.18 * easeOut(rk)}, ${1 + 0.5 * easeOut(rk)})`;
      tap.style.opacity = String(clamp(tapO(t)));
      tap.style.transform = `translate(${tapX(t)}px, ${tapY(t)}px) scale(${press(t) < 0.985 ? 0.78 : 1})`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 8.6 });
  },
};
