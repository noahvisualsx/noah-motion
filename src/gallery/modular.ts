// 乘法弦图：圆周上 180 个点，第 i 个点连到第 i × k 个点（超过 180 就绕回来）。
// k 从 2 慢慢走到 7，每到一个整数停一下，画面依次变成心脏线、肾形线和各种外摆线；最后穿过一片混沌回到 2。
import { timeline } from '../timeline.ts';
import { clamp } from '../track.ts';
import { easeInOut } from '../easing.ts';
import { createStage, createCanvas, el, injectCSS, TAU, type SceneDef } from './util.ts';

const D = 16;
const N = 180;
const R = 160;
const CX = 380;
const CY = 200;

/** k 随时间的变化：在 2、3、4、5、6、7 各停一秒，再用 5 秒滑回 2 */
function kAt(t: number) {
  if (t < 0.5) return 2;
  let s = t - 0.5;
  let k = 2;
  for (let i = 0; i < 5; i++) {
    if (s < 1) return k + easeInOut(s);
    s -= 1;
    k += 1;
    if (s < 1) return k;
    s -= 1;
  }
  // 这时 s 从 0 开始，5 秒内从 7 回到 2，最后半秒停在 2
  return s < 5 ? 7 - 5 * easeInOut(s / 5) : 2;
}

const NAMES_ZH: Record<number, string> = { 2: '心脏线', 3: '肾形线' };
const NAMES_EN: Record<number, string> = { 2: 'Cardioid', 3: 'Nephroid' };

export const modular: SceneDef = {
  title: '乘法弦图',
  category: '图形',
  description: '圆周上 180 个点，第 i 个连到第 i × k 个。k 从 2 走到 7，依次停在心脏线、肾形线和各种外摆线上。',
  tags: ['timeline', 'canvas', '数学'],
  tone: 'dark',
  en: {
    title: 'Times-table circle',
    description: 'Point i on a circle of 180 connects to point i × k. As k walks from 2 to 7 it pauses on a cardioid, a nephroid and a run of epicycloids.',
    tags: ['timeline', 'canvas', 'math'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'dark', 'nm-mod');
    injectCSS(
      'nm-mod',
      `.nm-mod{background:radial-gradient(70% 90% at 60% 50%,#151828,#06070b)}
.nm-mod .k{position:absolute;left:40px;top:120px;font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:13px;letter-spacing:.12em;color:#8e8e93}
.nm-mod .v{position:absolute;left:40px;top:142px;font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:44px;font-weight:700;color:#f5f5f7;font-variant-numeric:tabular-nums}
.nm-mod .name{position:absolute;left:40px;top:204px;font-size:16px;font-weight:600;color:#9ad1ff}
.nm-mod .rule{position:absolute;left:40px;top:250px;width:150px;font-size:12px;line-height:1.6;color:#8e8e93}`,
    );
    const { ctx } = createCanvas(stage);
    el('div', 'k', stage, 'k =');
    const v = el('div', 'v', stage);
    const name = el('div', 'name', stage);
    el('div', 'rule', stage, en ? 'Each point i connects to i × k (mod 180)' : '每个点 i 连到 i × k，超过 180 就绕回来');

    const point = (x: number, rot: number) => {
      const a = (TAU * x) / N + rot - Math.PI / 2;
      return [CX + Math.cos(a) * R, CY + Math.sin(a) * R] as const;
    };

    const render = (t: number) => {
      const k = kAt(t);
      const rot = (TAU * t) / D; // 每轮正好转一圈
      ctx.clearRect(0, 0, 640, 400);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < N; i++) {
        const [x1, y1] = point(i, rot);
        const [x2, y2] = point(i * k, rot);
        const hue = 190 + 150 * (i / N);
        ctx.strokeStyle = `hsla(${hue}, 85%, 62%, 0.42)`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < N; i += 3) {
        const [x, y] = point(i, rot);
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, TAU);
        ctx.fill();
      }
      v.textContent = k.toFixed(2);
      // 停在整数上时显示曲线的名字
      const n = Math.round(k);
      const near = clamp(1 - Math.abs(k - n) / 0.08);
      name.textContent = (en ? NAMES_EN : NAMES_ZH)[n] ?? (en ? `${n - 1}-cusped epicycloid` : `${n - 1} 尖外摆线`);
      name.style.opacity = String(near);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 0.2 });
  },
};
