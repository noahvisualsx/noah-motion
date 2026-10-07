// 呼吸：一层层同心圆跟着“吸气 / 呼气”缓慢扩张收缩，由内到外依次错开；
// 外圈虚线轻轻旋转，中间的字在“吸气”“呼气”之间换场。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, type SceneDef } from './util.ts';

const D = 8;
const RINGS = [
  { r: 46, fill: 'rgba(0,113,227,0.20)' },
  { r: 78, fill: 'rgba(0,113,227,0.13)' },
  { r: 112, fill: 'rgba(90,200,250,0.12)' },
  { r: 148, fill: 'rgba(90,200,250,0.08)' },
  { r: 186, fill: 'rgba(52,199,89,0.06)' },
];

export const breathe: SceneDef = {
  title: '呼吸',
  description: '同心圆跟着“吸气 / 呼气”缓慢扩张收缩，由内到外错开一点点，像水波一样柔和。',
  tags: ['spring', 'bounce = 0', 'stagger'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-breathe');
    injectCSS(
      'nm-breathe',
      `.nm-breathe{background:radial-gradient(60% 70% at 50% 50%,#eef5ff,#f4f4f1 70%)}
.nm-breathe svg{position:absolute;inset:0;width:640px;height:400px}
.nm-breathe .w{position:absolute;left:0;right:0;top:182px;text-align:center;font-size:26px;font-weight:600;letter-spacing:.06em}
.nm-breathe .w span{position:absolute;left:0;right:0}
.nm-breathe .c{position:absolute;left:0;right:0;top:220px;text-align:center;font-size:13px;color:#6e6e73;font-variant-numeric:tabular-nums;letter-spacing:.08em}`,
    );
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 640 400');
    stage.append(svg);
    const rings = RINGS.map((ring) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', '320');
      c.setAttribute('cy', '200');
      c.setAttribute('r', String(ring.r));
      c.setAttribute('fill', ring.fill);
      svg.append(c);
      return c;
    });
    const dash = document.createElementNS(NS, 'circle');
    Object.entries({ cx: '320', cy: '200', r: '196', fill: 'none', stroke: 'rgba(0,113,227,0.35)', 'stroke-width': '1.5', 'stroke-dasharray': '2 9', 'stroke-linecap': 'round' }).forEach(([k, v]) => dash.setAttribute(k, v));
    svg.append(dash);

    const word = el('div', 'w', stage);
    const inhale = el('span', '', word, options.text ?? '吸气');
    const exhale = el('span', '', word, '呼气');
    const counter = el('div', 'c', stage);

    // 很慢、不过冲的弹簧：吸气 0.4 秒起，呼气 4.4 秒起，每圈错开 0.12 秒
    const slow = spring({ duration: 2.6, bounce: 0 });
    const fade = spring({ duration: 0.6, bounce: 0 });
    const scales = RINGS.map((_, i) => track(0.82, [[0.4 + i * 0.12, 1.12, slow], [4.4 + i * 0.12, 0.82, slow]]));
    const inO = track(0, [[0.3, 1, fade], [4.2, 0, fade]]);
    const exO = track(0, [[4.4, 1, fade], [7.6, 0, fade]]);

    const render = (t: number) => {
      rings.forEach((c, i) => c.setAttribute('transform', `translate(320 200) scale(${scales[i]!(t)}) translate(-320 -200)`));
      dash.setAttribute('transform', `rotate(${(t / D) * 60} 320 200)`);
      dash.setAttribute('stroke-opacity', String(0.5 + 0.5 * clamp(scales[4]!(t) - 0.82, 0, 0.3) / 0.3));
      const a = clamp(inO(t));
      const b = clamp(exO(t));
      inhale.style.opacity = String(a);
      inhale.style.transform = `translateY(${(1 - a) * 8}px)`;
      exhale.style.opacity = String(b);
      exhale.style.transform = `translateY(${(1 - b) * 8}px)`;
      const phase = t < 4.4 ? t - 0.4 : t - 4.4;
      counter.textContent = t < 0.4 ? '' : `${Math.min(4, Math.max(1, Math.ceil(phase)))} / 4`;
      counter.style.opacity = String(Math.max(a, b));
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3 });
  },
};
