// 吊牌：墙上一根木杆，五张纸吊牌用长短不一的绳子挂着，错落地铺满画面。
// 一阵风从左边吹进来，带着几片叶子和风线扫过：风到哪张牌，哪张牌就被推开、在风里抖，风过去后弹簧把它荡回来。
// 每张牌是“两节摆”：绳子先动，牌子慢半拍跟上再甩过头（跟随）；长绳的两张被风拧得翻了面，露出背面的字，
// 中间那张转了一整圈。几秒后一股回头风从右边吹回来，把翻面的牌子拧回正面。墙上的投影跟着摆、跟着翻面变窄。
// 所有冲击都用“周期折回”叠加上一轮的余波，循环无缝。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import type { Spring } from '../spring.ts';
import { createStage, el, svg, injectCSS, seeded, smooth, wrap, TAU, type SceneDef } from './util.ts';

const D = 9;
const RAIL_Y = 54;
const SHADOW = { x: 13, y: 17 }; // 光从左上来，投影落在右下
// 主风：从左往右；回头风：从右往左，弱一些
const GUST = { at: 0.7, speed: 430, power: 1, hold: 0.55 };
const PUFF = { at: 4.9, speed: 400, power: -0.42, hold: 0.4 };
// 每张牌的绳长、尺寸（大 / 小）和被风拧的方式：flip = 翻到背面再被回头风翻回来，spin = 转一整圈
const LAYOUT = [
  { len: 78, big: true, twist: 'sway' },
  { len: 168, big: false, twist: 'flip' },
  { len: 36, big: true, twist: 'spin' },
  { len: 190, big: false, twist: 'flip' },
  { len: 108, big: true, twist: 'sway' },
  { len: 140, big: false, twist: 'sway' },
] as const;
const PAPER = [
  { bg: '#f3eee4', back: '#ebe4d7', ink: '#2a2622' },
  { bg: '#d4b086', back: '#e2c9a6', ink: '#3a2816' },
  { bg: '#2d2c2f', back: '#3b3a3e', ink: '#f2ece2' },
  { bg: '#c2ccb2', back: '#d3dbc6', ink: '#26301f' },
  { bg: '#e6ad90', back: '#eec4ad', ink: '#3b1f14' },
  { bg: '#f3eee4', back: '#ebe4d7', ink: '#2a2622' },
];
// 默认文字：正面 / 背面
const WORDS_ZH = '灵感/随手记下|提示词/说清楚一点|作品/慢慢打磨|视频/逐帧导出|动效/要有分量';
const WORDS_EN = 'Ideas/Jot it down|Prompts/Say it clearly|Works/Polish slowly|Videos/Frame by frame|Motion/Give it weight';

/** 一次冲击：推开、停 hold 秒、松开让弹簧荡回来 */
const impulse = (hold: number, s: Spring) => track(0, [[0, 1, s], [hold, 0, s]]);

/** 纸张纹理：一小块随机噪点，平铺在牌子上 */
function paperNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  const img = g.createImageData(96, 96);
  const rnd = seeded(5);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd();
    const dark = v < 0.5;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = dark ? 60 : 255;
    img.data[i + 3] = Math.round((dark ? 0.5 - v : v - 0.5) * 2 * 26);
  }
  // 几根细纤维
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(90,70,40,0.08)';
  for (let k = 0; k < 14; k++) {
    g.beginPath();
    const x = rnd() * 96;
    const y = rnd() * 96;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + rnd() * 10, y + rnd() * 6, x + 6 + rnd() * 12, y + rnd() * 8 - 4);
    g.stroke();
  }
  return c.toDataURL();
}

