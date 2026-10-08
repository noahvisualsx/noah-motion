// 滚轮数字：每一位都是一条 0–9 的滚轮，数值由弹簧驱动，从 0 滚到 211,726；
// 滚得越快的那一位越模糊（模糊程度来自弹簧的解析速度），停稳后变清晰。最后滚回 0，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, type SceneDef } from './util.ts';

const D = 8;
const DIGIT_H = 96;

export const odometer: SceneDef = {
  title: '滚轮数字',
  category: '数据',
  description: '每一位都是一条滚轮，数值由弹簧驱动。滚得越快越模糊，模糊程度直接来自弹簧的速度。',
  tags: ['spring', 'velocity', 'track'],
  tone: 'light',
  en: {
    title: 'Odometer',
    description: 'Every digit is its own wheel, driven by one spring. The faster it spins, the blurrier it gets, and the blur comes straight from the spring’s velocity.',
  },
  mount(host, options = {}) {
    const target = Number(options.text ?? 211726) || 211726;
    const digits = String(target).length;
    const stage = createStage(host, 'light', 'nm-odo');
    injectCSS(
      'nm-odo',
      `.nm-odo{background:linear-gradient(180deg,#fafaf8,#eeede8)}
.nm-odo .k{position:absolute;left:0;right:0;top:92px;text-align:center;font-size:13px;letter-spacing:.2em;color:#86868b;font-weight:600}
.nm-odo .row{position:absolute;left:0;right:0;top:${200 - DIGIT_H / 2}px;height:${DIGIT_H}px;display:flex;justify-content:center;align-items:center;gap:2px}
.nm-odo .wheel{position:relative;width:62px;height:${DIGIT_H}px;overflow:hidden;border-radius:14px;background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.04),0 8px 22px rgba(0,0,0,.07)}
.nm-odo .wheel::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.85),transparent 26%,transparent 74%,rgba(255,255,255,.85));pointer-events:none}
.nm-odo .strip{position:absolute;left:0;right:0;top:0}
.nm-odo .strip b{display:block;height:${DIGIT_H}px;line-height:${DIGIT_H}px;text-align:center;font-size:66px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.nm-odo .comma{width:18px;text-align:center;font-size:56px;font-weight:700;color:#c7c7cc;line-height:${DIGIT_H}px}
.nm-odo .u{position:absolute;left:0;right:0;top:268px;text-align:center;font-size:15px;color:#6e6e73}`,
    );
    el('div', 'k', stage, options.lang === 'en' ? 'VIEWS' : 'VIEWS · 浏览量');
    const row = el('div', 'row', stage);
    const wheels: { strip: HTMLElement; place: number }[] = [];
    for (let i = 0; i < digits; i++) {
      const place = digits - 1 - i;
      const wheel = el('div', 'wheel', row);
      const strip = el('div', 'strip', wheel);
      // 0–9 再接一个 0，滚过 9 时能无缝接上
      for (let d = 0; d <= 10; d++) el('b', '', strip, String(d % 10));
      wheels.push({ strip, place });
      if (place % 3 === 0 && place > 0) el('div', 'comma', row, ',');
    }
    const unit = el('div', 'u', stage, options.lang === 'en' ? 'Driven by one spring · faster means blurrier' : '由一条弹簧驱动 · 越快越模糊');

    // 计数器不能过冲（数值大时一点点回弹就会多出几十），所以用刚好不过冲的弹簧
    const roll = spring({ duration: 1.4, bounce: 0 });
    const back = spring({ duration: 0.9, bounce: 0 }); // 要在循环结束前完全回到 0，首尾才接得上
    const value = track(0, [[0.6, target, roll], [5.6, 0, back]]);

    const render = (t: number) => {
      const speed = Math.abs(value.velocity(t));
      // 快停稳时直接取整，避免最后一位停在两个数字中间
      const raw = Math.max(0, value(t));
      const v = speed < 4 ? Math.round(raw) : raw;
      for (const w of wheels) {
        const unitValue = v / 10 ** w.place;
        // 低位连续滚动；高位在前一位走完一圈时才动，和机械计数器一样
        const pos = w.place === 0 ? unitValue % 10 : Math.floor(unitValue) % 10 + smoothCarry(unitValue);
        w.strip.style.transform = `translateY(${-pos * DIGIT_H}px)`;
        const spin = speed / 10 ** w.place; // 这一位每秒转多少格
        w.strip.style.filter = spin > 4 ? `blur(${Math.min(6, (spin - 4) * 0.05)}px)` : 'none';
      }
      unit.style.opacity = String(0.4 + 0.6 * clamp(1 - speed / (target * 0.6)));
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 4.4 });
  },
};

/** 机械进位：只在这一位的小数部分接近 1 时（下一位快走完一圈）才滑向下一个数字 */
function smoothCarry(x: number) {
  const f = x - Math.floor(x);
  return f > 0.9 ? (f - 0.9) * 10 : 0;
}
