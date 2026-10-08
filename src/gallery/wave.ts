// 波浪字：一行字被“拨”了三下，每一下都给波浪一个弹簧冲击，振幅带着回弹慢慢平息；
// 每个字沿波浪起伏，并且顺着波形的斜率转一点角度。最后完全静止，和开头一样。
import { spring } from '../spring.ts';
import { track, mixColor, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, TAU, type SceneDef } from './util.ts';

const D = 6;

export const wave: SceneDef = {
  title: '波浪字',
  category: '文字',
  description: '一行字被拨了三下，每一下都是一次弹簧冲击，波浪带着回弹慢慢平息，字顺着波形倾斜。',
  tags: ['track 叠加冲击', 'spring', 'mixColor'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-wave');
    injectCSS(
      'nm-wave',
      `.nm-wave{background:radial-gradient(80% 90% at 50% 100%,#e9f1ff,#f6f5f1 70%)}
.nm-wave .line{position:absolute;left:0;right:0;top:170px;text-align:center;white-space:nowrap;font-size:48px;font-weight:800;letter-spacing:-.01em}
.nm-wave .line span{display:inline-block;transform-origin:50% 70%}
.nm-wave .hint{position:absolute;left:0;right:0;top:282px;text-align:center;font-size:13px;color:#86868b;letter-spacing:.12em}
.nm-wave .tap{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #0071e3;opacity:0}`,
    );
    const line = el('div', 'line', stage);
    const text = options.text ?? '每个人都有自己的闪光点';
    const chars = [...text].map((ch) => el('span', '', line, ch));
    el('div', 'hint', stage, '弹簧冲击 × 3');
    const taps = [0, 1, 2].map(() => el('div', 'tap', stage));

    // 三次“拨动”：振幅突然被推高，然后弹簧带着回弹回到 0
    const jelly = spring({ duration: 0.9, bounce: 0.45 });
    const KICKS = [
      { at: 0.5, power: 34, x: 150 },
      { at: 2.1, power: 26, x: 470 },
      { at: 3.6, power: 18, x: 320 },
    ];
    const amp = track(
      0,
      KICKS.flatMap((k) => [
        [k.at, k.power, jelly] as const,
        [k.at + 0.08, 0, jelly] as const,
      ]),
    );
    const tapAnim = KICKS.map((k) => track(0, [[k.at - 0.05, 1, spring({ duration: 0.25 })], [k.at + 0.25, 0, spring({ duration: 0.5 })]]));

    const n = chars.length;
    const render = (t: number) => {
      const a = amp(t);
      const phase = (t / 1.5) * TAU; // 1.5 秒一个周期，6 秒正好 4 个周期
      chars.forEach((c, i) => {
        const x = i / Math.max(1, n - 1);
        const arg = x * TAU * 1.2 - phase;
        const y = Math.sin(arg) * a;
        const slope = Math.cos(arg) * a * (TAU * 1.2) / (n * 0.9);
        c.style.transform = `translateY(${y}px) rotate(${Math.atan(slope / 40) * 57}deg)`;
        c.style.color = mixColor('#1d1d1f', '#0071e3', clamp(Math.abs(y) / 28));
      });
      taps.forEach((tap, i) => {
        const k = KICKS[i]!;
        const p = clamp(tapAnim[i]!(t));
        tap.style.left = `${k.x}px`;
        tap.style.top = '150px';
        tap.style.opacity = String(p);
        tap.style.transform = `scale(${1 + (1 - p) * 1.6})`;
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 0.6 });
  },
};
