// AI 对话：你发一句话 → 对方显示“正在输入”的三个点 → 回答逐字出现 → 弹出“复制”按钮。
// 气泡用弹簧从发出的一角弹出；逐字的进度只由时间决定，拖到哪一帧就显示到哪个字。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, type SceneDef } from './util.ts';

const D = 9;
const QUESTION = '帮我写一句春日抓拍的提示词';
const ANSWER = '春日樱花下的抓拍，奶白针织开衫，侧逆光勾出发丝，手机随手拍质感，轻微过曝和颗粒。';

export const chat: SceneDef = {
  title: 'AI 对话',
  category: '界面',
  description: '发一句话，对方显示“正在输入”，回答逐字出现，最后弹出“复制”按钮。气泡从发出的那一角弹出来。',
  tags: ['spring', 'track', '逐字显示'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-chat');
    injectCSS(
      'nm-chat',
      `.nm-chat{background:linear-gradient(180deg,#f5f5f7,#ebebef)}
.nm-chat .win{position:absolute;left:150px;top:28px;width:340px;height:344px;border-radius:24px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05),0 20px 50px rgba(0,0,0,.1);overflow:hidden}
.nm-chat .bar{height:46px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid rgba(0,0,0,.06);font-size:14px;font-weight:600}
.nm-chat .av{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#0071e3,#bf5af2)}
.nm-chat .bar small{margin-left:auto;font-size:11px;font-weight:500;color:#86868b}
.nm-chat .list{position:absolute;left:0;right:0;top:46px;bottom:0;padding:16px 14px;display:flex;flex-direction:column;gap:10px}
.nm-chat .b{max-width:250px;padding:9px 13px;border-radius:18px;font-size:13.5px;line-height:1.5}
.nm-chat .me{align-self:flex-end;background:#0071e3;color:#fff;border-bottom-right-radius:6px;transform-origin:100% 100%}
.nm-chat .ai{align-self:flex-start;background:#f0f0f3;color:#1d1d1f;border-bottom-left-radius:6px;transform-origin:0 100%}
.nm-chat .typing{display:flex;gap:4px;padding:12px 14px}
.nm-chat .typing i{width:7px;height:7px;border-radius:50%;background:#a1a1a6}
.nm-chat .caret{display:inline-block;width:2px;height:14px;margin-left:1px;vertical-align:-2px;background:#0071e3}
.nm-chat .copy{align-self:flex-start;height:28px;padding:0 12px;border-radius:14px;background:#1d1d1f;color:#fff;font-size:12px;font-weight:600;line-height:28px;transform-origin:0 50%}`,
    );
    const win = el('div', 'win', stage);
    const bar = el('div', 'bar', win);
    el('i', 'av', bar);
    el('span', '', bar, 'noah 助手');
    const status = el('small', '', bar, '在线');
    const list = el('div', 'list', win);
    const me = el('div', 'b me', list, options.text ?? QUESTION);
    const typing = el('div', 'b ai typing', list);
    const dots = [0, 1, 2].map(() => el('i', '', typing));
    const ai = el('div', 'b ai', list);
    const aiText = el('span', '', ai);
    const caret = el('i', 'caret', ai);
    const copy = el('div', 'copy', list, '复制提示词');

    const pop = spring({ duration: 0.45, bounce: 0.3 });
    const out = spring({ duration: 0.5, bounce: 0 });
    const meIn = track(0, [[0.5, 1, pop], [7.6, 0, out]]);
    const typingIn = track(0, [[1.3, 1, pop], [2.6, 0, spring({ duration: 0.25 })]]);
    const aiIn = track(0, [[2.6, 1, pop], [7.6, 0, out]]);
    const copyIn = track(0, [[5.9, 1, pop], [7.6, 0, out]]);
    const chars = [...ANSWER];
    const T0 = 2.75;
    const CPS = 13; // 每秒出几个字

    const render = (t: number) => {
      const show = (node: HTMLElement, p: number, dy = 8) => {
        const k = clamp(p);
        node.style.display = k <= 0.001 ? 'none' : '';
        node.style.opacity = String(k);
        node.style.transform = `translateY(${(1 - k) * dy}px) scale(${0.6 + 0.4 * Math.max(0, p)})`;
      };
      show(me, meIn(t));
      show(typing, typingIn(t));
      dots.forEach((d, i) => {
        const ph = (t * 2.2 - i * 0.18) % 1;
        d.style.transform = `translateY(${-Math.max(0, Math.sin(ph * Math.PI * 2)) * 4}px)`;
        d.style.opacity = String(0.5 + 0.5 * Math.max(0, Math.sin(ph * Math.PI * 2)));
      });
      show(ai, aiIn(t));
      const n = Math.max(0, Math.min(chars.length, Math.floor((t - T0) * CPS)));
      aiText.textContent = chars.slice(0, n).join('');
      const streaming = n > 0 && n < chars.length;
      caret.style.display = n < chars.length && t > T0 ? '' : 'none';
      caret.style.opacity = streaming || Math.floor(t * 2.5) % 2 === 0 ? '1' : '0';
      show(copy, copyIn(t), 4);
      status.textContent = t > 1.3 && n < chars.length && t < 7 ? '正在输入…' : '在线';
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 6.6 });
  },
};
