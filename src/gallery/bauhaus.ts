// 几何构成：包豪斯风格的配色和几何形。圆、半圆、三角、色条、小圆点从画面外带着旋转飞进来，
// 拼成一幅构图；停留时整幅画轻轻呼吸，最后各自朝不同方向退场。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, type SceneDef } from './util.ts';

const D = 8;

type Shape = {
  cls: string;
  x: number;
  y: number;
  r: number; // 最终角度
  from: [number, number, number]; // 进场起点 dx, dy, 旋转
  to: [number, number, number]; // 退场终点
  at: number;
};

const SHAPES: Shape[] = [
  { cls: 'sun', x: 250, y: 176, r: 0, from: [-260, -40, -90], to: [-300, 0, -120], at: 0.4 },
  { cls: 'half', x: 386, y: 238, r: 0, from: [260, 60, 180], to: [300, 40, 160], at: 0.62 },
  { cls: 'tri', x: 414, y: 118, r: 0, from: [80, -240, 120], to: [60, -260, 140], at: 0.84 },
  { cls: 'bar', x: 300, y: 300, r: -8, from: [-40, 220, -60], to: [-60, 240, -70], at: 1.02 },
  { cls: 'dot', x: 196, y: 286, r: 0, from: [-200, 160, 0], to: [-220, 170, 0], at: 1.2 },
  { cls: 'quarter', x: 470, y: 300, r: 0, from: [220, 160, 90], to: [240, 170, 120], at: 1.36 },
  { cls: 'ring', x: 168, y: 112, r: 0, from: [-180, -200, 0], to: [-200, -200, 0], at: 1.5 },
];

export const bauhaus: SceneDef = {
  title: '几何构成',
  description: '包豪斯风格：圆、半圆、三角、色条从画面外带着旋转飞进来拼成一幅构图，停留时轻轻呼吸，再各自退场。',
  tags: ['track', 'spring', '构图'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-bauhaus');
    injectCSS(
      'nm-bauhaus',
      `.nm-bauhaus{background:#f2ece0}
.nm-bauhaus .s{position:absolute;left:0;top:0}
.nm-bauhaus .sun{width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;background:#e8a923}
.nm-bauhaus .half{width:170px;height:85px;margin:-42px 0 0 -85px;border-radius:85px 85px 0 0;background:#d4432c}
.nm-bauhaus .tri{width:0;height:0;margin:-60px 0 0 -58px;border-left:58px solid transparent;border-right:58px solid transparent;border-bottom:104px solid #2349a8}
.nm-bauhaus .bar{width:250px;height:20px;margin:-10px 0 0 -125px;background:#1d1d1f}
.nm-bauhaus .dot{width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#1d1d1f}
.nm-bauhaus .quarter{width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:90px 0 0 0;background:#2349a8}
.nm-bauhaus .ring{width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:9px solid #d4432c}
.nm-bauhaus .cap{position:absolute;right:34px;bottom:28px;font-size:12px;font-weight:700;letter-spacing:.3em;color:#1d1d1f}`,
    );
    const fly = spring({ duration: 0.85, bounce: 0.22 });
    const leave = spring({ duration: 0.7, bounce: 0 });
    const shapes = SHAPES.map((sh, i) => {
      const node = el('div', `s ${sh.cls}`, stage);
      const out = 5.9 + i * 0.07;
      return {
        node,
        sh,
        p: track(0, [[sh.at, 1, fly], [out, 2, leave]]),
        o: track(0, [[sh.at, 1, spring({ duration: 0.3 })], [out + 0.25, 0, leave]]),
      };
    });
    const cap = el('div', 'cap', stage, options.text ?? 'FORM · 构成');
    const capO = track(0, [[1.9, 1, fly], [5.8, 0, leave]]);

    const render = (t: number) => {
      // 停留阶段整幅画轻轻呼吸（2.4–5.6 秒）
      const breathe = Math.sin(clamp((t - 2.4) / 3.2) * Math.PI) * 0.03;
      for (const { node, sh, p, o } of shapes) {
        const k = p(t);
        // k: 0 → 1 进场（从 from 到终点），1 → 2 退场（从终点到 to）
        const [fx, fy, fr] = k <= 1 ? sh.from : sh.to;
        const w = k <= 1 ? 1 - k : k - 1;
        const x = sh.x + fx * w;
        const y = sh.y + fy * w;
        const r = sh.r + fr * w;
        node.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${1 + breathe})`;
        node.style.opacity = String(clamp(o(t)));
      }
      const c = clamp(capO(t));
      cap.style.opacity = String(c);
      cap.style.letterSpacing = `${0.3 + (1 - c) * 0.4}em`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.5 });
  },
};
