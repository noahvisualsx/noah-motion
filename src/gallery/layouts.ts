// 布局变换：12 张卡片在“一摞 → 网格 → 圆环 → 波浪线 → 一摞”之间变换。
// 每张卡的位置、角度、大小各是一条轨道，换布局时按序号错开出发，所以像一群有先后的小东西在走位。
import { spring } from '../spring.ts';
import { track } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, seeded, TAU, type SceneDef } from './util.ts';

const D = 11;
const N = 12;
const CARD = 64;
const COLORS = [
  ['#0071e3', '#5ac8fa'],
  ['#ff375f', '#ff9f0a'],
  ['#30d158', '#64d2ff'],
  ['#bf5af2', '#ff375f'],
  ['#ff9f0a', '#ffd60a'],
  ['#5e5ce6', '#0071e3'],
  ['#1d1d1f', '#48484a'],
  ['#ff6482', '#bf5af2'],
  ['#64d2ff', '#30d158'],
  ['#ffd60a', '#ff9f0a'],
  ['#0a84ff', '#5e5ce6'],
  ['#ac8e68', '#ffd60a'],
];

type Pose = { x: number; y: number; r: number; s: number };

export const layouts: SceneDef = {
  title: '布局变换',
  category: '界面',
  description: '12 张卡片在一摞、网格、圆环、波浪线之间变换，每张按序号错开出发，像一群有先后的小东西在走位。',
  tags: ['track × 48', 'stagger', 'spring'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-layouts');
    injectCSS(
      'nm-layouts',
      `.nm-layouts{background:radial-gradient(70% 80% at 50% 40%,#fff,#efeee9)}
.nm-layouts .c{position:absolute;left:${-CARD / 2}px;top:${-CARD / 2}px;width:${CARD}px;height:${CARD}px;border-radius:16px;box-shadow:0 8px 18px rgba(0,0,0,.14);display:grid;place-items:center;color:#fff;font-size:15px;font-weight:700}
.nm-layouts .label{position:absolute;left:0;right:0;top:374px;text-align:center;font-size:12px;letter-spacing:.24em;color:#86868b;font-weight:600}`,
    );
    const cards = Array.from({ length: N }, (_, i) => {
      const c = el('div', 'c', stage, String(i + 1));
      const [a, b] = COLORS[i]!;
      c.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      return c;
    });
    const label = el('div', 'label', stage);
    const rnd = seeded(11);

    const pile: Pose[] = cards.map(() => ({ x: 320 + (rnd() - 0.5) * 20, y: 196 + (rnd() - 0.5) * 16, r: (rnd() - 0.5) * 28, s: 1.25 }));
    const grid: Pose[] = cards.map((_, i) => ({ x: 320 + ((i % 4) - 1.5) * 84, y: 196 + (Math.floor(i / 4) - 1) * 84, r: 0, s: 1 }));
    const ring: Pose[] = cards.map((_, i) => {
      const a = (i / N) * TAU - Math.PI / 2;
      return { x: 320 + Math.cos(a) * 136, y: 196 + Math.sin(a) * 136, r: (a * 180) / Math.PI + 90, s: 0.86 };
    });
    const line: Pose[] = cards.map((_, i) => ({ x: 320 + (i - (N - 1) / 2) * 46, y: 196 + Math.sin(i * 0.9) * 46, r: Math.cos(i * 0.9) * 22, s: 0.72 }));

    const STEPS: { at: number; pose: Pose[]; name: string }[] = [
      { at: 0.8, pose: grid, name: 'GRID · 网格' },
      { at: 3.4, pose: ring, name: 'RING · 圆环' },
      { at: 6.0, pose: line, name: 'WAVE · 波浪' },
      { at: 8.6, pose: pile, name: 'PILE · 一摞' },
    ];
    const move = spring({ duration: 0.75, bounce: 0.24 });
    const tracks = cards.map((_, i) => {
      const keys = (k: keyof Pose) => STEPS.map((st) => [st.at + i * 0.04, st.pose[i]![k], move] as const);
      return { x: track(pile[i]!.x, keys('x')), y: track(pile[i]!.y, keys('y')), r: track(pile[i]!.r, keys('r')), s: track(pile[i]!.s, keys('s')) };
    });

    const render = (t: number) => {
      // 圆环阶段整体缓慢转动
      const spin = t > 3.4 && t < 6.6 ? Math.sin(((t - 3.4) / 3.2) * Math.PI) * 18 : 0;
      cards.forEach((c, i) => {
        const tr = tracks[i]!;
        let x = tr.x(t) - 320;
        let y = tr.y(t) - 196;
        const a = (spin * Math.PI) / 180;
        [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
        c.style.transform = `translate(${x + 320}px, ${y + 196}px) rotate(${tr.r(t) + spin}deg) scale(${tr.s(t)})`;
        c.style.zIndex = String(t < 0.8 || t > 8.6 ? i : N - Math.abs(i - N / 2));
      });
      const cur = [...STEPS].reverse().find((st) => t >= st.at) ?? STEPS[STEPS.length - 1]!;
      label.textContent = cur.name;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 2.4 });
  },
};
