// 涟漪点阵：一张斜着看过去的点阵水面，近处的点大而亮，远处的点小而暗，最后融进天边的雾里。
// 雨滴一颗颗从上方落下：先拉出一道光痕，落点处闪一下、冲起一圈光晕、溅出一圈水珠，正中还会弹起一小柱水；
// 同时激起一个弹簧脉冲，按距离延迟向外扩散成一圈圈椭圆涟漪。每滴雨有自己的颜色，几圈涟漪相遇时颜色相加，
// 波峰叠在一起的地方变成白色高光。每个点的高度和颜色只由时间和它到各落点的距离决定；雨滴按 wrap 折回时间，首尾相接。
import { spring } from '../spring.ts';
import { clamp } from '../track.ts';
import { easeOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, injectCSS, seeded, smooth, wrap, TAU, type SceneDef } from './util.ts';

const D = 10;
// 透视：水面上 (X, Z) 的点投到屏幕上，缩放 s = F / (Z + F)，近处 s = 1、最远处 s = 0.6
const F = 1400;
const HC = 1050; // 相机高度
const YH = 412 - HC; // 地平线（在画面上方很远）
const GX = 15; // 点阵间距（水面单位）：横向
const GZ = 21; // 纵向放宽一点，透视压扁之后近处的行距和列距差不多
const ZMAX = 935;
const AMP = 6; // 波高换算成屏幕位移
const SPEED = 165; // 涟漪扩散速度（水面单位 / 秒）
const FALL = 0.5; // 雨滴从出现到落水
const LIFE = 3.8; // 一滴雨的涟漪持续多久
const GRAV = 900; // 溅起的水珠受的重力

// 每滴雨的颜色（rgb），重叠时直接相加
const HUES = [
  [86, 196, 255], // 冰蓝
  [150, 118, 255], // 薰衣草紫
  [64, 232, 196], // 薄荷青
  [255, 118, 176], // 玫瑰粉
] as const;
const DROPS = [
  { at: 0.55, x: -150, z: 350, power: 1, hue: 0 },
  { at: 1.75, x: 175, z: 180, power: 0.85, hue: 3 },
  { at: 2.55, x: 330, z: 740, power: 0.45, hue: 2 },
  { at: 3.35, x: 40, z: 570, power: 0.8, hue: 1 },
  { at: 4.7, x: -250, z: 120, power: 0.8, hue: 2 },
  { at: 5.5, x: -400, z: 720, power: 0.45, hue: 0 },
  { at: 6.15, x: 235, z: 450, power: 1, hue: 0 },
  { at: 7.45, x: -60, z: 240, power: 0.9, hue: 1 },
  { at: 8.35, x: 400, z: 150, power: 0.5, hue: 3 },
  { at: 8.95, x: 110, z: 700, power: 0.65, hue: 2 },
];

