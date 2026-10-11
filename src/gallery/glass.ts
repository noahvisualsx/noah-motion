// 毛玻璃卡片：天气、电台、日程、亮度四张磨砂玻璃小组件，浮在缓缓流动的彩色光球上。
// 它们从一摞散开成整齐的网格，左右换位，收回成一摞，再错开成扇形，最后回到一摞，首尾相接。
// 玻璃 = backdrop-filter 模糊 + 细噪点 + 一圈朝向暖色光球的边缘高光（随卡片位置转动）；移动时按速度微微倾斜。
import { spring } from '../spring.ts';
import { track, clamp, remap, type Track } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, svg, injectCSS, seeded, wrap, TAU, type SceneDef } from './util.ts';

const D = 12;
type Id = 'music' | 'weather' | 'slider' | 'cal';
type Pose = { x: number; y: number; r: number; s: number };
type Layout = Record<Id, Pose>;

const SIZE: Record<Id, readonly [number, number]> = { music: [270, 94], weather: [184, 184], slider: [72, 184], cal: [196, 292] };
// DOM 顺序：排在后面的叠在上面。整段动画层级不变，网格里互不重叠，换位时日程从其他卡片下面滑过
const ORDER: Id[] = ['cal', 'slider', 'weather', 'music'];

/** 用左上角坐标写网格位置，换算成卡片中心 */
const box = (id: Id, x: number, y: number): Pose => ({ x: x + SIZE[id][0] / 2, y: y + SIZE[id][1] / 2, r: 0, s: 1 });
// 网格（间距 14，整体 480×292 居中）
const GRID_A: Layout = { weather: box('weather', 80, 54), slider: box('slider', 278, 54), cal: box('cal', 364, 54), music: box('music', 80, 252) };
// 换位：日程挪到左边，其余三张让到右边
const GRID_B: Layout = { cal: box('cal', 80, 54), weather: box('weather', 290, 54), slider: box('slider', 488, 54), music: box('music', 290, 252) };
// 一摞：互相压着、各歪一点
const PILE: Layout = {
  cal: { x: 380, y: 186, r: 7, s: 0.84 },
  slider: { x: 458, y: 214, r: 12, s: 0.86 },
  weather: { x: 288, y: 162, r: -6, s: 0.92 },
  music: { x: 306, y: 270, r: 2, s: 1 },
};
// 扇形：错开、露出彼此
const FAN: Layout = {
  cal: { x: 446, y: 182, r: 11, s: 0.84 },
  slider: { x: 540, y: 236, r: 18, s: 0.84 },
  weather: { x: 214, y: 160, r: -12, s: 0.9 },
  music: { x: 334, y: 296, r: -3, s: 0.98 },
};
const STEPS: { at: number; pose: Layout; delay: Record<Id, number> }[] = [
  { at: 0.7, pose: GRID_A, delay: { music: 0, weather: 0.06, slider: 0.12, cal: 0.18 } },
  { at: 4.0, pose: GRID_B, delay: { cal: 0, weather: 0.12, slider: 0.17, music: 0.22 } },
  { at: 7.0, pose: PILE, delay: { slider: 0, cal: 0.05, weather: 0.1, music: 0.15 } },
  { at: 8.5, pose: FAN, delay: { music: 0, weather: 0.05, cal: 0.1, slider: 0.15 } },
  { at: 9.9, pose: PILE, delay: { slider: 0, cal: 0.05, weather: 0.1, music: 0.15 } },
];

// 背景光球：频率都是整数，一轮正好走完整圈。soft 的是大片氛围光，其余边缘较清楚，透过玻璃才看得出模糊
const ORBS = [
  { c0: '#3b2aa8', c1: '#3b2aa8', r: 260, cx: 150, cy: 120, ax: 60, ay: 40, fx: 1, fy: 1, p: 0, soft: true },
  { c0: '#0e4f8a', c1: '#0e4f8a', r: 240, cx: 520, cy: 320, ax: 70, ay: 40, fx: 1, fy: 2, p: 2, soft: true },
  { c0: '#ffd2a1', c1: '#ff6a4d', r: 74, cx: 320, cy: 196, ax: 220, ay: 110, fx: 1, fy: 2, p: 0.4, soft: false }, // 暖光，也是边缘高光的光源
  { c0: '#ff9ccf', c1: '#e8337f', r: 92, cx: 470, cy: 110, ax: 120, ay: 60, fx: 2, fy: 1, p: 1.7, soft: false },
  { c0: '#a99bff', c1: '#6a3df0', r: 104, cx: 180, cy: 300, ax: 110, ay: 50, fx: 1, fy: 1, p: 3.1, soft: false },
  { c0: '#9ff3ff', c1: '#1aa6e8', r: 66, cx: 560, cy: 250, ax: 60, ay: 110, fx: 1, fy: 1, p: 4.6, soft: false },
];
const KEY = ORBS[2]!;

