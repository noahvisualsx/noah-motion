// 万花筒：真正的“镜筒”画法——只在一片 30° 的楔形里画东西，再把这一片旋转复制 12 次、隔一片镜像一次。
// 楔形里有三层：最底下两三团缓慢游走的冷色光，镜像后叠成一朵柔和的花；
// 上面是一代一代从中心长出来的花边——波浪细环、透镜形的薄片、扇形细线、涟漪和珠串，
// 每代按指数向外长（像镜头一直往里推），同时慢慢滑过镜面，在镜线上分开又合拢；波浪环的相位也在走，时而圆润时而折成尖角。
// 生长速度跟着 3 秒一次的呼吸一张一弛；12 代正好填满 12 秒，整体转 60°，首尾相接。
import { timeline } from '../timeline.ts';
import { mix } from '../track.ts';
import { createStage, createCanvas, el, injectCSS, seeded, smooth, wrap, TAU, type SceneDef } from './util.ts';

const D = 12;
const SLICES = 12;
const WEDGE = TAU / SLICES;
const P = 1; // 每秒从中心长出一代
const GENS = D / P;
const LIFE = 9.5; // 每代活 9.5 秒，同时约有 9 代在画面里
const R0 = 4;
const RMAX = 372; // 再往外是暗角，画了也看不见
const K = Math.log(RMAX / R0) / LIFE;
const BREATH = TAU / 3; // 3 秒一次呼吸
const PX = 2;
const OW = 374; // 楔形缓冲区的大小（逻辑像素）
const OH = 196;
const OY = 6; // 缓冲区里原点往下挪一点，留出镜线外侧的一窄条
// 色板：墨蓝底、香槟金线条，青、蓝、紫三种冷色的纱
const INK = '#07080f';
const GOLD = '243,214,160';
const VEILS = ['54,201,186', '84,150,255', '134,112,255'];

type Item =
  | { kind: 'lace'; u: number; amp: number; m: number; ph: number; speed: number }
  | { kind: 'lens'; u1: number; a1: number; u2: number; a2: number; bulge: number }
  | { kind: 'fan'; u0: number; a0: number; u1: number; spread: number; n: number }
  | { kind: 'jewel'; u: number; a: number; rho: number }
  | { kind: 'beads'; u: number; n: number; size: number }
  | { kind: 'glow'; u: number; a: number; size: number };

/**
 * 每一代的配方：位置都用“相对这代半径的比例 u”和“楔形里的角度 a”表示，长大时整体等比放大。
 * 三种代轮流出现，一圈花瓣、一圈扇线、一圈细花边，往外数就有了节奏，不会乱成一团。
 */
function recipe(g: number) {
  const rnd = seeded(211 + g * 37);
  const r = (a: number, b: number) => mix(a, b, rnd());
  const ang = () => r(-0.12, 1.12) * WEDGE; // 故意越过镜线一点，镜像后在镜线上连成一体
  const type = g % 3;
  const items: Item[] = [];
  // 波浪环：m 是 6 的倍数，波峰波谷正好落在镜线上，镜像后是一圈规整的花边；振幅随时间起伏、翻转（每轮整数次，循环接得上）
  if (type !== 1) items.push({ kind: 'lace', u: 1, amp: type ? r(0.01, 0.014) : r(0.016, 0.024), m: type ? 36 : 18, ph: r(0, TAU), speed: g % 2 ? 2 : -2 });
  // 透镜薄片大致沿半径方向摆，镜像后像花瓣；靠近镜线的会和自己的倒影合成一片更宽的
  const lenses = type === 0 ? 2 : type === 2 ? 1 : 0;
  for (let i = 0; i < lenses; i++) {
    const a1 = ang();
    const u1 = r(0.6, 0.8);
    items.push({ kind: 'lens', u1, a1, u2: u1 + r(0.24, 0.4), a2: a1 + r(-0.3, 0.3) * WEDGE, bulge: r(0.13, 0.22) });
  }
  if (type !== 0) items.push({ kind: 'fan', u0: r(0.45, 0.6), a0: ang(), u1: r(0.95, 1.1), spread: r(0.5, 0.9) * WEDGE, n: type === 1 ? 6 : 4 });
  if (type === 1) {
    items.push({ kind: 'jewel', u: r(0.8, 0.95), a: r(0.1, 0.9) * WEDGE, rho: r(0.035, 0.055) });
    items.push({ kind: 'beads', u: r(1.18, 1.25), n: 6, size: r(0.9, 1.2) });
  }
  if (type !== 1) items.push({ kind: 'glow', u: r(0.85, 1.05), a: r(0.2, 0.8) * WEDGE, size: r(0.3, 0.42) });
  return {
    items,
    veil: VEILS[(g * 2) % 3]!, // 颜色和类型错开，同一种图形每次换一种颜色
    drift: (g % 2 ? 1 : -1) * r(0.025, 0.045), // 相邻两代往相反方向慢慢滑过镜面
  };
}

