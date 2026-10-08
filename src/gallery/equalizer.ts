// 节拍：32 根音柱跟着 120 BPM 的鼓点跳——底鼓打在低频、军鼓打在中频、踩镲打在高频。
// 每一下都是一次弹簧脉冲；时间差用“周期折回”计算，所以循环开头也带着上一轮末尾的余波，接缝看不出来。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, injectCSS, seeded, wrap, type SceneDef } from './util.ts';

const D = 8;
const BPM = 120;
const BEAT = 60 / BPM;
const BARS = 32;

type Hit = { at: number; center: number; width: number; power: number };

export const equalizer: SceneDef = {
  title: '节拍',
  category: '图形',
  description: '32 根音柱跟着 120 BPM 的鼓点跳，底鼓、军鼓、踩镲分别打在不同频段，每一下都是一次弹簧脉冲。',
  tags: ['spring 脉冲', '周期折回', 'canvas'],
  tone: 'dark',
  en: {
    title: 'Beat',
    description: '32 bars dance to a 120 BPM beat. Kick, snare and hi-hat each hit a different band, and every hit is a spring pulse.',
    tags: ['spring pulses', 'periodic wrap', 'canvas'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-eq');
    injectCSS(
      'nm-eq',
      `.nm-eq .bpm{position:absolute;left:40px;top:34px;font-size:12px;letter-spacing:.2em;color:rgba(245,245,247,.55);font-weight:600}
.nm-eq .bpm b{display:block;margin-top:4px;font-size:28px;letter-spacing:-.02em;color:#f5f5f7;font-variant-numeric:tabular-nums}
.nm-eq .beat{position:absolute;right:40px;top:40px;display:flex;gap:6px}
.nm-eq .beat i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18)}`,
    );
    const { ctx } = createCanvas(stage);
    const label = el('div', 'bpm', stage, options.text ?? 'NOW PLAYING');
    el('b', '', label, `${BPM} BPM`);
    const beatBox = el('div', 'beat', stage);
    const beatDots = [0, 1, 2, 3].map(() => el('i', '', beatBox));

    const rnd = seeded(21);
    const hits: Hit[] = [];
    const beats = Math.round(D / BEAT);
    for (let b = 0; b < beats; b++) {
      const at = b * BEAT;
      if (b % 2 === 0) hits.push({ at, center: 3, width: 5, power: 1 }); // 底鼓
      else hits.push({ at, center: 13, width: 6, power: 0.8 }); // 军鼓
      hits.push({ at: at + BEAT / 2, center: 25 + rnd() * 4, width: 4, power: 0.45 + rnd() * 0.2 }); // 踩镲
      if (b % 4 === 3) hits.push({ at: at + BEAT * 0.75, center: 8 + rnd() * 10, width: 8, power: 0.55 }); // 加花
    }
    const kick = spring({ duration: 0.42, bounce: 0.35 });
    // 一次鼓点：推上去 0.09 秒再放开，弹簧带出回弹的余震
    const pulse = track(0, [[0, 1, kick], [0.09, 0, kick]]);
    // 每根柱子对每个鼓点的响应强度（高斯分布在中心频段附近）
    const weights = hits.map((h) => Array.from({ length: BARS }, (_, i) => h.power * Math.exp(-((i - h.center) ** 2) / (2 * h.width * h.width))));
    const idle = Array.from({ length: BARS }, () => 0.06 + rnd() * 0.05);

    const render = (t: number) => {
      ctx.fillStyle = '#07070b';
      ctx.fillRect(0, 0, 640, 400);
      const levels = idle.slice();
      hits.forEach((h, k) => {
        const local = wrap(t, h.at, D);
        if (local > 1.6) return;
        const p = pulse(local);
        const w = weights[k]!;
        for (let i = 0; i < BARS; i++) levels[i]! += p * w[i]!;
      });
      const bw = 12;
      const gap = 5;
      const x0 = 320 - (BARS * (bw + gap) - gap) / 2;
      const base = 270;
      for (let i = 0; i < BARS; i++) {
        const h = 8 + clamp(levels[i]! * 1.5, 0, 1.5) * 128;
        const x = x0 + i * (bw + gap);
        const g = ctx.createLinearGradient(0, base - h, 0, base);
        const hue = 190 + (i / BARS) * 120;
        g.addColorStop(0, `hsl(${hue} 95% 68%)`);
        g.addColorStop(1, `hsl(${hue} 90% 45%)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x, base - h, bw, h, 6);
        ctx.fill();
        // 倒影
        const r = ctx.createLinearGradient(0, base + 6, 0, base + 6 + h * 0.45);
        r.addColorStop(0, `hsla(${hue}, 90%, 55%, 0.28)`);
        r.addColorStop(1, `hsla(${hue}, 90%, 55%, 0)`);
        ctx.fillStyle = r;
        ctx.beginPath();
        ctx.roundRect(x, base + 6, bw, h * 0.45, 6);
        ctx.fill();
      }
      // 右上角的四拍指示
      const beat = Math.floor(t / BEAT) % 4;
      beatDots.forEach((d, i) => {
        const on = i === beat;
        const k = on ? clamp(1 - wrap(t, Math.floor(t / BEAT) * BEAT, D) / BEAT) : 0;
        d.style.background = on ? `rgba(41,151,255,${0.45 + 0.55 * k})` : 'rgba(255,255,255,.18)';
        d.style.transform = `scale(${1 + 0.5 * k})`;
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 0.08 });
  },
};
