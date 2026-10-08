// 解码文字：每个字先在一串乱码里跳动，再从左到右依次“锁定”成正确的字，锁定的一瞬间亮一下；
// 停留后整句重新打乱、消失，换下一句。两句轮流，开头和结尾都是空白，可以无缝循环。
import { timeline } from '../timeline.ts';
import { clamp, mixColor } from '../track.ts';
import { createStage, el, injectCSS, seeded, type SceneDef } from './util.ts';

const D = 10;
// 每一句：开始出现、全部锁定、开始打乱、完全消失
const ACTS = [
  { from: 0.4, lock: 2.3, out: 4.3, end: 5.0 },
  { from: 5.2, lock: 7.1, out: 9.1, end: 9.8 },
];
const RATE = 22; // 乱码每秒换几次
const SYMBOLS = '#%&*+=?/<>[]{}01';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' + SYMBOLS;
const CJK = '光影字码时间函数弹簧帧画面生成灵感创作提示词图像声音色彩节奏线条形状数据界面' + SYMBOLS;
const PHRASES = {
  zh: [
    ['每个人都有', '自己的闪光点'],
    ['把灵感', '生成出来'],
  ],
  en: [
    ['EVERYONE HAS', 'THEIR OWN SPARK'],
    ['TURN IDEAS', 'INTO IMAGES'],
  ],
};

/** 确定性的“随机”整数：同一个位置、同一个时刻永远是同一个乱码 */
const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

export const decode: SceneDef = {
  title: '解码文字',
  category: '文字',
  description: '每个字先在乱码里跳动，再从左到右依次锁定成正确的字，锁定时亮一下；停留后重新打乱，换下一句。',
  tags: ['timeline', 'stagger', '确定性随机'],
  tone: 'dark',
  en: {
    title: 'Decoding text',
    description: 'Each character flickers through noise, then locks into place from left to right with a brief flash; after a pause the line scrambles away and the next one decodes.',
    tags: ['timeline', 'stagger', 'deterministic noise'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const phrases = PHRASES[en ? 'en' : 'zh'].map((p) => [...p]);
    if (options.text) phrases[0] = options.text.split(/\s*[/\n]\s*/).slice(0, 2);
    const pool = [...(en ? LATIN : CJK)];

    const stage = createStage(host, 'dark', 'nm-decode');
    injectCSS(
      'nm-decode',
      `.nm-decode{background-color:#07090c;background-image:radial-gradient(60% 55% at 50% 45%,rgba(100,210,255,.12),transparent 70%),radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);background-size:auto,16px 16px}
.nm-decode .act{position:absolute;left:0;right:0;top:118px;text-align:center;font-family:"SF Mono",ui-monospace,Menlo,"PingFang SC",monospace;font-weight:700}
.nm-decode .line{height:62px;line-height:62px;white-space:pre}
.nm-decode .act.en .line{font-size:40px}
.nm-decode .act.zh .line{font-size:44px}
.nm-decode .line span{display:inline-block;text-align:center}
.nm-decode .act.en .line span{width:.62em}
.nm-decode .act.zh .line span{width:1.05em}
.nm-decode .cap{position:absolute;left:170px;right:170px;top:282px;display:flex;justify-content:space-between;font-family:"SF Mono",ui-monospace,Menlo,"PingFang SC",monospace;font-size:12px;letter-spacing:.14em;color:#64d2ff}
.nm-decode .bar{position:absolute;left:170px;right:170px;top:304px;height:2px;border-radius:1px;background:rgba(100,210,255,.15);overflow:hidden}
.nm-decode .bar i{position:absolute;left:0;top:0;bottom:0;width:100%;background:#64d2ff;transform-origin:0 50%;box-shadow:0 0 8px #64d2ff}`,
    );

    const acts = phrases.map((lines, ai) => {
      const box = el('div', `act ${en ? 'en' : 'zh'}`, stage);
      const act = ACTS[ai]!;
      const chars: { node: HTMLElement; ch: string; i: number; lockAt: number; showAt: number; outAt: number }[] = [];
      const rnd = seeded(40 + ai);
      const total = lines.join('').replace(/\s/g, '').length;
      let i = 0;
      for (const text of lines) {
        const line = el('div', 'line', box);
        for (const ch of text) {
          const node = el('span', '', line, ch === ' ' ? ' ' : '');
          if (ch === ' ') continue;
          const k = i / Math.max(1, total - 1);
          chars.push({
            node,
            ch,
            i,
            showAt: act.from + k * 0.35,
            lockAt: act.from + 0.45 + k * (act.lock - act.from - 0.45) + (rnd() - 0.5) * 0.12,
            outAt: act.out + (1 - k) * (act.end - act.out - 0.2),
          });
          i++;
        }
      }
      return { box, act, chars };
    });

    const cap = el('div', 'cap', stage);
    const capL = el('span', '', cap);
    const capR = el('span', '', cap);
    const bar = el('div', 'bar', stage);
    const fill = el('i', '', bar);

    const render = (t: number) => {
      let shown = 0;
      let locked = 0;
      let total = 0;
      let phase: 'idle' | 'in' | 'done' | 'out' = 'idle';
      for (const { box, act, chars } of acts) {
        const active = t >= act.from && t < act.end;
        box.style.display = active ? '' : 'none';
        if (!active) continue;
        phase = t < act.lock + 0.1 ? 'in' : t < act.out ? 'done' : 'out';
        const tick = Math.floor(t * RATE);
        for (const c of chars) {
          total++;
          const visible = t >= c.showAt && t < c.outAt + 0.2;
          if (!visible) {
            c.node.textContent = '';
            continue;
          }
          shown++;
          const isLocked = t >= c.lockAt && t < c.outAt;
          if (isLocked) {
            locked++;
            c.node.textContent = c.ch;
            // 锁定瞬间是亮青色带光晕，0.4 秒内褪成白色
            const k = clamp((t - c.lockAt) / 0.4);
            c.node.style.color = mixColor('#9ff0ff', '#f5f5f7', k);
            c.node.style.textShadow = `0 0 ${14 * (1 - k)}px rgba(100,210,255,${0.9 * (1 - k)})`;
            c.node.style.opacity = '1';
          } else {
            c.node.textContent = pool[hash(c.i + act.from * 100, tick) % pool.length]!;
            c.node.style.color = '#64d2ff';
            c.node.style.textShadow = 'none';
            c.node.style.opacity = String(0.35 + 0.35 * ((hash(c.i, tick + 7) % 100) / 100));
          }
        }
      }
      const pct = total ? Math.round((locked / total) * 100) : 0;
      cap.style.opacity = bar.style.opacity = String(phase === 'idle' ? 0 : shown ? 1 : 0);
      capL.textContent =
        phase === 'out' ? (en ? 'SCRAMBLING' : '重新加密') : phase === 'done' ? (en ? 'DECODED' : '解码完成') : en ? 'DECODING' : '正在解码';
      capR.textContent = `${String(pct).padStart(3, ' ')}%`;
      fill.style.transform = `scaleX(${pct / 100})`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.4 });
  },
};
