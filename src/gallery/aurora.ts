// 极光标题：几团彩色光晕沿各自的轨迹缓慢流动（周期都能整除总时长，所以无缝循环），
// 标题逐字从模糊中升起，停留后再逐字沉下去。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, injectCSS, TAU, type SceneDef } from './util.ts';

const D = 9;
const BLOBS = [
  { color: [58, 123, 255], r: 230, cx: 210, cy: 170, ax: 120, ay: 60, fx: 1, fy: 2, p: 0 },
  { color: [168, 85, 247], r: 210, cx: 430, cy: 230, ax: 110, ay: 70, fx: 2, fy: 1, p: 1.3 },
  { color: [255, 94, 138], r: 180, cx: 330, cy: 300, ax: 150, ay: 40, fx: 1, fy: 1, p: 2.4 },
  { color: [34, 211, 238], r: 170, cx: 500, cy: 110, ax: 90, ay: 50, fx: 3, fy: 2, p: 4.1 },
];

export const aurora: SceneDef = {
  title: '极光标题',
  category: '文字',
  description: '几团彩色光晕沿各自的轨迹缓慢流动，标题逐字从模糊里升起，再逐字沉下去。',
  tags: ['track', 'stagger', 'canvas'],
  tone: 'dark',
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-aurora');
    injectCSS(
      'nm-aurora',
      `.nm-aurora .t{position:absolute;left:0;right:0;top:150px;text-align:center;font-size:68px;font-weight:700;letter-spacing:-.035em;white-space:nowrap}
.nm-aurora .t span{display:inline-block;will-change:transform}
.nm-aurora .s{position:absolute;left:0;right:0;top:248px;text-align:center;font-size:15px;color:rgba(245,245,247,.62);letter-spacing:.24em}`,
    );
    const { ctx } = createCanvas(stage, 1);
    const title = el('div', 't', stage);
    const chars = [...(options.text ?? 'noah-motion')].map((ch) => el('span', '', title, ch));
    const sub = el('div', 's', stage, 'SPRINGS · TIMELINES · FRAMES');

    const rise = spring({ duration: 0.8, bounce: 0.12 });
    const sink = spring({ duration: 0.7, bounce: 0 });
    const per = chars.map((_, i) => {
      const tin = 0.5 + i * 0.07;
      const tout = 6.9 + i * 0.045;
      return track(0, [[tin, 1, rise], [tout, 0, sink]]);
    });
    const subIn = track(0, [[1.6, 1, rise], [6.7, 0, sink]]);

    const render = (t: number) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, 640, 400);
      ctx.globalCompositeOperation = 'screen';
      const phase = (t / D) * TAU;
      for (const b of BLOBS) {
        const x = b.cx + b.ax * Math.sin(phase * b.fx + b.p);
        const y = b.cy + b.ay * Math.cos(phase * b.fy + b.p * 0.7);
        const r = b.r * (1 + 0.08 * Math.sin(phase * 2 + b.p));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const [cr, cg, cb] = b.color;
        g.addColorStop(0, `rgba(${cr},${cg},${cb},0.62)`);
        g.addColorStop(0.55, `rgba(${cr},${cg},${cb},0.18)`);
        g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 640, 400);
      }
      chars.forEach((c, i) => {
        const p = per[i]!(t);
        const k = clamp(p);
        c.style.opacity = String(k);
        c.style.transform = `translateY(${(1 - p) * 36}px)`;
        c.style.filter = k < 0.999 ? `blur(${(1 - k) * 10}px)` : 'none';
      });
      const s = subIn(t);
      sub.style.opacity = String(clamp(s));
      sub.style.letterSpacing = `${0.24 + (1 - clamp(s)) * 0.3}em`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.5 });
  },
};
