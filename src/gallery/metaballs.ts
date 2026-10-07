// 水滴合体：五颗水滴绕着中心转，半径被弹簧收拢到一起时融成一大滴，再弹开分离。
// 用“场”的方式画：每个像素累加各水滴的影响，超过阈值就是水；阈值附近做柔和过渡当作抗锯齿。
import { spring } from '../spring.ts';
import { track } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, TAU, type SceneDef } from './util.ts';

const D = 8;
const FW = 320; // 场的分辨率（再放大到 640×400）
const FH = 200;
const DROPS = [
  { size: 30, speed: 1, offset: 0 },
  { size: 24, speed: 1, offset: TAU / 5 },
  { size: 27, speed: 1, offset: (2 * TAU) / 5 },
  { size: 21, speed: 1, offset: (3 * TAU) / 5 },
  { size: 25, speed: 1, offset: (4 * TAU) / 5 },
];

export const metaballs: SceneDef = {
  title: '水滴合体',
  description: '五颗水滴绕着中心转，被弹簧收拢时融成一大滴，再带着回弹分开。',
  tags: ['spring', '场 + 阈值', 'canvas'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-meta');
    stage.style.background = 'radial-gradient(70% 80% at 50% 45%, #ffffff, #eceff5)';
    const { ctx } = createCanvas(stage, 1);
    const field = document.createElement('canvas');
    field.width = FW;
    field.height = FH;
    const fctx = field.getContext('2d')!;
    const img = fctx.createImageData(FW, FH);

    const pull = spring({ duration: 0.9, bounce: 0.1 });
    const pop = spring({ duration: 0.9, bounce: 0.38 });
    // 0.6 秒开始收拢，3.4 秒弹开，5.6 秒再收拢一点又放开，最后回到初始半径
    const radius = track(120, [[0.6, 0, pull], [3.4, 120, pop], [5.6, 70, pull], [6.6, 120, pop]]);

    const render = (t: number) => {
      const R = radius(t);
      const rot = (t / D) * TAU; // 整圈正好一个循环
      const s = FW / 640;
      const balls = DROPS.map((d) => {
        const a = rot * d.speed + d.offset;
        return { x: (320 + Math.cos(a) * R) * s, y: (200 + Math.sin(a) * R * 0.82) * s, r2: (d.size * s) ** 2 };
      });
      const data = img.data;
      for (let y = 0; y < FH; y++) {
        for (let x = 0; x < FW; x++) {
          let f = 0;
          for (const b of balls) {
            const dx = x - b.x;
            const dy = y - b.y;
            f += b.r2 / (dx * dx + dy * dy + 0.0001);
          }
          // 阈值 1，附近 0.94–1.06 之间柔和过渡，当作抗锯齿
          const a = Math.min(1, Math.max(0, (f - 0.94) / 0.12));
          const i = (y * FW + x) * 4;
          // 从上到下由蓝到紫
          const k = y / FH;
          data[i] = 40 + 120 * k;
          data[i + 1] = 110 - 40 * k;
          data[i + 2] = 255 - 20 * k;
          data[i + 3] = a * 255;
        }
      }
      fctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, 640, 400);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // 先画一层淡淡的投影，再画水滴本体
      ctx.save();
      ctx.filter = 'blur(10px)';
      ctx.globalAlpha = 0.16;
      ctx.drawImage(field, 0, 14, 640, 400);
      ctx.restore();
      ctx.drawImage(field, 0, 0, 640, 400);
      // 每颗水滴左上角一点高光，看起来有光泽
      for (const b of balls) {
        const r = Math.sqrt(b.r2) / s;
        const hx = b.x / s - r * 0.35;
        const hy = b.y / s - r * 0.4;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.55);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.2 });
  },
};