export const kaleido: SceneDef = {
  title: '万花筒',
  category: '图形',
  description: '只画一片 30° 的楔形，旋转复制、隔片镜像成 12 瓣：冷色的光纱叠出底色，金色波浪环、透镜薄片和扇形细线一代代从中心长出来，随呼吸般的节奏向外绽开，滑过镜线时分开又合拢。',
  tags: ['timeline', 'loop', '镜像对称', '周期折回', 'canvas'],
  tone: 'dark',
  en: {
    title: 'Kaleidoscope',
    description: 'Only one 30° wedge is drawn, then rotated and mirrored into 12. Cool veils of light layer into a soft bloom while gold lace rings, translucent lenses and fans of fine lines grow out of the center on a breathing rhythm, splitting and rejoining as they slide across the mirrors.',
    tags: ['timeline', 'loop', 'mirror symmetry', 'periodic wrap', 'canvas'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-kaleido');
    // 中心的光和四周的暗角交给 CSS 叠在上面，canvas 每帧少铺两层整屏渐变
    injectCSS(
      'nm-kaleido',
      `.nm-kaleido{background:${INK}}
.nm-kaleido .core{position:absolute;left:270px;top:150px;width:100px;height:100px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,244,224,.5),rgba(${GOLD},.14) 45%,rgba(${GOLD},0));mix-blend-mode:screen}
.nm-kaleido .vig{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(7,8,15,0) 170px,rgba(7,8,15,.72) 400px)}`,
    );
    const { ctx } = createCanvas(stage, PX);
    const core = el('div', 'core', stage);
    el('div', 'vig', stage);
    // 楔形缓冲区：每帧只在这里画一次，再盖章 12 次
    const buf = document.createElement('canvas');
    buf.width = OW * PX;
    buf.height = OH * PX;
    const b = buf.getContext('2d')!;
    const gens = Array.from({ length: GENS }, (_, g) => recipe(g));

    /** 生长：指数放大（像一直往里推镜头），速度随全局呼吸在 0.35~1.65 倍之间起伏 */
    const grow = (age: number, t: number) => R0 * Math.exp(K * (age - (0.65 * Math.sin(BREATH * t)) / BREATH));
    const polar = (u: number, a: number, r: number): [number, number] => [Math.cos(a) * u * r, Math.sin(a) * u * r];

    const drawGen = (g: number, age: number, t: number) => {
      const gen = gens[g]!;
      const r = grow(age, t);
      // 刚出生时淡入，靠近边缘时淡出
      const alpha = smooth(4, 34, r) * (1 - smooth(240, 365, r));
      if (alpha <= 0.002) return;
      const rot = gen.drift * age;
      const lw = 0.55 + 0.55 * smooth(20, 280, r); // 越往外线条略粗，像离眼睛更近
      b.lineWidth = lw;
      for (const it of gen.items) {
        if (it.kind === 'lace') {
          const amp = it.amp * Math.cos(it.ph + (TAU * it.speed * t) / D);
          b.strokeStyle = `rgba(${GOLD},${0.46 * alpha})`;
          b.beginPath();
          for (let i = 0; i <= 28; i++) {
            const a = mix(-0.03, WEDGE + 0.03, i / 28);
            const rr = it.u * r * (1 + amp * Math.cos(it.m * a));
            if (i) b.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else b.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          b.stroke();
        } else if (it.kind === 'lens') {
          const [x1, y1] = polar(it.u1, it.a1 + rot, r);
          const [x2, y2] = polar(it.u2, it.a2 + rot, r);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const nx = -(y2 - y1) * it.bulge;
          const ny = (x2 - x1) * it.bulge;
          b.beginPath();
          b.moveTo(x1, y1);
          b.quadraticCurveTo(mx + nx, my + ny, x2, y2);
          b.quadraticCurveTo(mx - nx, my - ny, x1, y1);
          b.fillStyle = `rgba(${gen.veil},${0.16 * alpha})`;
          b.fill();
          b.strokeStyle = `rgba(${GOLD},${0.58 * alpha})`;
          b.stroke();
        } else if (it.kind === 'fan') {
          // 一束从同一点散开的细线，两头渐隐
          const [x0, y0] = polar(it.u0, it.a0 + rot, r);
          for (let i = 0; i < it.n; i++) {
            const [x1, y1] = polar(it.u1, it.a0 + rot + (i / (it.n - 1) - 0.5) * it.spread, r);
            const grad = b.createLinearGradient(x0, y0, x1, y1);
            grad.addColorStop(0, `rgba(${GOLD},0)`);
            grad.addColorStop(0.6, `rgba(${GOLD},${0.5 * alpha})`);
            grad.addColorStop(1, `rgba(${GOLD},0)`);
            b.strokeStyle = grad;
            b.beginPath();
            b.moveTo(x0, y0);
            b.lineTo(x1, y1);
            b.stroke();
          }
        } else if (it.kind === 'jewel') {
          // 一颗小宝石：实心的亮点外面套一圈细环
          const [cx, cy] = polar(it.u, it.a + rot, r);
          const s = it.rho * r;
          b.fillStyle = `rgba(${gen.veil},${0.5 * alpha})`;
          b.beginPath();
          b.arc(cx, cy, s * 0.45, 0, TAU);
          b.fill();
          b.strokeStyle = `rgba(${GOLD},${0.5 * alpha})`;
          b.beginPath();
          b.arc(cx, cy, s, 0, TAU);
          b.stroke();
        } else if (it.kind === 'beads') {
          // 等分在楔形里的一串小点，镜像后连成一整圈
          b.fillStyle = `rgba(${GOLD},${0.8 * alpha})`;
          b.beginPath();
          const s = it.size * (0.55 + 0.45 * smooth(10, 220, r));
          for (let i = 0; i <= it.n; i++) {
            const [x, y] = polar(it.u, (WEDGE * i) / it.n, r);
            b.moveTo(x + s, y);
            b.arc(x, y, s, 0, TAU);
          }
          b.fill();
        } else {
          const [x, y] = polar(it.u, it.a + rot, r);
          const s = it.size * r;
          const glow = b.createRadialGradient(x, y, 0, x, y, s);
          glow.addColorStop(0, `rgba(${gen.veil},${0.24 * alpha})`);
          glow.addColorStop(1, `rgba(${gen.veil},0)`);
          b.fillStyle = glow;
          b.fillRect(x - s, y - s, s * 2, s * 2);
        }
      }
    };

    // 底层的三团光：半径、角度都按整圈周期游走
    const fields = [
      { u: 120, du: 40, a: 0.5, da: 0.42, f: 1, size: 160, veil: VEILS[0]!, o: 0.13 },
      { u: 250, du: 50, a: 0.5, da: 0.45, f: 2, size: 200, veil: VEILS[2]!, o: 0.13 },
      { u: 40, du: 20, a: 0.3, da: 0.3, f: 3, size: 120, veil: VEILS[1]!, o: 0.14 },
    ];

    const render = (t: number) => {
      const ph = (TAU * t) / D;
      // 1. 在缓冲区里画一片楔形：先铺满底色（不透明，这样相邻两片在镜线上叠一点也看不出缝），再叠加各层
      b.setTransform(PX, 0, 0, PX, 0, OY * PX);
      b.globalCompositeOperation = 'source-over';
      b.fillStyle = INK;
      b.fillRect(0, -OY, OW, OH);
      b.globalCompositeOperation = 'lighter';
      b.lineCap = 'round';
      b.lineJoin = 'round';
      fields.forEach((f, i) => {
        const [x, y] = polar(f.u + f.du * Math.sin(ph * f.f + i), WEDGE * (f.a + f.da * Math.sin(ph * f.f + i * 2.1)), 1);
        const glow = b.createRadialGradient(x, y, 0, x, y, f.size);
        glow.addColorStop(0, `rgba(${f.veil},${f.o})`);
        glow.addColorStop(1, `rgba(${f.veil},0)`);
        b.fillStyle = glow;
        b.fillRect(x - f.size, y - f.size, f.size * 2, f.size * 2);
      });
      // 年龄用周期折回计算：循环开头时，上一轮出生的几代仍在原处继续长；先画老的（外圈、大），再画新的
      const order = Array.from({ length: GENS }, (_, g) => ({ g, age: wrap(t, g * P, D) }))
        .filter((x) => x.age < LIFE)
        .sort((x, y) => y.age - x.age);
      for (const { g, age } of order) drawGen(g, age, t);
      // 只留下楔形（两边各多出一点点），盖章时就不用逐片裁剪了
      b.globalCompositeOperation = 'destination-in';
      b.fillStyle = '#000';
      b.beginPath();
      b.moveTo(0, 0);
      b.arc(0, 0, RMAX, -0.006, WEDGE + 0.006);
      b.closePath();
      b.fill();

      // 2. 盖章：12 片，隔一片镜像；相邻两片在镜线上重叠一窄条，盖住抗锯齿的缝
      //    先清空：四个角和中心的缝不一定被盖满，不能留着上一帧的像素
      ctx.clearRect(0, 0, 640, 400);
      ctx.save();
      ctx.translate(320, 200);
      ctx.rotate((t / D) * WEDGE * 2); // 一轮转 60°（两片），首尾图案一致
      for (let i = 0; i < SLICES; i++) {
        ctx.save();
        ctx.rotate(i * WEDGE);
        if (i % 2) {
          ctx.rotate(WEDGE);
          ctx.scale(1, -1);
        }
        ctx.drawImage(buf, 0, -OY, OW, OH);
        ctx.restore();
      }
      ctx.restore();

      // 3. 中心的光随呼吸明暗、微微胀缩
      const breath = 0.5 - 0.5 * Math.cos(BREATH * t);
      core.style.opacity = String(0.6 + 0.4 * breath);
      core.style.transform = `scale(${0.85 + 0.25 * breath})`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 6 });
  },
};
