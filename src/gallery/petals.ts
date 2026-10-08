// 樱花雨：花瓣带着左右摆动和翻转缓缓飘落，近处的大而快，远处的小而慢。
// 每片花瓣的下落速度、横向漂移都是“总时长内走整数圈”，所以永远在下、却能无缝循环。
import { timeline } from '../timeline.ts';
import { clamp } from '../track.ts';
import { createStage, createCanvas, el, injectCSS, seeded, TAU, type SceneDef } from './util.ts';

const D = 10;
const COUNT = 70;

export const petals: SceneDef = {
  title: '樱花雨',
  category: '插画',
  description: '花瓣带着摆动和翻转缓缓飘落，近处大而快、远处小而慢。每片的轨迹都是周期的，永远在下，却能无缝循环。',
  tags: ['timeline', 'loop', '景深'],
  tone: 'light',
  en: {
    title: 'Blossom rain',
    description: 'Petals sway and tumble as they fall, big and quick up close, small and slow far away. Every path is periodic, so they fall forever yet loop seamlessly.',
    tags: ['timeline', 'loop', 'depth'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-petals');
    injectCSS(
      'nm-petals',
      `.nm-petals{background:linear-gradient(180deg,#fde8ef 0%,#fff4f6 50%,#f7f1ff 100%)}
.nm-petals .t{position:absolute;left:0;right:0;top:150px;text-align:center;font-family:"Songti SC","STSong","Noto Serif SC",serif;font-size:76px;font-weight:900;letter-spacing:.12em;color:#3b2a33;text-shadow:0 2px 20px rgba(255,255,255,.8)}
.nm-petals .s{position:absolute;left:0;right:0;top:252px;text-align:center;font-size:12px;letter-spacing:.4em;color:#b07a8f;font-weight:600}`,
    );
    const { ctx: back } = createCanvas(stage);
    const title = el('div', 't', stage, options.text ?? (options.lang === 'en' ? 'Spring' : '春日'));
    el('div', 's', stage, 'SPRING · 2026');
    const { ctx: front } = createCanvas(stage);

    const rnd = seeded(31);
    const items = Array.from({ length: COUNT }, () => {
      const depth = rnd(); // 0 远 → 1 近
      return {
        depth,
        x0: rnd() * 700,
        y0: rnd() * 460,
        laps: 1 + Math.floor(depth * 2.6), // 一轮落几次：近处更快
        drift: rnd() < 0.5 ? 1 : 2, // 一轮横向漂过几次画面
        sway: 12 + rnd() * 26,
        swayF: 2 + Math.floor(rnd() * 3),
        spin: (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)),
        flipF: 1 + Math.floor(rnd() * 4),
        phase: rnd() * TAU,
        size: 5 + depth * 9,
        hue: 335 + rnd() * 18,
      };
    });

    const petal = (g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, flip: number, hue: number, alpha: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.scale(1, Math.max(0.15, Math.abs(flip)));
      g.beginPath();
      // 花瓣：圆润的一端加上一个小缺口
      g.moveTo(0, s);
      g.bezierCurveTo(s * 0.9, s * 0.6, s * 0.8, -s * 0.7, s * 0.18, -s);
      g.lineTo(0, -s * 0.72);
      g.lineTo(-s * 0.18, -s);
      g.bezierCurveTo(-s * 0.8, -s * 0.7, -s * 0.9, s * 0.6, 0, s);
      const grad = g.createLinearGradient(0, -s, 0, s);
      grad.addColorStop(0, `hsla(${hue}, 85%, 92%, ${alpha})`);
      grad.addColorStop(1, `hsla(${hue}, 75%, 80%, ${alpha})`);
      g.fillStyle = grad;
      g.fill();
      g.restore();
    };

    const render = (t: number) => {
      back.clearRect(0, 0, 640, 400);
      front.clearRect(0, 0, 640, 400);
      const u = t / D;
      for (const p of items) {
        const y = ((p.y0 + u * p.laps * 460) % 460) - 30;
        const x = ((p.x0 + u * p.drift * 700) % 700) - 30 + Math.sin(u * TAU * p.swayF + p.phase) * p.sway;
        const rot = p.phase + u * TAU * p.spin;
        const flip = Math.cos(u * TAU * p.flipF + p.phase);
        // 远处的画在标题后面、还虚一点；近处的画在标题前面
        const g = p.depth > 0.6 ? front : back;
        const alpha = 0.35 + p.depth * 0.6;
        if (p.depth < 0.3) g.filter = 'blur(1.5px)';
        petal(g, x, y, p.size, rot, flip, p.hue, alpha);
        g.filter = 'none';
      }
      title.style.opacity = String(0.9 + 0.1 * clamp(Math.sin(u * TAU)));
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 0 });
  },
};
