// 涟漪点阵：点阵上先后落下四滴“雨”，每滴在落点处激起一个弹簧脉冲，按距离延迟向外扩散；
// 多圈涟漪相遇时直接叠加。每个点的大小和颜色都只由时间和它到落点的距离决定。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, type SceneDef } from './util.ts';

const D = 7;
const COLS = 23;
const ROWS = 14;
const GAP = 26;
const SPEED = 260; // 涟漪扩散速度（像素 / 秒）
const DROPS = [
  { at: 0.4, x: 200, y: 150, power: 1 },
  { at: 1.5, x: 460, y: 260, power: 0.9 },
  { at: 2.7, x: 320, y: 120, power: 0.8 },
  { at: 3.8, x: 150, y: 300, power: 0.7 },
];

export const ripple: SceneDef = {
  title: '涟漪点阵',
  category: '图形',
  description: '点阵上落下四滴雨，每滴激起一个弹簧脉冲按距离向外扩散，几圈涟漪相遇时自然叠加。',
  tags: ['spring 脉冲', '按距离延迟', 'canvas'],
  tone: 'dark',
  en: {
    title: 'Ripple grid',
    description: 'Four raindrops land on a grid of dots. Each one sends a spring pulse outward by distance, and the rings add up where they meet.',
    tags: ['spring pulses', 'distance delay', 'canvas'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-ripple');
    const { ctx } = createCanvas(stage);
    // 一个“脉冲”= 往上推一下、马上放回，弹簧带出回弹的余波
    const jelly = spring({ duration: 0.5, bounce: 0.5 });
    const pulse = track(0, [[0, 1, jelly], [0.12, 0, jelly]]);
    const ox = 320 - ((COLS - 1) * GAP) / 2;
    const oy = 200 - ((ROWS - 1) * GAP) / 2;
    const dots: { x: number; y: number; delays: number[] }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = ox + c * GAP;
        const y = oy + r * GAP;
        dots.push({ x, y, delays: DROPS.map((d) => d.at + Math.hypot(x - d.x, y - d.y) / SPEED) });
      }
    }
    const fall = DROPS.map((d) => track(0, [[d.at - 0.35, 1, spring({ duration: 0.35 })], [d.at, 0, spring({ duration: 0.2 })]]));

    const render = (t: number) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#08080b';
      ctx.fillRect(0, 0, 640, 400);
      ctx.globalCompositeOperation = 'lighter'; // 波峰叠在一起时更亮
      for (const p of dots) {
        let e = 0;
        for (let i = 0; i < DROPS.length; i++) {
          const local = t - p.delays[i]!;
          if (local > 0 && local < 2.5) e += pulse(local) * DROPS[i]!.power * Math.max(0.25, 1 - (local * SPEED) / 900);
        }
        const k = clamp(Math.abs(e) * 1.4);
        const r = 2.2 + e * 3.6;
        ctx.fillStyle = `rgb(${Math.round(58 + 40 * k)}, ${Math.round(60 + 140 * k)}, ${Math.round(70 + 185 * k)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y - e * 6, Math.max(0.8, r), 0, Math.PI * 2);
        ctx.fill();
      }
      // 雨滴落下的那一下：一个小亮点从上方落到落点
      DROPS.forEach((d, i) => {
        const f = clamp(fall[i]!(t));
        if (f <= 0.01) return;
        ctx.fillStyle = `rgba(160, 210, 255, ${f})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y - f * 40, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 1.6 });
  },
};