/** 条形码：按种子生成粗细不一的竖条，拼成一条硬边渐变 */
function barcode(seed: number, ink: string) {
  const rnd = seeded(seed);
  const stops: string[] = [];
  let x = 0;
  while (x < 58) {
    const bar = 1 + Math.floor(rnd() * 3);
    const gap = 1 + Math.floor(rnd() * 2.4);
    stops.push(`${ink} ${x}px ${x + bar}px`, `transparent ${x + bar}px ${x + bar + gap}px`);
    x += bar + gap;
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export const hangers: SceneDef = {
  title: '风过吊牌',
  category: '插画',
  description: '一阵风从左边吹过一排纸吊牌，牌子依次被推开、在风里抖、带着跟随甩回来；长绳的两张被拧得翻了面，回头风再把它们翻回来。',
  tags: ['spring', 'track', '叠加冲击', '跟随', '周期折回', 'CSS 3D'],
  tone: 'light',
  en: {
    title: 'Tags in the wind',
    description: 'A gust sweeps a row of paper hang tags from the left. Each one is pushed out, trembles in the wind and swings back with follow-through; two on long strings get twisted round to their backs until a return breeze turns them over again.',
    tags: ['spring', 'track', 'stacked impulses', 'follow-through', 'periodic wrap', 'CSS 3D'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    // options.text：用 | 分隔（或者空格分隔）的几张牌，每张可以写成“正面/背面”
    const text = options.text ?? (en ? WORDS_EN : WORDS_ZH);
    const items = text
      .split(text.includes('|') ? '|' : /\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 6)
      .map((w) => {
        const [front = w, back = ''] = w.split('/').map((p) => p.trim());
        return { front, back };
      });
    const n = Math.max(1, items.length);
    const stage = createStage(host, 'light', 'nm-hang');
    injectCSS(
      'nm-hang',
      `.nm-hang{background:
  radial-gradient(80% 70% at 14% -6%,rgba(255,251,242,.95),rgba(255,251,242,0) 62%),
  radial-gradient(60% 50% at 90% 110%,rgba(170,150,120,.18),rgba(170,150,120,0) 70%),
  linear-gradient(180deg,#ece6dc,#e1d8ca)}
.nm-hang .lite{position:absolute;width:150px;height:300px;background:linear-gradient(180deg,rgba(255,248,232,.5),rgba(255,248,232,0));transform:skewX(-28deg);filter:blur(10px)}
.nm-hang .rail-sh{position:absolute;left:30px;right:22px;top:${RAIL_Y + 9}px;height:9px;border-radius:5px;background:rgba(70,50,25,.28);filter:blur(5px)}
.nm-hang .rail{position:absolute;left:22px;right:22px;top:${RAIL_Y - 6}px;height:12px;border-radius:6px;background:linear-gradient(180deg,#e2bd86 0%,#c39158 40%,#8e6232 100%);box-shadow:inset 0 1px 0 rgba(255,240,210,.6)}
.nm-hang .rail::before,.nm-hang .rail::after{content:"";position:absolute;top:-2px;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f2d9a8,#a8763e 60%,#6e4a22)}
.nm-hang .rail::before{left:-6px}
.nm-hang .rail::after{right:-6px}
.nm-hang .bracket{position:absolute;top:${RAIL_Y - 3}px;width:8px;height:26px;border-radius:3px;background:linear-gradient(90deg,#3a3633,#5b5652 50%,#2e2b29);box-shadow:4px 6px 6px rgba(60,40,20,.25)}
.nm-hang .knot{position:absolute;top:${RAIL_Y - 7}px;width:7px;height:14px;margin-left:-3.5px;border-radius:4px;border:1.5px solid #8a7458;border-top-color:#a48d6e}
.nm-hang .hk{position:absolute;top:${RAIL_Y}px;width:0;height:0}
.nm-hang .arm,.nm-hang .jt{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.nm-hang .str{position:absolute;left:-.75px;top:0;width:1.5px;background:linear-gradient(180deg,#8a7458,#a28a6a)}
.nm-hang .jt{perspective:700px}
.nm-hang .card{position:absolute;transform-style:preserve-3d;transform-origin:50% 0;will-change:transform}
.nm-hang .face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  clip-path:polygon(22% 0,78% 0,100% 13%,100% 100%,0 100%,0 13%);border-radius:0 0 7px 7px;overflow:hidden}
.nm-hang .back{transform:rotateY(180deg)}
.nm-hang .tex{position:absolute;inset:0;background-size:96px 96px;mix-blend-mode:multiply;opacity:.9}
.nm-hang .lit{position:absolute;inset:0;background:linear-gradient(150deg,rgba(255,255,255,.22),rgba(255,255,255,0) 45%,rgba(0,0,0,.08));pointer-events:none}
.nm-hang .dim{position:absolute;inset:0;background:#000;opacity:0}
.nm-hang .eye{position:absolute;left:50%;top:6px;width:13px;height:13px;margin-left:-6.5px;border-radius:50%;
  background:radial-gradient(circle,#6b5a45 0 2.6px,#e9cf95 3.2px,#b88b47 4.6px,#7c5a2b 6.5px);box-shadow:0 1px 1px rgba(0,0,0,.25)}
.nm-hang .no{position:absolute;left:11px;top:24px;font:600 8.5px/1 "SF Mono",ui-monospace,Menlo,monospace;letter-spacing:.08em;opacity:.62}
.nm-hang .wd{position:absolute;left:6px;right:6px;top:50%;transform:translateY(-36%);text-align:center;font-weight:700;letter-spacing:-.01em;line-height:1.1}
.nm-hang .rule{position:absolute;left:11px;right:11px;bottom:22px;height:1px;opacity:.28}
.nm-hang .brand{position:absolute;left:11px;bottom:10px;font-size:6.5px;font-weight:600;letter-spacing:.2em;opacity:.55;white-space:nowrap}
.nm-hang .ph{position:absolute;left:9px;right:9px;top:44%;transform:translateY(-50%);text-align:center;font-family:"Songti SC","STSong",Georgia,"Times New Roman",serif;font-style:italic;font-size:15px;line-height:1.3}
.nm-hang .bc{position:absolute;left:50%;bottom:20px;width:58px;height:17px;margin-left:-29px;opacity:.85}
.nm-hang .dg{position:absolute;left:0;right:0;bottom:9px;text-align:center;font:500 7px/1 "SF Mono",ui-monospace,Menlo,monospace;letter-spacing:.18em;opacity:.6}
.nm-hang .sb{position:absolute;filter:blur(4.5px);transform-origin:50% 0;will-change:transform}
.nm-hang .sb i{position:absolute;inset:0;background:rgba(74,52,26,.3);clip-path:polygon(22% 0,78% 0,100% 13%,100% 100%,0 100%,0 13%)}
.nm-hang .sstr{position:absolute;left:-.75px;top:0;width:1.5px;background:rgba(74,52,26,.2);filter:blur(.8px)}
.nm-hang svg{position:absolute;inset:0;width:640px;height:400px;overflow:visible}
.nm-hang .leaf{position:absolute;left:0;top:0;width:20px;height:10px;margin:-5px 0 0 -10px;border-radius:0 100% 0 100%;will-change:transform}
.nm-hang .leaf::after{content:"";position:absolute;left:2px;right:2px;top:50%;height:1px;background:rgba(0,0,0,.18);transform:rotate(-14deg)}
.nm-hang .lsh{background:rgba(74,52,26,.22)!important;filter:blur(2px)}`,
    );

    // 墙上的窗光、木杆和支架
    [
      [300, 120],
      [470, 150],
    ].forEach(([x, y]) => {
      const l = el('div', 'lite', stage);
      l.style.left = `${x}px`;
      l.style.top = `${y}px`;
    });
    el('div', 'rail-sh', stage);
    [44, 588].forEach((x) => (el('div', 'bracket', stage).style.left = `${x}px`));
    el('div', 'rail', stage);

    const noise = paperNoise();
    const shadowLayer = el('div', '', stage);
    const windSvg = svg('svg', { viewBox: '0 0 640 400' }, stage);
    const tagLayer = el('div', '', stage);
    const leafLayer = el('div', '', stage);

    const gap = Math.min(116, 560 / n);
    const scale = Math.min(1, gap / 112);
    const x0 = 320 - (gap * (n - 1)) / 2;
    const tags = items.map((item, i) => {
      const L = LAYOUT[i % LAYOUT.length]!;
      const paper = PAPER[i % PAPER.length]!;
      const x = x0 + gap * i;
      const w = Math.round((L.big ? 104 : 94) * scale);
      const h = Math.round((L.big ? 152 : 136) * scale);
      const len = L.len;
      // 木杆上的绳结
      el('div', 'knot', stage).style.left = `${x}px`;

      // 墙上的投影：和牌子同样的变换，只是整体错开一点、糊一点
      const sh = el('div', 'hk', shadowLayer);
      sh.style.left = `${x + SHADOW.x}px`;
      sh.style.top = `${RAIL_Y + SHADOW.y * 0.5}px`;
      const sArm = el('div', 'arm', sh);
      const sStr = el('div', 'sstr', sArm);
      sStr.style.height = `${len + SHADOW.y * 0.5}px`;
      const sJt = el('div', 'jt', sArm);
      const sBody = el('div', 'sb', sJt);
      Object.assign(sBody.style, { left: `${-w / 2}px`, top: `${-12 + SHADOW.y * 0.5}px`, width: `${w}px`, height: `${h}px` });
      el('i', '', sBody);

      // 牌子：绳子（arm）→ 绳端的关节（jt）→ 可以绕竖轴翻面的卡片（card），正反两面
      const hk = el('div', 'hk', tagLayer);
      hk.style.left = `${x}px`;
      const arm = el('div', 'arm', hk);
      const jt = el('div', 'jt', arm);
      jt.style.perspectiveOrigin = `0px ${h / 2}px`;
      const card = el('div', 'card', jt);
      Object.assign(card.style, { left: `${-w / 2}px`, top: '-12px', width: `${w}px`, height: `${h}px` });
      const faces = [false, true].map((isBack) => {
        const f = el('div', `face${isBack ? ' back' : ''}`, card);
        f.style.background = isBack ? paper.back : paper.bg;
        f.style.color = paper.ink;
        const tex = el('div', 'tex', f);
        tex.style.backgroundImage = `url(${noise})`;
        el('div', 'eye', f);
        el('div', 'no', f, isBack ? `N°0${i + 1} / 0${n}` : `N°0${i + 1}`);
        if (!isBack) {
          const wd = el('div', 'wd', f, item.front);
          // 按字宽估一个字号：中文一个字算 1，拉丁字母算 0.6
          const units = [...item.front].reduce((s, ch) => s + (/[　-鿿]/.test(ch) ? 1 : 0.6), 0);
          wd.style.fontSize = `${clamp((0.74 * w) / Math.max(units, 1), 13, 27)}px`;
          el('div', 'rule', f).style.background = paper.ink;
          el('div', 'brand', f, 'NOAH · MOTION');
        } else {
          const phrase = item.back || item.front;
          const ph = el('div', 'ph', f, phrase);
          // 中文短句一行放下；英文按词换行
          if (!/\s/.test(phrase)) {
            const units = [...phrase].reduce((s, ch) => s + (/[\u3000-\u9fff]/.test(ch) ? 1 : 0.55), 0);
            ph.style.fontSize = `${clamp((w - 22) / Math.max(units, 1), 10, 17)}px`;
            ph.style.whiteSpace = 'nowrap';
          }
          el('div', 'bc', f).style.background = barcode(17 + i * 31, paper.ink);
          el('div', 'dg', f, `6 90${i + 1}2 4${i}7 13`);
        }
        el('div', 'lit', f);
        return { f, dim: el('div', 'dim', f) };
      });
      // 绳子画在牌子上面，看起来像穿过了牌子的孔
      const str = el('div', 'str', arm);
      str.style.height = `${len}px`;

      // 摆动：风到达这张牌的时间由它的位置决定；绳越长、摆得越慢
      const reach = len + h * 0.45;
      const s1 = spring({ duration: 0.95 + reach * 0.0042, bounce: 0.7 });
      const s2 = spring({ duration: (0.95 + reach * 0.0042) * 1.14, bounce: 0.74 });
      const amp = 21 - len * 0.03 + (L.big ? 2 : 0);
      const events = [
        { at: GUST.at + (x + 40) / GUST.speed, p: GUST.power, rope: impulse(GUST.hold, s1), body: impulse(GUST.hold, s2), hold: GUST.hold },
        { at: PUFF.at + (680 - x) / PUFF.speed, p: PUFF.power, rope: impulse(PUFF.hold, s1), body: impulse(PUFF.hold, s2), hold: PUFF.hold },
      ];
      // 拧：flip 先翻到背面（180°），回头风再翻回正面（360°）；spin 一口气转一整圈；其余只被风带着侧过去一点再回来
      // 绳子的扭转像一个阻尼很小的扭摆：翻过去以后还会来回拧好几下
      const turnS = spring({ duration: 1.25 + len * 0.003, bounce: 0.52 });
      const gustAt = events[0]!.at;
      const puffAt = events[1]!.at;
      const twist =
        L.twist === 'flip'
          ? track(0, [[gustAt + 0.12, 180, turnS], [puffAt + 0.08, 360, turnS]])
          : L.twist === 'spin'
            ? track(0, [[gustAt + 0.1, 360, spring({ duration: 1.5, bounce: 0.24 })]])
            : track(0, [[gustAt + 0.1, 34, turnS], [gustAt + 0.1 + GUST.hold, 0, turnS], [puffAt, -18, turnS], [puffAt + PUFF.hold, 0, turnS]]);
      const twistEnd = twist(1e6);
      return { x, w, h, len, amp, events, arm, jt, card, faces, sArm, sJt, sBody, ph: i * 1.7, twist: (t: number) => twist(t) + twist(t + D) - twistEnd };
    });

    // 风线：几条横穿画面的弧线，用虚线的偏移让一小段“风”沿着线跑过去
    const streaks = [
      { y: 118, bend: -16, at: GUST.at - 0.15, dir: 1, o: 0.7 },
      { y: 206, bend: 14, at: GUST.at + 0.02, dir: 1, o: 0.6 },
      { y: 288, bend: -12, at: GUST.at + 0.16, dir: 1, o: 0.55 },
      { y: 352, bend: 8, at: GUST.at + 0.3, dir: 1, o: 0.45 },
      { y: 172, bend: 10, at: PUFF.at - 0.1, dir: -1, o: 0.3 },
      { y: 262, bend: -8, at: PUFF.at + 0.08, dir: -1, o: 0.26 },
    ].map((s) => {
      const d = `M -40 ${s.y} C 160 ${s.y + s.bend} 320 ${s.y - s.bend} 680 ${s.y + s.bend * 0.6}`;
      const node = svg('path', { d, fill: 'none', stroke: '#9a8463', 'stroke-width': 1.6, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '0.22 1.2' }, windSvg);
      return { ...s, node };
    });
    // 被风卷着飞过的叶子（还有它们在墙上的影子）
    const rnd = seeded(23);
    const leaves = ['#c79a52', '#9caa6b', '#d48a5e', '#b7a25e', '#c97a54'].map((color, i) => {
      const shadow = el('div', 'leaf lsh', shadowLayer);
      const node = el('div', 'leaf', leafLayer);
      node.style.background = color;
      const size = 0.8 + rnd() * 0.5;
      node.style.width = shadow.style.width = `${Math.round(22 * size)}px`;
      node.style.height = shadow.style.height = `${Math.round(11 * size)}px`;
      return { node, shadow, at: GUST.at + i * 0.16, y: 92 + i * 62 + rnd() * 24, spin: 1.6 + rnd() * 1.4, speed: 440 + rnd() * 90, ph: rnd() * TAU };
    });

    const render = (t: number) => {
      for (const tg of tags) {
        // 绳子和牌子各自叠加两阵风（含上一轮的余波）
        let rope = 0;
        let body = 0;
        for (const e of tg.events) {
          for (const local of [t - e.at, t + D - e.at]) {
            if (local <= 0) continue;
            rope += e.p * e.rope(local);
            body += e.p * e.body(Math.max(0, local - 0.07));
            // 风还在吹的时候牌子在风里抖
            const env = smooth(0, 0.12, local) * (1 - smooth(e.hold, e.hold + 0.45, local));
            body += e.p * env * 0.12 * Math.sin(TAU * 5.2 * local + tg.ph);
          }
        }
        // 平时也有一点几乎察觉不到的晃动（整数周期，循环无缝）
        const idle = 1.4 * Math.sin((TAU * 3 * t) / D + tg.ph);
        const a1 = -(rope * tg.amp + idle);
        const a2 = -(body * tg.amp * 1.08 + idle * 1.3);
        const ry = tg.twist(t) + 7 * Math.sin((TAU * 2 * t) / D + tg.ph * 1.3);
        const c = Math.cos((ry * Math.PI) / 180);
        tg.arm.style.transform = `rotate(${a1.toFixed(2)}deg)`;
        tg.jt.style.transform = `translateY(${tg.len}px) rotate(${(a2 - a1).toFixed(2)}deg)`;
        tg.card.style.transform = `rotateY(${ry.toFixed(1)}deg)`;
        // 侧过去的时候面变暗；翻面时背面先暗后亮
        const edge = 1 - Math.abs(c);
        tg.faces[0]!.dim.style.opacity = (edge * 0.42).toFixed(3);
        tg.faces[1]!.dim.style.opacity = (edge * 0.42).toFixed(3);
        // 投影：同样摆，宽度随翻面变窄
        tg.sArm.style.transform = `rotate(${a1.toFixed(2)}deg)`;
        tg.sJt.style.transform = `translateY(${tg.len}px) rotate(${(a2 - a1).toFixed(2)}deg)`;
        tg.sBody.style.transform = `scaleX(${Math.max(0.05, Math.abs(c)).toFixed(3)})`;
      }
      for (const s of streaks) {
        const p = (t - s.at) / 1.6;
        const q = wrap(t, s.at, D) / 1.6;
        const k = q < 1 ? q : p;
        const vis = k > 0 && k < 1 ? Math.sin(Math.PI * k) * s.o : 0;
        s.node.style.opacity = vis.toFixed(3);
        s.node.setAttribute('stroke-dashoffset', String(s.dir > 0 ? 0.2 - k * 1.4 : -1.2 + k * 1.4));
      }
      for (const lf of leaves) {
        const local = wrap(t, lf.at, D);
        const x = -30 + local * lf.speed;
        const show = x < 700;
        const y = lf.y + 26 * Math.sin(local * 3.1 + lf.ph) + local * 18;
        const spin = local * lf.spin * TAU;
        const tf = `rotate(${(spin * 57.3 * 0.35).toFixed(1)}deg) scaleX(${Math.cos(spin).toFixed(3)})`;
        lf.node.style.opacity = show ? '1' : '0';
        lf.shadow.style.opacity = show ? '1' : '0';
        lf.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${tf}`;
        lf.shadow.style.transform = `translate(${(x + 18).toFixed(1)}px, ${(y + 22).toFixed(1)}px) ${tf}`;
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.9 });
  },
};
