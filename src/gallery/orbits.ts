// 星轨：深色星空里，几颗星体沿倾斜的椭圆轨道运行，拖着渐隐的尾迹。
// 每条轨道的周期都能整除总时长，所以整段是一个无缝循环；尾迹是对过去 0.8 秒位置的采样。
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, seeded, TAU, type SceneDef } from './util.ts';

const D = 12;
const BODIES = [
  { a: 70, b: 34, period: 3, tilt: -0.35, size: 4, color: [255, 214, 10] },
  { a: 128, b: 62, period: 4, tilt: -0.35, size: 5.5, color: [90, 200, 250] },
  { a: 186, b: 92, period: 6, tilt: -0.35, size: 4.5, color: [255, 100, 130] },
  { a: 246, b: 120, period: 12, tilt: -0.35, size: 6.5, color: [191, 90, 242] },
  { a: 160, b: 150, period: 12, tilt: 0.9, size: 3.5, color: [48, 209, 88] },
];

export const orbits: SceneDef = {
  title: '星轨',
  category: '图形',
  description: '几颗星体沿倾斜的椭圆轨道运行，拖着渐隐的尾迹。每条轨道的周期都能整除总时长，整段无缝循环。',
  tags: ['timeline', 'loop', 'canvas'],
  tone: 'dark',
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-orbits');
    const { ctx } = createCanvas(stage);
    const rnd = seeded(5);
    const stars = Array.from({ length: 140 }, () => ({ x: rnd() * 640, y: rnd() * 400, r: rnd() * 1.1 + 0.2, tw: rnd() * TAU }));

    const pos = (b: (typeof BODIES)[number], t: number) => {
      const a = (t / b.period) * TAU;
      const x = Math.cos(a) * b.a;
      const y = Math.sin(a) * b.b;
      return [320 + x * Math.cos(b.tilt) - y * Math.sin(b.tilt), 200 + x * Math.sin(b.tilt) + y * Math.cos(b.tilt)] as const;
    };

    const render = (t: number) => {
      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, 640, 400);
      for (const s of stars) {
        const tw = 0.45 + 0.35 * Math.sin((t / D) * TAU * 3 + s.tw);
        ctx.fillStyle = `rgba(255,255,255,${tw})`;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      // 中心发光
      const g = ctx.createRadialGradient(320, 200, 0, 320, 200, 70);
      g.addColorStop(0, 'rgba(255,240,210,0.95)');
      g.addColorStop(0.18, 'rgba(255,200,120,0.45)');
      g.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(250, 130, 140, 140);

      for (const b of BODIES) {
        // 轨道线
        ctx.save();
        ctx.translate(320, 200);
        ctx.rotate(b.tilt);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.a, b.b, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
        // 尾迹：过去 0.8 秒的位置，越早越淡越细
        const [cr, cg, cb] = b.color;
        const steps = 28;
        for (let k = steps; k > 0; k--) {
          const [x0, y0] = pos(b, t - (k / steps) * 0.8);
          const [x1, y1] = pos(b, t - ((k - 1) / steps) * 0.8);
          const f = 1 - k / steps;
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${f * 0.7})`;
          ctx.lineWidth = b.size * f;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        const [x, y] = pos(b, t);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, b.size * 3.5);
        glow.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
        glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(x - b.size * 4, y - b.size * 4, b.size * 8, b.size * 8);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, b.size * 0.55, 0, TAU);
        ctx.fill();
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 2 });
  },
};