export const ripple: SceneDef = {
  title: '涟漪点阵',
  category: '图形',
  description: '斜看过去的点阵水面上落下十滴彩色的雨：光痕、闪光、光晕、溅起的水珠，再按距离延迟扩散成椭圆涟漪，几圈相遇时颜色相加、波峰重叠处亮成白色。',
  tags: ['spring 脉冲', '按距离延迟', '透视投影', 'wrap', 'canvas'],
  tone: 'dark',
  en: {
    title: 'Ripple grid',
    description: 'Ten colored raindrops fall on a dot-grid pond seen at an angle: a streak, a flash, a halo and a crown of splashes, then spring pulses spreading as elliptical rings. Where rings meet their colors add, and stacked crests flare white.',
    tags: ['spring pulses', 'distance delay', 'perspective', 'wrap', 'canvas'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-ripple');
    // 不变的背景和四周的压暗交给 CSS，canvas 每帧只画会动的东西
    injectCSS(
      'nm-ripple',
      `.nm-ripple{background:radial-gradient(95% 80% at 50% -22%,rgba(112,132,224,.36),rgba(112,132,224,.1) 55%,rgba(112,132,224,0) 100%),linear-gradient(#0d1222,#070a14 38%,#04050a)}
.nm-ripple .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(closest-side at 50% 52%,rgba(0,0,0,0) 40%,rgba(0,0,0,.42) 130%)}`,
    );
    const { ctx } = createCanvas(stage);
    el('div', 'vig', stage);

    // 一个脉冲 = 弹簧被猛推一下后的速度曲线（冲激响应）：从 0 平滑隆起，再带着几圈衰减的余波回到 0。
    // 查表代替逐点解弹簧，几千个点也不费劲
    const ring = spring({ duration: 0.62, bounce: 0.85 });
    const PL = 3;
    const STEP = 1 / 500;
    let peak = 0;
    for (let i = 0; i * STEP < PL; i++) peak = Math.max(peak, ring.velocity(i * STEP));
    const table = Float32Array.from({ length: Math.ceil(PL / STEP) + 2 }, (_, i) => ring.velocity(i * STEP) / peak);
    const pulseAt = (x: number) => {
      const f = x / STEP;
      const i = Math.floor(f);
      const a = table[i] ?? 0;
      return a + ((table[i + 1] ?? 0) - a) * (f - i);
    };

    const scaleAt = (z: number) => F / (z + F);
    const project = (x: number, z: number, h = 0) => {
      const s = scaleAt(z);
      return { x: 320 + x * s, y: YH + HC * s - h * s, s };
    };

    // 点阵：从远到近一行行排好，屏幕外的点直接不要
    const rnd = seeded(23);
    const rows: { s: number; y: number; fog: number; xs: number[]; px: number[]; size: number[]; dist: Float32Array }[] = [];
    for (let z = ZMAX; z >= 0; z -= GZ) {
      const s = scaleAt(z);
      const half = Math.ceil(340 / (GX * s));
      const xs: number[] = [];
      const px: number[] = [];
      const size: number[] = [];
      for (let c = -half; c <= half; c++) {
        const x = c * GX;
        const sx = 320 + x * s;
        if (sx < -6 || sx > 646) continue;
        xs.push(x);
        px.push(sx);
        size.push(0.8 + rnd() * 0.45);
      }
      const dist = new Float32Array(xs.length * DROPS.length);
      xs.forEach((x, i) => DROPS.forEach((d, j) => (dist[i * DROPS.length + j] = Math.hypot(x - d.x, z - d.z))));
      // 远处的点隐进雾里：最远几行几乎看不见
      const fog = (0.22 + 0.78 * smooth(0.6, 1, s)) * smooth(0.6, 0.65, s);
      rows.push({ s, y: YH + HC * s, fog, xs, px, size, dist });
    }

    // 溅起的水珠：每滴雨一圈，方向、速度都是固定的随机数
    const splashes = DROPS.map((d) =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * TAU + (rnd() - 0.5) * 0.35;
        return { a, vh: (60 + rnd() * 80) * (0.6 + 0.4 * d.power), vz: (170 + rnd() * 140) * (0.55 + 0.45 * d.power), r: 1.2 + rnd() * 1 };
      }),
    );

    // 发光贴图：白色和每种雨的颜色各一张，叠加模式画上去
    const sprite = (rgb: readonly number[]) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${rgb.join(',')},1)`);
      grad.addColorStop(0.25, `rgba(${rgb.join(',')},.45)`);
      grad.addColorStop(1, `rgba(${rgb.join(',')},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return c;
    };
    const glowWhite = sprite([235, 245, 255]);
    const glows = HUES.map(sprite);
    const glowAt = (img: HTMLCanvasElement, x: number, y: number, r: number, alpha: number, sy = 1) => {
      if (alpha <= 0.004 || r <= 0.2) return;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(img, x - r, y - r * sy, r * 2, r * 2 * sy);
    };

    const nd = DROPS.length;
    const sNow = new Float32Array(nd);
    const fadeNow = new Float32Array(nd);

    const render = (t: number) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, 640, 400);

      // 每滴雨此刻的“落水后时间”：负数表示还在半空
      for (let j = 0; j < nd; j++) {
        const d = DROPS[j]!;
        const s = wrap(t, d.at - FALL, D) - FALL;
        sNow[j] = s;
        fadeNow[j] = s < 0 ? 0 : d.power * (1 - smooth(LIFE - 1.2, LIFE, s));
      }
      // 很慢的底浪：整轮正好走整数个周期
      const w1 = (TAU * 2 * t) / D;
      const w2 = (TAU * 3 * t) / D;

      ctx.globalCompositeOperation = 'lighter';
      for (const row of rows) {
        const base = 0.42 * row.fog;
        if (base < 0.01) continue;
        const n = row.xs.length;
        // 先把没被波及的点攒成一条路径一次画完，被波及的点逐个上色
        const calm = new Path2D();
        for (let i = 0; i < n; i++) {
          const x = row.xs[i]!;
          let E = 0;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          for (let j = 0; j < nd; j++) {
            const f = fadeNow[j]!;
            if (f <= 0) continue;
            const r = row.dist[i * nd + j]!;
            const local = sNow[j]! - r / SPEED;
            if (local <= 0 || local >= PL) continue;
            // 离落点越远越弱；正中是被砸出的小坑，压一压免得亮成一团
            const e = ((1.25 * pulseAt(local) * f) / (1 + r / 260)) * (0.4 + 0.6 * smooth(0, 70, r));
            E += e;
            const k = e > 0 ? e : -e * 0.2;
            const hue = HUES[DROPS[j]!.hue]!;
            cr += hue[0] * k;
            cg += hue[1] * k;
            cb += hue[2] * k;
          }
          const zRow = F / row.s - F;
          const amb = Math.sin(x * 0.011 + zRow * 0.006 - w1) * 0.5 + Math.sin(-x * 0.007 + zRow * 0.012 - w2) * 0.35;
          const sx = row.px[i]!;
          const sy = row.y - (E * AMP + amb * 2.2) * row.s;
          const rad = row.size[i]! * (0.75 + 0.85 * row.s) * (1 + 0.06 * amb);
          const energy = Math.abs(E);
          if (energy < 0.05) {
            calm.moveTo(sx + rad, sy);
            calm.arc(sx, sy, rad, 0, TAU);
            continue;
          }
          // 被波及的点：叠加模式下颜色就是发出的光 = 底色（波峰亮、波谷暗）+ 各滴雨的颜色相加；
          // 单独一圈涟漪到不了白色，只有两圈以上的波峰叠在一起才会亮成白色高光
          const hot = smooth(0.9, 1.5, E);
          const lit = clamp(1 + E * 0.9, 0.12, 1.6);
          const gain = 1.25 * (0.35 + 0.65 * row.fog);
          const R = Math.min(255, 140 * base * lit + cr * gain + 235 * hot);
          const Gc = Math.min(255, 158 * base * lit + cg * gain + 235 * hot);
          const B = Math.min(255, 205 * base * lit + cb * gain + 235 * hot);
          const core = rad * (1 + Math.min(1.5, energy * 1.4)) + hot * row.s;
          ctx.fillStyle = `rgb(${R | 0},${Gc | 0},${B | 0})`;
          ctx.beginPath();
          ctx.arc(sx, sy, core, 0, TAU);
          ctx.fill();
          // 一圈淡淡的光晕：相邻的亮点晕在一起，涟漪读起来是连续的光带而不是一颗颗点
          if (energy > 0.12) {
            ctx.globalAlpha = Math.min(0.3, energy * 0.26);
            ctx.beginPath();
            ctx.arc(sx, sy, core * 2.7, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          if (hot > 0.05) {
            glowAt(glowWhite, sx, sy, 9 * row.s * (0.6 + hot), hot * 0.55 * row.fog);
            ctx.globalAlpha = 1;
          }
        }
        ctx.fillStyle = `rgb(${(140 * base) | 0},${(158 * base) | 0},${(205 * base) | 0})`;
        ctx.fill(calm);
      }

      // 落点细节：光痕、闪光、光晕、冲击环、水柱、水珠
      for (let j = 0; j < nd; j++) {
        const d = DROPS[j]!;
        const s = sNow[j]!;
        const hue = HUES[d.hue]!;
        const rgb = hue.join(',');
        const o = project(d.x, d.z);
        const fore = (HC * o.s) / F; // 水面上的圆投到屏幕上压扁的比例
        if (s < 0) {
          // 半空：越落越快，拖一道光痕；水面上它的倒影越来越亮
          const u = (s + FALL) / FALL;
          const H0 = 420;
          const h = H0 * (1 - u * u);
          const h2 = H0 * (1 - Math.max(0, u - 0.09) ** 2);
          const a = project(d.x, d.z, h);
          const b = project(d.x, d.z, h2);
          const streak = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          streak.addColorStop(0, `rgba(235,245,255,${0.95 * smooth(0, 0.25, u)})`);
          streak.addColorStop(1, `rgba(${rgb},0)`);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = streak;
          ctx.lineWidth = 1.6 * o.s;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          glowAt(glowWhite, a.x, a.y, 5 * o.s, 0.8 * smooth(0, 0.25, u));
          glowAt(glows[d.hue]!, o.x, o.y, 26 * o.s, 0.35 * u ** 3, fore);
          continue;
        }
        if (s > 1.4) continue;
        const pw = d.power;
        // 闪光
        glowAt(glowWhite, o.x, o.y - 2 * o.s, (14 + 16 * pw) * o.s * (1 + s * 3), Math.exp(-s / 0.09) * 0.95);
        // 光晕：贴在水面上的一片彩色亮斑，迅速摊开变淡
        const halo = (40 + 150 * easeOut(clamp(s / 1.2))) * o.s * (0.6 + 0.4 * pw);
        glowAt(glows[d.hue]!, o.x, o.y, halo, 0.5 * (1 - smooth(0, 1.2, s)) * pw, fore);
        // 冲击环：一道细细的亮线跑在涟漪前面
        const R = 10 + 230 * easeOut(clamp(s / 1.1));
        const ringA = (1 - smooth(0, 0.9, s)) * 0.45 * pw;
        if (ringA > 0.01) {
          ctx.globalAlpha = ringA;
          ctx.strokeStyle = `rgb(${hue.map((v) => Math.min(255, v + 60)).join(',')})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          // 水面上的圆按透视逐点投影，近大远小，和点阵里的涟漪对得上
          for (let k = 0; k <= 64; k++) {
            const a = (k / 64) * TAU;
            const q = project(d.x + Math.cos(a) * R, d.z + Math.sin(a) * R);
            if (k === 0) ctx.moveTo(q.x, q.y);
            else ctx.lineTo(q.x, q.y);
          }
          ctx.stroke();
        }
        // 正中弹起的一小柱水（沃辛顿射流），顶上带一颗水珠
        const jet = s > 0.08 && s < 0.6 ? Math.sin((Math.PI * (s - 0.08)) / 0.52) : 0;
        if (jet > 0) {
          const top = project(d.x, d.z, 78 * pw * jet);
          const col = ctx.createLinearGradient(o.x, o.y, top.x, top.y);
          col.addColorStop(0, `rgba(${rgb},0)`);
          col.addColorStop(1, 'rgba(235,245,255,.85)');
          ctx.globalAlpha = 1;
          ctx.strokeStyle = col;
          ctx.lineWidth = 3 * o.s;
          ctx.beginPath();
          ctx.moveTo(o.x, o.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();
          ctx.fillStyle = '#f2f8ff';
          ctx.beginPath();
          ctx.arc(top.x, top.y - 1.5 * o.s, 2.2 * o.s, 0, TAU);
          ctx.fill();
          glowAt(glowWhite, top.x, top.y, 9 * o.s, 0.7 * jet);
        }
        // 溅起的水珠：抛物线飞出去，落回水面时熄灭
        for (const p of splashes[j]!) {
          const h = p.vz * s - 0.5 * GRAV * s * s;
          if (h < 0) continue;
          const px = d.x + Math.cos(p.a) * p.vh * s;
          const pz = d.z + Math.sin(p.a) * p.vh * s;
          const q = project(px, pz, h);
          const s0 = Math.max(0, s - 0.035);
          const q0 = project(d.x + Math.cos(p.a) * p.vh * s0, d.z + Math.sin(p.a) * p.vh * s0, Math.max(0, p.vz * s0 - 0.5 * GRAV * s0 * s0));
          const a = 0.9 * smooth(0, 0.04, h) * (0.5 + 0.5 * pw);
          ctx.globalAlpha = a * 0.6;
          ctx.strokeStyle = `rgb(${rgb})`;
          ctx.lineWidth = p.r * q.s;
          ctx.beginPath();
          ctx.moveTo(q0.x, q0.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
          ctx.globalAlpha = a;
          ctx.fillStyle = '#eef6ff';
          ctx.beginPath();
          ctx.arc(q.x, q.y, p.r * q.s, 0, TAU);
          ctx.fill();
          glowAt(glows[d.hue]!, q.x, q.y, 7 * q.s, a * 0.6);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 6.6 });
  },
};
