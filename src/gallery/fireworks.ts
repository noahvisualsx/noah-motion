// 烟花：十发烟花从水边升空，在顶点炸开成牡丹、光环、垂柳和闪烁四种形状；粒子带空气阻力和重力
// （位置用闭式解直接算，任意一帧都能直接跳到），炸开瞬间照亮夜空，水面倒映着整片天空和城市剪影。
// 每一发按 wrap 折回时间，循环末尾升空的那一发会在开头接着炸开，首尾相接。
import { timeline } from '../timeline.ts';
import { clamp } from '../track.ts';
import { easeOut } from '../easing.ts';
import { createStage, createCanvas, seeded, wrap, TAU, type SceneDef } from './util.ts';

const D = 10;
const WATER = 318;
const LAUNCH = 0.95;
const AT = [0.2, 1.1, 1.9, 2.7, 4.0, 4.7, 6.0, 7.0, 8.1, 9.2];
const TYPES = ['peony', 'ring', 'willow', 'peony', 'crackle', 'ring', 'peony', 'willow', 'crackle', 'peony'] as const;
type Kind = (typeof TYPES)[number];

const LIFE: Record<Kind, number> = { peony: 2.0, ring: 1.9, willow: 2.8, crackle: 2.3 };
const DRAG: Record<Kind, number> = { peony: 1.5, ring: 1.6, willow: 0.9, crackle: 1.4 };
const GRAVITY: Record<Kind, number> = { peony: 55, ring: 50, willow: 62, crackle: 55 };

