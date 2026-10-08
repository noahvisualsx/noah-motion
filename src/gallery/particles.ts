// 粒子成字：上千个粒子从四散的位置，按从左到右的波浪依次聚成文字；
// 停留后炸开，按黄金角排成向日葵式的螺旋盘并整体旋转，最后回到最初的散落位置，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, seeded, TAU, type SceneDef } from './util.ts';

const D = 9;

/** 把文字画到离屏 canvas 上，按网格取出有笔画的点 */
function sampleText(text: string, step = 5) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const g = c.getContext('2d')!;
  let size = 170;
  g.font = `800 ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  while (g.measureText(text).width > 560 && size > 40) {
    size -= 6;
    g.font = `800 ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 320, 205);
  const data = g.getImageData(0, 0, 640, 400).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < 400; y += step) {
    for (let x = 0; x < 640; x += step) {
      if ((data[(y * 640 + x) * 4 + 3] ?? 0) > 128) pts.push([x, y]);
    }
  }
  return pts;
}

export const particles: SceneDef = {
  title: '粒子成字',
  category: '文字',
  description: '上千个粒子按从左到右的波浪聚成文字，再按黄金角炸成一个旋转的螺旋盘，最后散回原处。',
  tags: ['track', 'spring', '每个粒子一条轨道'],
  tone: 'dark',
  en: {
    title: 'Particle text',
    description: 'Over a thousand particles sweep left to right into a word, burst into a spinning golden-angle spiral, then drift back home.',
    tags: ['track', 'spring', 'one path per particle'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-particles');
    const { ctx } = createCanvas(stage);
    let pts = sampleText(options.text ?? 'noah');
    // 点太多时均匀抽稀，控制在 1400 个以内
    if (pts.length > 1400) {
      const k = pts.length / 1400;
      pts = Array.from({ length: 1400 }, (_, i) => pts[Math.floor(i * k)]!);
    }
    const rnd = seeded(42);
    const gather = spring({ duration: 0.9, bounce: 0.18 });
    const burst = spring({ duration: 0.75, bounce: 0.28 });
    const home = spring({ duration: 1.1, bounce: 0.05 });

    const items = pts.map(([tx, ty], i) => {
      // 散落位置：舞台四周的柔和分布
      const a = rnd() * TAU;
      const d = 180 + rnd() * 260;
      const sx = 320 + Math.cos(a) * d;
      const sy = 200 + Math.sin(a) * d * 0.7;
      // 螺旋盘位置：第 i 个粒子转过 i 个黄金角（≈137.5°），半径按 √i 增长，排出向日葵花盘的纹路
      const ga = i * 2.399963;
      const rr = 168 * Math.sqrt((i + 0.5) / pts.length);
      const cx = 320 + Math.cos(ga) * rr;
      const cy = 200 + Math.sin(ga) * rr;
      const wave = (tx / 640) * 0.9; // 从左到右依次出发
      const t1 = 0.5 + wave + rnd() * 0.12;
      const t2 = 4.6 + rnd() * 0.15;
      const t3 = 6.9 + (1 - tx / 640) * 0.5;
      return {
        x: track(sx, [[t1, tx, gather], [t2, cx, burst], [t3, sx, home]]),
        y: track(sy, [[t1, ty, gather], [t2, cy, burst], [t3, sy, home]]),
        hue: mix(205, 330, tx / 640),
        size: 2.2 + rnd() * 1.4,
      };
    });

    const render = (t: number) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, 640, 400);
      // 叠加混合：粒子重叠的地方更亮，像在发光
      ctx.globalCompositeOperation = 'lighter';
      // 螺旋盘阶段整体慢慢转
      const spin = clamp((t - 4.6) / 2.2) * (1 - clamp((t - 6.9) / 0.6)) * 1.4;
      const cos = Math.cos(spin);
      const sin = Math.sin(spin);
      for (const p of items) {
        let x = p.x(t) - 320;
        let y = p.y(t) - 200;
        [x, y] = [x * cos - y * sin, x * sin + y * cos];
        ctx.fillStyle = `hsl(${p.hue} 95% 62% / 0.85)`;
        ctx.fillRect(x + 320 - p.size / 2, y + 200 - p.size / 2, p.size, p.size);
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.6 });
  },
};
