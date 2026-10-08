// 胶囊变形：手机锁屏顶部的黑色胶囊，在待机、计时、正在播放、新消息四种状态之间变形。
// 宽、高、圆角各是一条弹簧轨道，内容在形状快到位时才淡入，离开时先淡出，最后回到待机，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, type SceneDef } from './util.ts';

const D = 11;
const SCREEN_W = 340;
// 每种状态的尺寸和出现时间
const IDLE = { w: 112, h: 32, r: 16 };
const STATES = [
  { at: 0.9, w: 204, h: 32, r: 16 }, // 计时
  { at: 3.3, w: 316, h: 150, r: 42 }, // 正在播放
  { at: 6.6, w: 300, h: 66, r: 33 }, // 新消息
  { at: 9.3, ...IDLE },
];

export const pill: SceneDef = {
  title: '胶囊变形',
  category: '界面',
  description: '锁屏顶部的黑色胶囊在待机、计时、正在播放、新消息之间变形，尺寸由弹簧驱动，内容在形状到位时淡入。',
  tags: ['track', 'spring', '形变'],
  tone: 'light',
  en: {
    title: 'Morphing pill',
    description: 'A black pill at the top of a lock screen morphs between idle, timer, now playing and a new message. Its size rides on springs, and the content fades in as the shape lands.',
    tags: ['track', 'spring', 'shape morph'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-pill');
    injectCSS(
      'nm-pill',
      `.nm-pill{background:linear-gradient(160deg,#eef0f6,#f6f1ea)}
.nm-pill .phone{position:absolute;left:${(640 - SCREEN_W - 20) / 2}px;top:14px;width:${SCREEN_W + 20}px;height:470px;border-radius:58px;background:#1d1d1f;padding:10px;box-shadow:0 30px 60px rgba(0,0,0,.18)}
.nm-pill .screen{position:relative;width:100%;height:100%;border-radius:48px;overflow:hidden;background:linear-gradient(170deg,#7b8cff 0%,#b58cff 38%,#ffb38a 78%,#ffd8a8 100%)}
.nm-pill .status{position:absolute;left:34px;right:30px;top:18px;display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:15px;font-weight:600}
.nm-pill .icons{display:flex;gap:5px;align-items:center}
.nm-pill .bars{display:flex;gap:2px;align-items:flex-end;height:11px}
.nm-pill .bars i{width:3px;background:#fff;border-radius:1px}
.nm-pill .batt{width:24px;height:11px;border:1.5px solid rgba(255,255,255,.9);border-radius:3px;padding:1px}
.nm-pill .batt i{display:block;width:70%;height:100%;background:#fff;border-radius:1px}
.nm-pill .date{position:absolute;left:0;right:0;top:190px;text-align:center;color:rgba(255,255,255,.92);font-size:17px;font-weight:600}
.nm-pill .clock{position:absolute;left:0;right:0;top:208px;text-align:center;color:#fff;font-size:84px;font-weight:700;letter-spacing:-.02em;line-height:1}
.nm-pill .island{position:absolute;top:11px;background:#000;overflow:hidden;z-index:5}
.nm-pill .c{position:absolute;inset:0;color:#fff}
.nm-pill .timer .ring{position:absolute;left:10px;top:7px}
.nm-pill .timer b{position:absolute;right:14px;top:0;line-height:32px;font-size:14px;color:#ff9f0a;font-variant-numeric:tabular-nums}
.nm-pill .music .art{position:absolute;left:18px;top:18px;width:54px;height:54px;border-radius:12px;background:linear-gradient(135deg,#ff9ac1,#ffd36e 60%,#7cd3ff)}
.nm-pill .music .t1{position:absolute;left:84px;top:22px;font-size:15px;font-weight:600}
.nm-pill .music .t2{position:absolute;left:84px;top:44px;font-size:13px;color:#a1a1a6}
.nm-pill .music .wave{position:absolute;right:20px;top:30px;display:flex;gap:3px;align-items:center;height:20px}
.nm-pill .music .wave i{width:3px;border-radius:2px;background:#ff9ac1}
.nm-pill .music .track{position:absolute;left:18px;right:18px;top:88px;height:4px;border-radius:2px;background:rgba(255,255,255,.22);overflow:hidden}
.nm-pill .music .track i{position:absolute;left:0;top:0;bottom:0;width:100%;background:#fff;transform-origin:0 50%}
.nm-pill .music .times{position:absolute;left:18px;right:18px;top:96px;display:flex;justify-content:space-between;font-size:11px;color:#a1a1a6;font-variant-numeric:tabular-nums}
.nm-pill .music svg{position:absolute;left:50%;top:112px;margin-left:-60px}
.nm-pill .msg .av{position:absolute;left:13px;top:13px;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0a84ff,#bf5af2);display:grid;place-items:center;font-size:17px;font-weight:700}
.nm-pill .msg .m1{position:absolute;left:64px;top:14px;font-size:14px;font-weight:600}
.nm-pill .msg .m2{position:absolute;left:64px;top:34px;font-size:13px;color:#c7c7cc;white-space:nowrap}
.nm-pill .msg .thumb{position:absolute;right:13px;top:13px;width:40px;height:40px;border-radius:10px;background:linear-gradient(160deg,#ffd6e0,#c9e4ff)}`,
    );

    const phone = el('div', 'phone', stage);
    const screen = el('div', 'screen', phone);
    const status = el('div', 'status', screen);
    el('span', '', status, '10:08');
    const icons = el('div', 'icons', status);
    const bars = el('div', 'bars', icons);
    [4, 6, 8, 11].forEach((h) => (el('i', '', bars).style.height = `${h}px`));
    el('i', '', el('div', 'batt', icons));
    el('div', 'date', screen, en ? 'Thursday, October 8' : '10月8日 星期四');
    el('div', 'clock', screen, '10:08');

    const island = el('div', 'island', screen);
    // 计时
    const timer = el('div', 'c timer', island);
    const ring = svg('svg', { class: 'ring', width: 18, height: 18, viewBox: '0 0 18 18' }, timer);
    svg('circle', { cx: 9, cy: 9, r: 7, fill: 'none', stroke: 'rgba(255,159,10,.3)', 'stroke-width': 2.5 }, ring);
    const arc = svg('circle', { cx: 9, cy: 9, r: 7, fill: 'none', stroke: '#ff9f0a', 'stroke-width': 2.5, 'stroke-linecap': 'round', pathLength: 100, transform: 'rotate(-90 9 9)', 'stroke-dasharray': 100 }, ring);
    const timeText = el('b', '', timer);
    // 正在播放
    const music = el('div', 'c music', island);
    el('div', 'art', music);
    el('div', 't1', music, en ? 'Spring Snap' : '春日抓拍');
    el('div', 't2', music, 'noahvisuals');
    const wave = el('div', 'wave', music);
    const waveBars = Array.from({ length: 5 }, () => el('i', '', wave));
    const progress = el('i', '', el('div', 'track', music));
    const times = el('div', 'times', music);
    const elapsed = el('span', '', times);
    const remain = el('span', '', times);
    const controls = svg('svg', { width: 120, height: 26, viewBox: '0 0 120 26' }, music);
    svg('path', { d: 'M10 6v14M26 6 14 13l12 7z', fill: '#fff', stroke: '#fff', 'stroke-width': 2, 'stroke-linejoin': 'round' }, controls);
    svg('path', { d: 'M54 5v16M66 5v16', stroke: '#fff', 'stroke-width': 4.5, 'stroke-linecap': 'round' }, controls);
    svg('path', { d: 'M110 6v14M94 6l12 7-12 7z', fill: '#fff', stroke: '#fff', 'stroke-width': 2, 'stroke-linejoin': 'round' }, controls);
    // 新消息
    const msg = el('div', 'c msg', island);
    el('div', 'av', msg, 'n');
    el('div', 'm1', msg, 'noah');
    el('div', 'm2', msg, en ? 'sent you a new piece ✦' : '发来一张新作品 ✦');
    el('div', 'thumb', msg);

    const shape = spring({ duration: 0.62, bounce: 0.3 });
    const keys = (k: 'w' | 'h' | 'r') => STATES.map((s) => [s.at, s[k], shape] as const);
    const w = track(IDLE.w, keys('w'));
    const h = track(IDLE.h, keys('h'));
    const r = track(IDLE.r, keys('r'));
    // 内容：形状快到位时淡入，下一个状态开始前淡出
    const fadeIn = spring({ duration: 0.35, bounce: 0 });
    const fadeOut = spring({ duration: 0.18, bounce: 0 });
    const show = (i: number) => track(0, [[STATES[i]!.at + 0.22, 1, fadeIn], [STATES[i + 1]!.at - 0.05, 0, fadeOut]]);
    const layers = [timer, music, msg].map((node, i) => ({ node, o: show(i) }));

    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    const render = (t: number) => {
      const W = w(t);
      island.style.width = `${W}px`;
      island.style.height = `${h(t)}px`;
      island.style.borderRadius = `${r(t)}px`;
      island.style.left = `${(SCREEN_W - W) / 2}px`;
      // 胶囊变宽时状态栏的时间和电量让开
      status.style.opacity = String(clamp((190 - W) / 50));
      island.style.boxShadow = `0 ${h(t) * 0.12}px ${h(t) * 0.35}px rgba(0,0,0,${clamp((h(t) - 32) / 120) * 0.35})`;
      for (const { node, o } of layers) {
        const k = clamp(o(t));
        node.style.opacity = String(k);
        node.style.filter = k < 0.99 ? `blur(${(1 - k) * 6}px)` : 'none';
        node.style.transform = `scale(${0.92 + 0.08 * k})`;
      }
      // 计时：从 5:00 开始倒数
      const left = 300 - Math.max(0, t - 0.9);
      timeText.textContent = mmss(left);
      arc.setAttribute('stroke-dashoffset', String(100 - (left / 300) * 100));
      // 正在播放：进度往前走，波形跳动
      const pos = 72 + Math.max(0, t - 3.3);
      progress.style.transform = `scaleX(${pos / 195})`;
      elapsed.textContent = mmss(pos);
      remain.textContent = `-${mmss(195 - pos)}`;
      waveBars.forEach((b, i) => {
        const v = 0.5 + 0.5 * Math.sin(t * (7 + i * 1.7) + i * 1.3);
        b.style.height = `${6 + 14 * v}px`;
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 5.2 });
  },
};
