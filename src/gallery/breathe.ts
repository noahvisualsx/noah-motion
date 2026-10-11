// 呼吸：一朵半透明的光花跟着“吸气 4 秒 · 屏息 2 秒 · 呼气 5 秒”开合。
// 三层花瓣（5 / 7 / 9 瓣）颜色由暖到冷，层与层反向缓缓旋转；吸气时由内向外依次舒展，呼气时由外向内合拢。
// 每层花瓣都用弹簧“跟随”同一条呼吸曲线：外层慢半拍、到位时轻轻冲过头再回来，像有重量的花瓣。
// 周围的光点吸气时被吸进来、呼气时被吹出去；下方的字和分段进度条提示节奏。一轮正好一次呼吸，首尾相接。
import { spring, type Spring } from '../spring.ts';
import { track, clamp, mix, mixColor } from '../track.ts';
import { cubicBezier, easeOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, injectCSS, seeded, smooth, TAU, type SceneDef } from './util.ts';

const D = 12;
const IN0 = 0.6; // 开始吸气
const IN1 = 4.6; // 吸满，开始屏息
const EX0 = 6.6; // 开始呼气
const EX1 = 11.4; // 呼尽，静一会儿
const CX = 320;
const CY = 176;

/** 呼吸的快慢：接近正弦的慢起慢停，比常用的 easeInOut 更匀，一吸气花就开始动 */
const calm = cubicBezier(0.37, 0, 0.63, 1);
/** 呼吸主曲线：0 = 合拢的花苞，1 = 完全绽开 */
const breath = (t: number) =>
  t < IN0 ? 0 : t < IN1 ? calm((t - IN0) / (IN1 - IN0)) : t < EX0 ? 1 : t < EX1 ? 1 - calm((t - EX0) / (EX1 - EX0)) : 0;
/** 旋转进度：吸气走半程、呼气走半程，一轮正好 1 */
const turn = (t: number) => 0.5 * calm(clamp((t - IN0) / (IN1 - IN0))) + 0.5 * calm(clamp((t - EX0) / (EX1 - EX0)));

/**
 * 弹簧跟随：把曲线在变化的区间里切成很多小台阶，每一步都交给弹簧，叠加起来就是一条带惯性、到位时略冲过头的曲线。
 * 上一轮的台阶也算进来，所以开头能接上上一轮末尾的余韵；lap 是曲线每轮增加的量（旋转这种一直往前走的值用）。
 */
function follow(curve: (t: number) => number, spans: [from: number, to: number, delay: number][], motion: Spring, lap = 0) {
  const keys: [number, number, Spring][] = [];
  for (const c of [-1, 0]) {
    for (const [from, to, delay] of spans) {
      for (let x = from; x <= to + 1e-9; x += 0.05) keys.push([x + delay + c * D, curve(x) + c * lap, motion]);
    }
  }
  return track(curve(0) - lap, keys, motion);
}

// 三层花瓣，从外到内画：瓣数、长度（花苞 → 盛开）、宽度、离中心的距离、根部和瓣尖的颜色、旋转方向
const LAYERS = [
  { n: 9, len: [48, 106], w: [15, 28], off: [4, 12], base: [124, 182, 252], tip: [150, 232, 216], spin: 1, alpha: 0.42 },
  { n: 7, len: [38, 82], w: [14, 25], off: [3, 9], base: [158, 136, 255], tip: [255, 172, 208], spin: -1, alpha: 0.42 },
  { n: 5, len: [29, 56], w: [12, 20], off: [2, 6], base: [255, 140, 118], tip: [255, 204, 140], spin: 1, alpha: 0.5 },
] as const;
const rgba = (c: readonly number[], a: number) => `rgba(${c.map(Math.round).join(',')},${a})`;
const WARM = [255, 217, 204];
const COOL = [201, 227, 255];