const orbAt = (o: (typeof ORBS)[number], t: number) => {
  const ph = (t / D) * TAU;
  return {
    x: o.cx + o.ax * Math.sin(ph * o.fx + o.p),
    y: o.cy + o.ay * Math.cos(ph * o.fy + o.p * 0.7),
    r: o.r * (1 + 0.06 * Math.sin(ph * 2 + o.p)),
  };
};

let grainURL = '';
/** 细噪点：黑白随机像素、很低的不透明度，平铺在玻璃上 */
function grain() {
  if (grainURL) return grainURL;
  const c = document.createElement('canvas');
  c.width = c.height = 120;
  const x = c.getContext('2d')!;
  const img = x.createImageData(120, 120);
  const rnd = seeded(23);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(rnd() * 26);
  }
  x.putImageData(img, 0, 0);
  grainURL = c.toDataURL();
  return grainURL;
}

export const glass: SceneDef = {
  title: '毛玻璃卡片',
  category: '界面',
  description: '天气、电台、日程、亮度四张磨砂玻璃组件浮在流动的光球上，散开、换位、叠起、错开；边缘高光随位置转向光源。',
  tags: ['track × 18', 'spring', 'velocity', 'backdrop-filter'],
  tone: 'dark',
  en: {
    title: 'Frosted glass',
    description: 'Four frosted widgets — weather, radio, calendar and brightness — float over drifting orbs of light, spreading, swapping, stacking and fanning out while their rims catch the light.',
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'dark', 'nm-glass');
    injectCSS(
      'nm-glass',
      `.nm-glass{background:#0a0a14}
.nm-glass .dots{position:absolute;inset:0;background:radial-gradient(rgba(255,255,255,.16) .8px,transparent 1.3px) 0 0/14px 14px;
  -webkit-mask:radial-gradient(80% 90% at 50% 45%,#000 30%,transparent 100%);mask:radial-gradient(80% 90% at 50% 45%,#000 30%,transparent 100%)}
.nm-glass .card{position:absolute;left:0;top:0;border-radius:24px;overflow:hidden;color:#fff;will-change:transform;
  background:linear-gradient(155deg,rgba(255,255,255,.18),rgba(255,255,255,.05) 48%,rgba(255,255,255,.09));
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);
  box-shadow:0 26px 50px -20px rgba(6,4,30,.65),0 3px 10px rgba(6,4,30,.22),inset 0 0 0 .5px rgba(255,255,255,.14)}
.nm-glass .slider.card{border-radius:26px}
.nm-glass .grain{position:absolute;inset:0;background-size:120px 120px;opacity:.9}
.nm-glass .sheen{position:absolute;left:50%;top:50%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.26),rgba(255,255,255,.07) 55%,rgba(255,255,255,0))}
.nm-glass .streak{position:absolute;top:-60%;left:50%;width:46px;height:220%;margin-left:-23px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.09),rgba(255,255,255,0))}
.nm-glass .rim{position:absolute;inset:0;border-radius:inherit;padding:1.3px;overflow:hidden;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.nm-glass .rim i{position:absolute;left:50%;top:50%;border-radius:50%;
  background:conic-gradient(rgba(255,255,255,.95),rgba(255,214,236,.4) 40deg,rgba(255,255,255,.05) 92deg,rgba(255,255,255,.04) 150deg,rgba(160,228,255,.42) 180deg,rgba(255,255,255,.04) 212deg,rgba(255,255,255,.05) 268deg,rgba(255,226,200,.42) 320deg,rgba(255,255,255,.95))}
.nm-glass .ct{position:absolute;inset:0}
.nm-glass .sub{color:rgba(255,255,255,.66)}
.nm-glass .wx .loc{position:absolute;left:16px;top:14px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:4px}
.nm-glass .wx .deg{position:absolute;left:13px;top:28px;font-size:50px;font-weight:300;letter-spacing:-.04em;line-height:1.1}
.nm-glass .wx .ic{position:absolute;right:12px;top:12px}
.nm-glass .wx .cond{position:absolute;left:16px;top:88px;font-size:12px;font-weight:600}
.nm-glass .wx .hl{position:absolute;left:16px;top:104px;font-size:11px}
.nm-glass .wx .hours{position:absolute;left:12px;right:12px;top:126px;padding-top:7px;border-top:.5px solid rgba(255,255,255,.22);display:flex;justify-content:space-between}
.nm-glass .wx .h{width:30px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;font-variant-numeric:tabular-nums}
.nm-glass .wx .h span:first-child{color:rgba(255,255,255,.66)}
.nm-glass .mu .art{position:absolute;left:16px;top:16px;width:62px;height:62px;border-radius:13px;overflow:hidden;
  background:radial-gradient(70% 70% at 28% 24%,rgba(255,236,214,.95),rgba(255,236,214,0) 60%),conic-gradient(from 210deg at 60% 62%,#ff5f8f,#7a5cff,#2fb8ff,#ffb35c,#ff5f8f);box-shadow:0 6px 14px rgba(20,0,40,.35)}
.nm-glass .mu .art::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.35)}
.nm-glass .mu .t1{position:absolute;left:92px;top:17px;max-width:110px;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nm-glass .mu .t2{position:absolute;left:92px;top:37px;font-size:11px;white-space:nowrap}
.nm-glass .mu .live{position:absolute;right:14px;top:16px;display:flex;align-items:center;gap:4px;padding:2px 7px 2px 6px;border-radius:9px;background:rgba(255,77,94,.22);font-size:9px;font-weight:700;letter-spacing:.08em;color:#ffd0d5}
.nm-glass .mu .live i{width:5px;height:5px;border-radius:50%;background:#ff4d5e}
.nm-glass .mu .bars{position:absolute;left:92px;top:58px;height:22px;display:flex;gap:2.5px;align-items:center}
.nm-glass .mu .bars i{width:3px;height:22px;border-radius:2px;background:linear-gradient(#fff,rgba(255,255,255,.55));transform-origin:50% 50%}
.nm-glass .mu svg{position:absolute;right:14px;top:58px}
.nm-glass .cal .day{position:absolute;left:16px;top:14px;font-size:10.5px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.78)}
.nm-glass .cal .day::before{content:"";display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:#ff5b61;vertical-align:1px;box-shadow:0 0 6px rgba(255,91,97,.8)}
.nm-glass .cal .num{position:absolute;left:15px;top:27px;font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.1}
.nm-glass .cal .cnt{position:absolute;right:16px;top:44px;font-size:11px}
.nm-glass .cal .hr{position:absolute;left:46px;right:14px;height:0;border-top:.5px solid rgba(255,255,255,.16)}
.nm-glass .cal .hr span{position:absolute;left:-30px;top:-7px;font-size:9.5px;color:rgba(255,255,255,.55);font-variant-numeric:tabular-nums}
.nm-glass .cal .ev{position:absolute;left:52px;right:14px;border-radius:7px;padding:4px 7px 0 9px;overflow:hidden;font-size:10.5px;font-weight:600;line-height:1.25}
.nm-glass .cal .ev::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c)}
.nm-glass .cal .ev small{display:block;font-size:9.5px;font-weight:500;color:rgba(255,255,255,.7)}
.nm-glass .cal .now{position:absolute;left:48px;right:14px;height:1.5px;background:#ff5b61;border-radius:1px}
.nm-glass .cal .now i{position:absolute;left:-4px;top:-3.25px;width:8px;height:8px;border-radius:50%;background:#ff5b61}
.nm-glass .cal .now b{position:absolute;left:-4px;top:-3.25px;width:8px;height:8px;border-radius:50%;background:#ff5b61}
.nm-glass .sl .pct{position:absolute;left:0;right:0;top:14px;text-align:center;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
.nm-glass .sl .fill{position:absolute;left:0;right:0;bottom:0;height:184px;transform-origin:50% 100%;background:linear-gradient(rgba(255,255,255,.95),rgba(255,255,255,.82))}
.nm-glass .sl svg{position:absolute;left:24px;bottom:16px}`,
    );

    // 背景画在 canvas 上，玻璃卡片是它的兄弟元素。注意卡片的祖先不能有 opacity / filter / mask，
    // 否则祖先会成为 backdrop root，backdrop-filter 就采不到 canvas，导出视频时也一样。
    // backdrop-filter 只用 blur：在无头 Chrome（导出视频用的就是它）里叠加 saturate() 会只作用在一块块图块上，出现明显接缝
    const { ctx } = createCanvas(stage, 1);
    const base = ctx.createLinearGradient(0, 0, 640, 400);
    base.addColorStop(0, '#0c0b1d');
    base.addColorStop(1, '#120a1c');
    el('div', 'dots', stage);
    const noise = grain();

    // ---------- 卡片外壳：噪点、光斑、反光条、内容、边缘高光 ----------
    const shells = {} as Record<Id, { node: HTMLElement; sheen: HTMLElement; streak: HTMLElement; rimI: HTMLElement; ct: HTMLElement }>;
    for (const id of ORDER) {
      const [w, h] = SIZE[id];
      const node = el('div', `card ${id}`, stage);
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
      el('div', 'grain', node).style.backgroundImage = `url(${noise})`;
      const sheen = el('div', 'sheen', node);
      const sd = Math.max(w, h) * 1.5;
      Object.assign(sheen.style, { width: `${sd}px`, height: `${sd}px`, marginLeft: `${-sd / 2}px`, marginTop: `${-sd / 2}px` });
      const streak = el('div', 'streak', node);
      const ct = el('div', `ct ${{ music: 'mu', weather: 'wx', slider: 'sl', cal: 'cal' }[id]}`, node);
      const rimI = el('i', '', el('div', 'rim', node));
      const rd = Math.ceil(Math.hypot(w, h)) + 4;
      Object.assign(rimI.style, { width: `${rd}px`, height: `${rd}px`, marginLeft: `${-rd / 2}px`, marginTop: `${-rd / 2}px` });
      shells[id] = { node, sheen, streak, rimI, ct };
    }

    // ---------- 天气 ----------
    const wx = shells.weather.ct;
    const loc = el('div', 'loc', wx, en ? 'Shanghai' : '上海');
    const arrow = svg('svg', { width: 9, height: 9, viewBox: '0 0 10 10' }, loc);
    svg('path', { d: 'M9 1 1 4.6l3.6 1 1 3.6z', fill: '#fff' }, arrow);
    el('div', 'deg', wx, '24°');
    const icon = svg('svg', { class: 'ic', width: 50, height: 50, viewBox: '0 0 50 50' }, wx);
    const sunG = svg('g', {}, icon);
    svg('circle', { cx: 0, cy: 0, r: 8.5, fill: '#ffd25e' }, sunG);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      svg('line', { x1: Math.cos(a) * 12, y1: Math.sin(a) * 12, x2: Math.cos(a) * 15.5, y2: Math.sin(a) * 15.5, stroke: '#ffd25e', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, sunG);
    }
    const cloud = svg('path', { d: 'M13 41h23a8 8 0 0 0 .6-16A11 11 0 0 0 15.6 23 9 9 0 0 0 13 41z', fill: 'rgba(255,255,255,.96)' }, icon);
    el('div', 'cond', wx, en ? 'Partly Cloudy' : '多云转晴');
    el('div', 'hl sub', wx, en ? 'H:27°  L:19°' : '最高 27°  最低 19°');
    const hours = el('div', 'hours', wx);
    [
      [en ? 'Now' : '现在', 'sun', 24],
      ['15', 'sun', 26],
      ['16', 'cloud', 25],
      ['17', 'cloud', 23],
      ['18', 'moon', 21],
    ].forEach(([label, kind, deg]) => {
      const h = el('div', 'h', hours);
      el('span', '', h, String(label));
      const s = svg('svg', { width: 14, height: 14, viewBox: '0 0 14 14' }, h);
      if (kind === 'sun') svg('circle', { cx: 7, cy: 7, r: 4, fill: '#ffd25e' }, s);
      else if (kind === 'cloud') svg('path', { d: 'M3.5 11h7a2.6 2.6 0 0 0 .1-5.2A3.5 3.5 0 0 0 4 5.4 2.8 2.8 0 0 0 3.5 11z', fill: '#fff' }, s);
      else svg('path', { d: 'M9.6 10.6A4.6 4.6 0 0 1 5.8 2.6a4.6 4.6 0 1 0 5.6 6.2 4.6 4.6 0 0 1-1.8 1.8z', fill: '#dfe6ff' }, s);
      el('span', '', h, `${deg}°`);
    });

    // ---------- 电台 ----------
    const mu = shells.music.ct;
    el('div', 'art', mu);
    el('div', 't1', mu, options.text ?? (en ? 'Glass Sea' : '玻璃海'));
    el('div', 't2 sub', mu, en ? 'noahvisuals · Night FM' : 'noahvisuals · 深夜电台');
    const live = el('div', 'live', mu);
    const liveDot = el('i', '', live);
    live.append('LIVE');
    const barsBox = el('div', 'bars', mu);
    const rnd = seeded(5);
    const bars = Array.from({ length: 15 }, () => ({ node: el('i', '', barsBox), k1: 12 + Math.floor(rnd() * 14), k2: 20 + Math.floor(rnd() * 18), p: rnd() * TAU }));
    const ctl = svg('svg', { width: 66, height: 22, viewBox: '0 0 66 22' }, mu);
    svg('path', { d: 'M3 5v12M15 5 6 11l9 6z', fill: 'rgba(255,255,255,.75)', stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, ctl);
    svg('path', { d: 'M29 4v14M37 4v14', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' }, ctl);
    svg('path', { d: 'M63 5v12M51 5l9 6-9 6z', fill: 'rgba(255,255,255,.75)', stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, ctl);

    // ---------- 日程：13:00 到 18:00，每小时 38px ----------
    const cal = shells.cal.ct;
    el('div', 'day', cal, en ? 'SUNDAY' : '星期日');
    el('div', 'num', cal, en ? 'Oct 11' : '10月11日');
    el('div', 'cnt sub', cal, en ? '3 events' : '3 个日程');
    const HY = (hour: number) => 88 + (hour - 13) * 38;
    for (let hr = 13; hr <= 18; hr++) {
      const line = el('div', 'hr', cal);
      line.style.top = `${HY(hr)}px`;
      el('span', '', line, `${hr}:00`);
    }
    [
      [13.5, 14.5, '#5ac8fa', en ? 'Design review' : '设计评审', '13:30 – 14:30'],
      [15, 16, '#ffb340', en ? 'Coffee with Mia' : '和 Mia 喝咖啡', '15:00 – 16:00'],
      [16.5, 17.5, '#5ee38a', en ? 'Workout' : '健身', '16:30 – 17:30'],
    ].forEach(([a, b, c, name, time]) => {
      const ev = el('div', 'ev', cal, String(name));
      ev.style.top = `${HY(Number(a)) + 1}px`;
      ev.style.height = `${(Number(b) - Number(a)) * 38 - 2}px`;
      ev.style.setProperty('--c', String(c));
      ev.style.background = `${c}42`; // 约 26% 不透明
      el('small', '', ev, String(time));
    });
    const now = el('div', 'now', cal);
    now.style.top = `${HY(14.8)}px`;
    el('i', '', now);
    const nowPulse = el('b', '', now);

    // ---------- 亮度 ----------
    const sl = shells.slider.ct;
    const fill = el('div', 'fill', sl);
    const pct = el('div', 'pct', sl);
    const sunIc = svg('svg', { width: 24, height: 24, viewBox: '-12 -12 24 24' }, sl);
    svg('circle', { r: 4.6, fill: '#3a3a52' }, sunIc);
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * TAU;
      return svg('line', { x1: Math.cos(a) * 7.4, y1: Math.sin(a) * 7.4, x2: Math.cos(a) * 9.6, y2: Math.sin(a) * 9.6, stroke: '#3a3a52', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, sunIc);
    });

    // ---------- 轨道 ----------
    const move = spring({ duration: 0.82, bounce: 0.22 });
    const tracks = {} as Record<Id, { x: Track; y: Track; r: Track; s: Track; ph: number }>;
    ORDER.forEach((id, i) => {
      const keys = (k: keyof Pose) => STEPS.map((st) => [st.at + st.delay[id], st.pose[id][k], move] as const);
      tracks[id] = { x: track(PILE[id].x, keys('x')), y: track(PILE[id].y, keys('y')), r: track(PILE[id].r, keys('r')), s: track(PILE[id].s, keys('s')), ph: i * 1.7 };
    });
    // 亮度被拖高、再调低，最后回到开头的值；背景亮度跟着变
    const drag = spring({ duration: 0.7, bounce: 0.15 });
    const level = track(0.46, [[1.9, 0.8, drag], [5.4, 0.6, drag], [10.4, 0.46, drag]]);
    // 拖动时整张卡被“按”下去一点
    const tap = spring({ duration: 0.3, bounce: 0 });
    const press = track(0, [[1.72, 1, tap], [2.4, 0, drag], [5.22, 1, tap], [5.9, 0, drag], [10.22, 1, tap], [10.9, 0, drag]]);

    const render = (t: number) => {
      const ph = (t / D) * TAU;
      const lv = level(t);

      // 背景：深色底 + 光球（screen 叠加），亮度跟着滑块
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 640, 400);
      ctx.globalCompositeOperation = 'screen';
      for (const o of ORBS) {
        const { x, y, r } = orbAt(o, t);
        // 清楚的光球外面再带一圈淡淡的光晕
        const R = o.soft ? r : r * 1.7;
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, R);
        if (o.soft) {
          g.addColorStop(0, o.c0);
          g.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
          g.addColorStop(0, o.c0);
          g.addColorStop(0.36, o.c1);
          g.addColorStop(0.55, o.c1);
          g.addColorStop(0.59, o.c1 + '55');
          g.addColorStop(0.75, o.c1 + '18');
          g.addColorStop(1, o.c1 + '00');
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(6,5,16,${0.42 * (1 - lv)})`;
      ctx.fillRect(0, 0, 640, 400);

      // 光源：暖色光球
      const L = orbAt(KEY, t);

      for (const id of ORDER) {
        const tr = tracks[id];
        const sh = shells[id];
        const [w, h] = SIZE[id];
        // 停着的时候也轻轻漂浮
        const x = tr.x(t) + 2.2 * Math.sin(ph * 2 + tr.ph);
        const y = tr.y(t) + 2.6 * Math.cos(ph * 3 + tr.ph);
        const r = tr.r(t);
        const s = tr.s(t) * (id === 'slider' ? 1 - 0.045 * press(t) : 1);
        // 跟随速度：走得快时微微抬起（放大）、顶部落后一点（斜切）、带一点拖拽的转动。
        // 只用 2D 变换：带 perspective 的 3D 变换会让无头 Chrome 里的 backdrop-filter 碎成一块块矩形
        const vx = tr.x.velocity(t);
        const vy = tr.y.velocity(t);
        const lift = 1 + 0.04 * clamp(Math.hypot(vx, vy) / 700);
        sh.node.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${r + clamp(vx * 0.006, -5, 5)}deg) skewX(${clamp(vx * 0.008, -5, 5)}deg) scale(${s * lift})`;

        // 边缘高光朝向光源；光斑往光源那一侧偏
        const dx = L.x - x;
        const dy = L.y - y;
        const dist = Math.hypot(dx, dy) || 1;
        const ang = (Math.atan2(dx, -dy) * 180) / Math.PI - r;
        sh.rimI.style.transform = `rotate(${ang}deg)`;
        const a = ((ang - 90) * Math.PI) / 180;
        const near = clamp(1.25 - dist / 420, 0.35, 1);
        sh.sheen.style.transform = `translate(${Math.cos(a) * w * 0.5}px, ${Math.sin(a) * h * 0.5}px)`;
        sh.sheen.style.opacity = String(near);
        // 斜向反光条：卡片横向移动时反着滑过，像玻璃面上的倒影
        sh.streak.style.transform = `translateX(${wrap((320 - x) * 0.9 + w * 0.3, 0, w + 140) - w / 2 - 70}px) rotate(24deg)`;
      }

      // 内容里的小动作（频率都是整数，首尾相接）
      sunG.setAttribute('transform', `translate(30 17) rotate(${(t / D) * 720})`);
      cloud.setAttribute('transform', `translate(${1.5 * Math.sin(ph * 2)} 0)`);
      for (const b of bars) {
        const v = 0.5 + 0.28 * Math.sin(ph * b.k1 + b.p) + 0.22 * Math.sin(ph * b.k2 + b.p * 2);
        b.node.style.transform = `scaleY(${0.16 + 0.84 * clamp(v)})`;
      }
      liveDot.style.opacity = String(0.45 + 0.55 * (0.5 + 0.5 * Math.cos(ph * 12)));
      const pulse = (t * (12 / D)) % 1;
      nowPulse.style.transform = `scale(${1 + pulse * 1.8})`;
      nowPulse.style.opacity = String(0.6 * (1 - pulse));
      fill.style.transform = `scaleY(${lv})`;
      pct.textContent = `${Math.round(clamp(lv) * 100)}%`;
      const rl = remap(lv, 0.4, 0.9, 0.7, 1.15);
      rays.forEach((ray) => ray.setAttribute('transform', `scale(${rl})`));
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.2 });
  },
};