export const fireworks: SceneDef = {
  title: '烟花',
  category: '插画',
  description: '十发烟花升空炸开成牡丹、光环、垂柳和闪烁，粒子带空气阻力和重力，炸开时照亮夜空，水面倒映着天空和城市。',
  tags: ['canvas', '闭式物理', 'wrap'],
  tone: 'dark',
  en: {
    title: 'Fireworks',
    description: 'Ten shells rise and burst into peonies, rings, willows and crackles. Particles feel drag and gravity, each burst lights up the sky, and the water reflects it all along with the skyline.',
    tags: ['canvas', 'closed-form physics', 'wrap'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-fw');
    const { canvas, ctx } = createCanvas(stage);
    const px = canvas.width / 640;

    const rnd = seeded(77);
    const shells = AT.map((at, i) => {
      const kind = TYPES[i]!;
      const count = kind === 'willow' ? 70 : kind === 'ring' ? 64 : 96;
      const cx = 110 + rnd() * 420;
      const peak = 66 + rnd() * 92;
      const hue = [8, 42, 200, 280, 330, 120, 50, 190, 310, 20][i]!;
      // 光环压扁成椭圆再稍微倾斜，像斜着看到的一个圈
      const tilt = (rnd() - 0.5) * 0.6;
      const parts = Array.from({ length: count }, (_, j) => {
        const a = kind === 'ring' ? (j / count) * TAU : (j / count) * TAU + (rnd() - 0.5) * 0.2;
        const v = kind === 'ring' ? 175 : (kind === 'willow' ? 105 : 185) * (0.62 + rnd() * 0.45);
        let vx = Math.cos(a) * v;
        let vy = Math.sin(a) * v;
        if (kind === 'ring') {
          vy *= 0.42;
          [vx, vy] = [vx * Math.cos(tilt) - vy * Math.sin(tilt), vx * Math.sin(tilt) + vy * Math.cos(tilt)];
        }
        return { vx, vy, flick: rnd() };
      });
      return { at, kind, cx, peak, hue, parts, drift: (rnd() - 0.5) * 30 };
    });

    // 城市剪影
    const skyline: [number, number, number][] = [];
    for (let x = 0; x < 640; ) {
      const w = 18 + rnd() * 34;
      skyline.push([x, w, 12 + rnd() * 46]);
      x += w;
    }
    const windows = skyline.flatMap(([x, w, h]) =>
      Array.from({ length: Math.floor((w * h) / 140) }, () => [x + 3 + rnd() * (w - 6), WATER - h + 4 + rnd() * (h - 8)] as const),
    );

    const posAt = (s: (typeof shells)[number], p: { vx: number; vy: number }, b: number, cx: number, cy: number) => {
      const k = DRAG[s.kind];
      const f = (1 - Math.exp(-k * b)) / k;
      const x = cx + p.vx * f;
      const y = cy + p.vy * f + (GRAVITY[s.kind] / k) * (b - f);
      return [x, y] as const;
    };

    const render = (t: number) => {
      // 先算这一帧有多少烟花正在炸开，用来照亮天空
      let flash = 0;
      for (const s of shells) {
        const b = wrap(t, s.at, D) - LAUNCH;
        if (b >= 0 && b < 0.5) flash += 1 - b / 0.5;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const sky = ctx.createLinearGradient(0, 0, 0, WATER);
      sky.addColorStop(0, `rgb(${5 + flash * 10}, ${7 + flash * 8}, ${20 + flash * 18})`);
      sky.addColorStop(1, `rgb(${22 + flash * 18}, ${26 + flash * 14}, ${58 + flash * 22})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 640, WATER);

      ctx.globalCompositeOperation = 'lighter';
      for (const s of shells) {
        const tau = wrap(t, s.at, D);
        const life = LIFE[s.kind];
        if (tau > LAUNCH + life) continue;
        const cx = s.cx + s.drift;
        if (tau < LAUNCH) {
          // 升空：越往上越慢，拖一条渐暗的尾巴
          for (let i = 0; i < 8; i++) {
            const u = clamp((tau - i * 0.025) / LAUNCH);
            if (u <= 0) break;
            const x = s.cx + s.drift * easeOut(u);
            const y = WATER - (WATER - s.peak) * easeOut(u);
            ctx.fillStyle = `hsla(${s.hue}, 80%, 80%, ${(1 - i / 8) * 0.9})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.8 - i * 0.15, 0, TAU);
            ctx.fill();
          }
          continue;
        }
        const b = tau - LAUNCH;
        // 炸开瞬间的光晕
        if (b < 0.4) {
          const glow = ctx.createRadialGradient(cx, s.peak, 0, cx, s.peak, 110);
          glow.addColorStop(0, `hsla(${s.hue}, 90%, 72%, ${0.28 * (1 - b / 0.4)})`);
          glow.addColorStop(1, `hsla(${s.hue}, 90%, 72%, 0)`);
          ctx.fillStyle = glow;
          ctx.fillRect(cx - 110, s.peak - 110, 220, 220);
        }
        const fade = Math.pow(1 - b / life, 1.3);
        const trail = s.kind === 'willow' ? 0.4 : 0.14;
        ctx.lineWidth = s.kind === 'willow' ? 1.4 : 2.2;
        ctx.lineCap = 'round';
        s.parts.forEach((p, j) => {
          let a = fade;
          // 闪烁：后半段粒子随机一明一暗
          if (s.kind === 'crackle' && b > life * 0.45) a *= (Math.floor(b * 26 + p.flick * 13) + j) % 3 === 0 ? 1.4 : 0.15;
          if (a <= 0.01) return;
          const [x1, y1] = posAt(s, p, Math.max(0, b - trail), cx, s.peak);
          const [x2, y2] = posAt(s, p, b, cx, s.peak);
          const light = s.kind === 'willow' ? 66 : 64 + 28 * clamp(1 - b / 0.5);
          const hue = s.kind === 'willow' ? 40 : s.hue;
          ctx.strokeStyle = `hsla(${hue}, 92%, ${light}%, ${Math.min(1, a)})`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          // 粒子头部再点一个亮点
          ctx.fillStyle = `hsla(${hue}, 100%, 88%, ${Math.min(1, a) * 0.8})`;
          ctx.fillRect(x2 - 0.9, y2 - 0.9, 1.8, 1.8);
        });
      }

      // 城市剪影和零星的灯
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#04050c';
      for (const [x, w, h] of skyline) ctx.fillRect(x, WATER - h, w + 0.5, h);
      ctx.fillStyle = 'rgba(255, 210, 122, 0.55)';
      for (const [x, y] of windows) ctx.fillRect(x, y, 2, 2.5);

      // 水面：把水线上方的画面上下翻转、压扁、按行左右错开，做出波纹倒影
      const depth = 400 - WATER;
      for (let dy = 0; dy < depth; dy += 2) {
        const src = WATER - dy / 0.72 - 2.8;
        if (src < 0) break;
        const shift = 3 * Math.sin(dy * 0.35 + (TAU * t * 5) / D);
        ctx.globalAlpha = 0.72 * (1 - dy / depth);
        ctx.drawImage(canvas, 0, src * px, 640 * px, 2.8 * px, shift, WATER + dy, 640, 2);
      }
      ctx.globalAlpha = 1;
      const water = ctx.createLinearGradient(0, WATER, 0, 400);
      water.addColorStop(0, 'rgba(6, 9, 24, 0.35)');
      water.addColorStop(1, 'rgba(6, 9, 24, 0.9)');
      ctx.fillStyle = water;
      ctx.fillRect(0, WATER, 640, depth);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 4.2 });
  },
};
