// 万花筒：只画一片 30° 的扇区——几个半透明的圆点、三角和弧线沿各自的周期轨迹移动；
// 再把这一片旋转复制、隔一片镜像一次，拼成 12 瓣的对称图案，整体缓慢旋转。所有周期都能整除总时长。
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, TAU, type SceneDef } from './util.ts';

const D = 12;
const SLICES = 12;
const SHARDS = [
  { kind: 'petal', r0: 30, r1: 120, f: 1, a: 0.05, size: 26, hue: 320 },
  { kind: 'dot', r0: 40, r1: 150, f: 1, a: 0.12, size: 14, hue: 200 },
  { kind: 'dot', r0: 90, r1: 175, f: 2, a: 0.32, size: 9, hue: 280 },
  { kind: 'tri', r0: 60, r1: 140, f: 1, a: 0.25, size: 18, hue: 330 },
  { kind: 'arc', r0: 110, r1: 165, f: 3, a: 0.18, size: 30, hue: 170 },
  { kind: 'dot', r0: 20, r1: 80, f: 3, a: 0.4, size: 6, hue: 45 },
  { kind: 'ray', r0: 50, r1: 185, f: 2, a: 0.47, size: 1.5, hue: 260 },
  { kind: 'petal', r0: 140, r1: 190, f: 2, a: 0.6, size: 14, hue: 190 },
  { kind: 'dot', r0: 160, r1: 195, f: 1, a: 0.75, size: 4, hue: 55 },
] as const;

export const kaleido: SceneDef = {
  title: '万花筒',
  category: '图形',
  description: '只画一片 30° 的扇区，再旋转复制、隔片镜像成 12 瓣，几个图形沿周期轨迹移动，整体缓慢旋转。',
  tags: ['timeline', 'loop', '对称'],
  tone: 'dark',
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-kaleido');
    const { ctx } = createCanvas(stage);
    const wedge = TAU / SLICES;

    const drawShards = (t: number) => {
      const ph = (t / D) * TAU;
      for (const s of SHARDS) {
        const r = s.r0 + (s.r1 - s.r0) * (0.5 + 0.5 * Math.sin(ph * s.f + s.a * 10));
        const a = wedge * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(ph * s.f * 2 + s.a * 7)));
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const hue = s.hue + 30 * Math.sin(ph + s.a * 5);
        ctx.fillStyle = `hsla(${hue}, 90%, 62%, 0.55)`;
        ctx.strokeStyle = `hsla(${hue}, 90%, 70%, 0.7)`;
        if (s.kind === 'dot') {
          ctx.beginPath();
          ctx.arc(x, y, s.size * (0.8 + 0.3 * Math.sin(ph * 2 + s.a * 9)), 0, TAU);
          ctx.fill();
        } else if (s.kind === 'tri') {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ph * 2);
          ctx.beginPath();
          ctx.moveTo(0, -s.size);
          ctx.lineTo(s.size * 0.87, s.size * 0.5);
          ctx.lineTo(-s.size * 0.87, s.size * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (s.kind === 'petal') {
          // 沿半径方向的细长花瓣
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a + Math.sin(ph * 2 + s.a * 4) * 0.5);
          ctx.beginPath();
          ctx.ellipse(0, 0, s.size, s.size * 0.32, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        } else if (s.kind === 'ray') {
          ctx.lineWidth = s.size;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s.r0 * 0.5, Math.sin(a) * s.r0 * 0.5);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, r, a - 0.12, a + 0.12);
          ctx.stroke();
        }
      }
    };

    const render = (t: number) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#06060a';
      ctx.fillRect(0, 0, 640, 400);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(320, 200);
      ctx.rotate((t / D) * (TAU / SLICES) * 2); // 一轮转过两片，首尾图案一致
      for (let i = 0; i < SLICES; i++) {
        ctx.save();
        ctx.rotate(i * wedge);
        if (i % 2) {
          ctx.rotate(wedge);
          ctx.scale(1, -1); // 隔一片镜像
        }
        drawShards(t);
        ctx.restore();
      }
      ctx.restore();
      // 暗角，让图案收在圆里
      ctx.globalCompositeOperation = 'source-over';
      const v = ctx.createRadialGradient(320, 200, 120, 320, 200, 330);
      v.addColorStop(0, 'rgba(6,6,10,0)');
      v.addColorStop(1, 'rgba(6,6,10,0.95)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 640, 400);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 2 });
  },
};