export const breathe: SceneDef = {
  title: '呼吸',
  category: '图形',
  description: '一朵半透明的光花跟着“吸气 · 屏息 · 呼气”开合：三层花瓣反向旋转、由内向外依次舒展，弹簧跟随让外层慢半拍并轻轻回弹，光点随呼吸被吸入、吹散。',
  tags: ['spring 跟随', 'track', 'stagger', 'mixColor', 'canvas'],
  tone: 'light',
  en: {
    title: 'Breathe',
    description: 'A translucent flower of light opens and closes with “breathe in · hold · breathe out”. Three layers of petals counter-rotate and unfold from the inside out; spring-follow makes the outer ones lag and settle softly, while motes drift in and out with the breath.',
    tags: ['spring follow', 'track', 'stagger', 'mixColor', 'canvas'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-breathe');
    injectCSS(
      'nm-breathe',
      `.nm-breathe{background:radial-gradient(70% 80% at 50% 42%,#fffdfb 0%,#f6f3f6 58%,#ece9f1 100%)}
.nm-breathe .head{position:absolute;left:0;right:0;top:26px;text-align:center;font-size:11px;font-weight:600;letter-spacing:.32em;color:#a29db0;text-transform:uppercase}
.nm-breathe .words{position:absolute;left:0;right:0;top:318px;height:30px}
.nm-breathe .words span{position:absolute;left:0;right:0;text-align:center;font-size:23px;font-weight:500;color:#3a3646;white-space:nowrap;letter-spacing:.16em}
.nm-breathe .bar{position:absolute;top:362px;height:2px;border-radius:1px;background:rgba(80,70,120,.12);overflow:hidden}
.nm-breathe .bar i{position:absolute;inset:0;border-radius:1px;transform-origin:0 50%}`,
    );
    const { ctx } = createCanvas(stage);
    el('div', 'head', stage, options.text ?? (en ? 'Breathe with the bloom' : '跟着花开，慢慢呼吸'));
    const words = el('div', 'words', stage);
    const PHASES = [
      { word: en ? 'Breathe in' : '吸气', from: IN0, to: IN1, color: '#ff8f7a' },
      { word: en ? 'Hold' : '屏息', from: IN1, to: EX0, color: '#9d8cff' },
      { word: en ? 'Breathe out' : '呼气', from: EX0, to: EX1, color: '#5fb8ff' },
    ];
    // 进度条按三段时长分配宽度，中间留一点缝
    const BAR_W = 168;
    const GAP = 6;
    const total = EX1 - IN0;
    let bx = CX - BAR_W / 2;
    const phases = PHASES.map((p) => {
      const node = el('span', '', words, p.word);
      const w = ((BAR_W - GAP * 2) * (p.to - p.from)) / total;
      const bar = el('div', 'bar', stage);
      bar.style.left = `${bx}px`;
      bar.style.width = `${w}px`;
      bx += w + GAP;
      const fill = el('i', '', bar);
      fill.style.background = p.color;
      return { ...p, node, fill };
    });

    // ---------- 运动 ----------
    // 每层一条跟随弹簧：越往外越慢、越有回弹。吸气时内层先动，呼气时外层先动
    const bloom = LAYERS.map((_, i) => {
      const k = LAYERS.length - 1 - i; // 0 = 最内层
      const motion = spring({ duration: 0.55 + 0.22 * (2 - k), bounce: 0.18 + 0.06 * (2 - k) });
      return follow(breath, [[IN0, IN1, 0.14 * k], [EX0, EX1, 0.14 * (2 - k)]], motion);
    });
    const spin = LAYERS.map((_, i) => follow(turn, [[IN0, IN1, 0.1 * i], [EX0, EX1, 0.1 * i]], spring({ duration: 0.9, bounce: 0.1 }), 1));
    // 文字：每个阶段开始时淡入，结束前淡出
    const fadeIn = spring({ duration: 0.7, bounce: 0 });
    const fadeOut = spring({ duration: 0.45, bounce: 0 });
    const wordO = PHASES.map((p) => track(0, [[p.from - 0.15, 1, fadeIn], [p.to - 0.3, 0, fadeOut]]));
    const barO = track(0, [[0.1, 1, fadeIn], [EX1 - 0.1, 0, fadeOut]]);

    // 光点：吸气时被吸向花心，呼气时被吹出去；整轮绕圈数是整数
    const rnd = seeded(8);
    const motes = Array.from({ length: 34 }, () => ({
      a: rnd() * TAU,
      r: 120 + rnd() * 110,
      size: 0.9 + rnd() * 1.6,
      laps: rnd() < 0.5 ? 1 : -1,
      tw: 1 + Math.floor(rnd() * 3),
      ph: rnd() * TAU,
      color: mixColor('#ffab98', '#93c3ff', rnd()),
    }));

    // 花瓣：根部收窄、瓣尖圆润，像一片被光透过的薄瓣
    const petal = (len: number, w: number) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(w * 0.7, -len * 0.12, w * 1.12, -len * 0.55, w * 0.78, -len * 0.86);
      ctx.bezierCurveTo(w * 0.55, -len * 1.04, -w * 0.55, -len * 1.04, -w * 0.78, -len * 0.86);
      ctx.bezierCurveTo(-w * 1.12, -len * 0.55, -w * 0.7, -len * 0.12, 0, 0);
    };

    const render = (t: number) => {
      ctx.clearRect(0, 0, 640, 400);
      const b = breath(t);
      const hold = smooth(IN1 - 0.3, IN1 + 0.4, t) * (1 - smooth(EX0 - 0.4, EX0 + 0.3, t));

      // 柔光底：跟着花一起变大，颜色从暖（吸气）过渡到冷（呼气）
      const warm = t < EX0 ? 1 : 1 - smooth(EX0, EX0 + 2, t);
      const auraR = 110 + 110 * b;
      const aura = ctx.createRadialGradient(CX, CY, 0, CX, CY, auraR);
      aura.addColorStop(0, `rgba(255,255,255,${0.75 + 0.2 * hold})`);
      aura.addColorStop(0.35, rgba(WARM.map((v, i) => mix(v, COOL[i]!, 1 - warm)), 0.34));
      aura.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, 640, 400);
      // 花下面一片淡淡的投影，让它浮起来
      ctx.save();
      ctx.translate(CX, CY + 126);
      ctx.scale(1, 0.18);
      const shadowR = 50 + 70 * b;
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowR);
      shadow.addColorStop(0, 'rgba(110,90,160,.16)');
      shadow.addColorStop(1, 'rgba(110,90,160,0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, shadowR, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 花瓣：中间浓、四周化开的柔光（径向渐变缩放到花瓣大小，边缘淡到透明），层层叠上去像几片染了色的薄纱
      LAYERS.forEach((L, i) => {
        const k = bloom[i]!(t);
        const shimmer = 1 + 0.03 * hold * Math.sin(TAU * (t - IN1) * 0.75 + i * 1.7);
        const len = mix(L.len[0], L.len[1], k) * shimmer;
        const w = mix(L.w[0], L.w[1], clamp(k, 0, 1.2));
        const off = mix(L.off[0], L.off[1], k);
        // 花苞时花瓣斜着卷在一起，开花时舒展成放射状
        const curl = mix(1.05, 0.06, clamp(k, 0, 1.1)) * L.spin;
        const rot = (L.spin * TAU * spin[i]!(t)) / L.n + i * 0.4;
        const fill = ctx.createRadialGradient(0, 0.12, 0, 0, 0, 1);
        fill.addColorStop(0, rgba(L.tip, L.alpha * 1.1));
        fill.addColorStop(0.45, rgba(L.base, L.alpha));
        fill.addColorStop(0.8, rgba(L.base, L.alpha * 0.5));
        fill.addColorStop(1, rgba(L.base, 0));
        for (let j = 0; j < L.n; j++) {
          const a = rot + (j * TAU) / L.n;
          ctx.save();
          ctx.translate(CX + Math.cos(a) * off, CY + Math.sin(a) * off);
          ctx.rotate(a + Math.PI / 2 + curl);
          petal(len, w);
          // 路径已经按花瓣坐标建好，再把坐标缩放成单位圆，渐变就正好铺满这片花瓣
          ctx.translate(0, -len * 0.56);
          ctx.scale(w * 1.1, len * 0.56);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.restore();
        }
      });

      // 屏息时从花的边缘荡出两圈很淡的光圈
      for (const at of [IN1 + 0.05, IN1 + 1.0]) {
        const p = clamp((t - at) / 1.6);
        if (p <= 0 || p >= 1) continue;
        ctx.strokeStyle = `rgba(150,130,240,${0.32 * (1 - p) * (1 - p)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(CX, CY, 116 + 22 * easeOut(p), 0, TAU);
        ctx.stroke();
      }

      // 花心：一团暖白的光，屏息时最亮
      const coreR = 16 + 20 * b + 6 * hold;
      const core = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR);
      core.addColorStop(0, `rgba(255,255,255,${0.9})`);
      core.addColorStop(0.5, `rgba(255,246,236,${0.45 + 0.25 * hold})`);
      core.addColorStop(1, 'rgba(255,240,230,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(CX, CY, coreR, 0, TAU);
      ctx.fill();

      // 光点
      for (const m of motes) {
        const r = m.r * (1 - 0.42 * b) + 6 * Math.sin(TAU * (t / D) * m.tw + m.ph);
        const a = m.a + (TAU * m.laps * t) / D;
        const x = CX + Math.cos(a) * r;
        const y = CY + Math.sin(a) * r * 0.82;
        const tw = 0.5 + 0.5 * Math.sin((TAU * m.tw * t) / D + m.ph);
        ctx.fillStyle = m.color;
        ctx.globalAlpha = (0.35 + 0.5 * tw) * (0.6 + 0.4 * b);
        ctx.beginPath();
        ctx.arc(x, y, m.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 文字和进度条
      phases.forEach((p, i) => {
        const o = clamp(wordO[i]!(t));
        p.node.style.opacity = String(o);
        // 字跟着呼吸一起微微放大缩小
        p.node.style.transform = `translateY(${(1 - o) * 6}px) scale(${0.97 + 0.06 * b})`;
        p.node.style.filter = o < 0.99 ? `blur(${(1 - o) * 4}px)` : 'none';
        p.fill.style.transform = `scaleX(${clamp((t - p.from) / (p.to - p.from))})`;
        p.fill.parentElement!.style.opacity = String(clamp(barO(t)));
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 5.4 });
  },
};
