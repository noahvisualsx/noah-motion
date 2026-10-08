// 控件：六个常用控件依次被“点”一下——开关、勾选、滑块、分段、点赞、步进器，每个都有自己的弹簧手感；
// 点击处会泛起一圈浅色波纹。后半段再依次回到初始状态，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mixColor } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, TAU, type SceneDef } from './util.ts';

const D = 10;
const CARD_W = 180;
const CARD_H = 150;
const GAP = 16;
const X0 = (640 - CARD_W * 3 - GAP * 2) / 2;
const Y0 = (400 - CARD_H * 2 - GAP) / 2;
const LABELS = {
  zh: ['开关', '勾选', '滑块', '分段', '点赞', '步进器'],
  en: ['Toggle', 'Checkbox', 'Slider', 'Segments', 'Like', 'Stepper'],
};
const SEGMENTS = { zh: ['日', '周', '月'], en: ['Day', 'Week', 'Month'] };

export const controls: SceneDef = {
  title: '控件手感',
  category: '界面',
  description: '开关、勾选、滑块、分段、点赞、步进器依次被点一下，每个都有自己的弹簧手感，点击处泛起波纹，之后再依次复原。',
  tags: ['spring', 'track', '微交互'],
  tone: 'light',
  en: {
    title: 'Control feel',
    description: 'A toggle, checkbox, slider, segmented control, like button and stepper get tapped in turn, each with its own spring feel and a ripple where the tap lands, then reset one by one.',
    tags: ['spring', 'track', 'micro-interactions'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-ctrl');
    injectCSS(
      'nm-ctrl',
      `.nm-ctrl{background:#eef0f3}
.nm-ctrl .card{position:absolute;width:${CARD_W}px;height:${CARD_H}px;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 22px rgba(0,0,0,.06)}
.nm-ctrl .card .lab{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:13px;color:#86868b}
.nm-ctrl .tog{position:absolute;left:58px;top:44px;width:64px;height:38px;border-radius:19px}
.nm-ctrl .tog i{position:absolute;top:3px;height:32px;border-radius:16px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.nm-ctrl .chk{position:absolute;left:73px;top:46px;width:34px;height:34px;border-radius:10px;border:2px solid #c7c7cc}
.nm-ctrl .chk b{position:absolute;inset:-2px;border-radius:10px;background:#0071e3}
.nm-ctrl .chk svg{position:absolute;inset:-2px}
.nm-ctrl .sld{position:absolute;left:25px;top:62px;width:130px;height:6px;border-radius:3px;background:#e5e5ea}
.nm-ctrl .sld b{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#0071e3}
.nm-ctrl .sld i{position:absolute;top:-10px;width:26px;height:26px;margin-left:-13px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.22)}
.nm-ctrl .sld em{position:absolute;top:-38px;width:40px;margin-left:-20px;text-align:center;font-style:normal;font-size:13px;font-weight:600;color:#1d1d1f;font-variant-numeric:tabular-nums}
.nm-ctrl .seg{position:absolute;left:18px;top:46px;width:144px;height:34px;border-radius:10px;background:#eeeef0}
.nm-ctrl .seg i{position:absolute;top:2px;width:${(144 - 4) / 3}px;height:30px;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14)}
.nm-ctrl .seg span{position:absolute;top:0;width:${144 / 3}px;line-height:34px;text-align:center;font-size:13px;font-weight:600}
.nm-ctrl .like{position:absolute;left:52px;top:42px;width:76px;height:44px}
.nm-ctrl .like svg{position:absolute;left:0;top:4px;overflow:visible}
.nm-ctrl .like .cnt{position:absolute;left:44px;top:0;height:44px;overflow:hidden;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.nm-ctrl .like .cnt div{line-height:44px}
.nm-ctrl .step{position:absolute;left:34px;top:46px;width:112px;height:36px;border-radius:12px;background:#eeeef0;display:flex;align-items:center;justify-content:space-between}
.nm-ctrl .step b{width:36px;line-height:36px;text-align:center;font-size:20px;font-weight:500;color:#0071e3}
.nm-ctrl .step .num{position:relative;width:24px;height:36px;overflow:hidden;font-size:18px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
.nm-ctrl .step .num div{position:absolute;left:0;right:0;top:0}
.nm-ctrl .step .num span{display:block;line-height:36px}
.nm-ctrl .tap{position:absolute;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(0,113,227,.25);pointer-events:none}`,
    );
    const labels = LABELS[en ? 'en' : 'zh'];
    const cards = labels.map((text, i) => {
      const card = el('div', 'card', stage);
      card.style.left = `${X0 + (i % 3) * (CARD_W + GAP)}px`;
      card.style.top = `${Y0 + Math.floor(i / 3) * (CARD_H + GAP)}px`;
      el('div', 'lab', card, text);
      return card;
    });
    const at = (i: number, x: number, y: number) => ({ x: X0 + (i % 3) * (CARD_W + GAP) + x, y: Y0 + Math.floor(i / 3) * (CARD_H + GAP) + y });

    // 1 开关
    const tog = el('div', 'tog', cards[0]!);
    const knob = el('i', '', tog);
    // 2 勾选
    const chk = el('div', 'chk', cards[1]!);
    const chkFill = el('b', '', chk);
    const tick = svg('svg', { width: 34, height: 34, viewBox: '0 0 34 34' }, chk);
    const tickPath = svg('path', { d: 'M9 17.5l5.5 5.5L25 12', fill: 'none', stroke: '#fff', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': 1 }, tick);
    // 3 滑块
    const sld = el('div', 'sld', cards[2]!);
    const sldFill = el('b', '', sld);
    const thumb = el('i', '', sld);
    const sldVal = el('em', '', sld);
    // 4 分段
    const seg = el('div', 'seg', cards[3]!);
    const segPill = el('i', '', seg);
    const segText = SEGMENTS[en ? 'en' : 'zh'].map((s, i) => {
      const span = el('span', '', seg, s);
      span.style.left = `${(i * 144) / 3}px`;
      return span;
    });
    // 5 点赞
    const like = el('div', 'like', cards[4]!);
    const heartSvg = svg('svg', { width: 34, height: 34, viewBox: '0 0 34 34' }, like);
    const dots = Array.from({ length: 8 }, (_, i) => svg('circle', { r: 2.6, fill: i % 2 ? '#ff9f0a' : '#ff375f' }, heartSvg));
    const heart = svg('path', { d: 'M17 29s-12-7.4-12-16.1A6.9 6.9 0 0 1 17 8.7a6.9 6.9 0 0 1 12 4.2C29 21.6 17 29 17 29z', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, heartSvg);
    const cnt = el('div', 'cnt', like);
    const cntStrip = el('div', '', cnt);
    el('div', '', cntStrip, '128');
    el('div', '', cntStrip, '129');
    // 6 步进器
    const step = el('div', 'step', cards[5]!);
    const minus = el('b', '', step, '−');
    const num = el('div', 'num', step);
    const numStrip = el('div', '', num);
    for (let n = 0; n <= 9; n++) el('span', '', numStrip, String(n));
    const plus = el('b', '', step, '+');

    const snappy = spring({ duration: 0.45, bounce: 0.3 });
    const soft = spring({ duration: 0.55, bounce: 0.12 });
    const pop = spring({ duration: 0.5, bounce: 0.5 });
    const onTog = track(0, [[0.8, 1], [5.8, 0]], snappy);
    const onChk = track(0, [[1.4, 1], [6.4, 0]], pop);
    const val = track(20, [[2.0, 80], [7.0, 20]], soft);
    const segIdx = track(0, [[2.6, 1], [3.8, 2], [8.0, 0]], snappy);
    const liked = track(0, [[3.2, 1], [8.4, 0]], spring({ duration: 0.3, bounce: 0 }));
    const heartScale = track(1, [[3.2, 1.35, spring({ duration: 0.12 })], [3.32, 1, pop], [8.4, 0.85, spring({ duration: 0.12 })], [8.52, 1, pop]]);
    const stepVal = track(1, [[4.2, 2], [4.8, 3], [8.8, 1]], snappy);

    // 每次点击的位置和时刻，用来画波纹
    const TAPS = [
      { t: 0.8, ...at(0, 90, 63) },
      { t: 1.4, ...at(1, 90, 63) },
      { t: 2.0, ...at(2, 51, 65) },
      { t: 2.6, ...at(3, 90, 63) },
      { t: 3.2, ...at(4, 69, 63) },
      { t: 3.8, ...at(3, 138, 63) },
      { t: 4.2, ...at(5, 128, 64) },
      { t: 4.8, ...at(5, 128, 64) },
      { t: 5.8, ...at(0, 90, 63) },
      { t: 6.4, ...at(1, 90, 63) },
      { t: 7.0, ...at(2, 129, 65) },
      { t: 8.0, ...at(3, 42, 63) },
      { t: 8.4, ...at(4, 69, 63) },
      { t: 8.8, ...at(5, 52, 64) },
    ];
    const taps = TAPS.map((p) => {
      const node = el('div', 'tap', stage);
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
      return { node, t: p.t };
    });

    const press = (t: number, times: number[]) => {
      // 按下时缩小一点
      let s = 1;
      for (const at of times) if (t >= at && t < at + 0.25) s = Math.min(s, 1 - 0.12 * Math.sin(((t - at) / 0.25) * Math.PI));
      return s;
    };

    const render = (t: number) => {
      // 开关：滑块移动时被拉长一点，速度越快越长
      const a = onTog(t);
      const stretch = Math.min(10, Math.abs(onTog.velocity(t)) * 2.2);
      knob.style.width = `${32 + stretch}px`;
      knob.style.left = `${3 + a * (26 - stretch)}px`;
      tog.style.background = mixColor('#e5e5ea', '#34c759', a);
      // 勾选
      const c = onChk(t);
      chkFill.style.opacity = String(clamp(c * 1.4));
      chkFill.style.transform = `scale(${0.6 + 0.4 * c})`;
      chk.style.transform = `scale(${press(t, [1.4, 6.4])})`;
      tickPath.setAttribute('stroke-dashoffset', String(1 - clamp((c - 0.3) / 0.6)));
      // 滑块：拖动时滑块变大，数值跟着走
      const v = val(t);
      const drag = clamp(Math.abs(val.velocity(t)) / 60);
      thumb.style.left = `${(v / 100) * 130}px`;
      thumb.style.transform = `scale(${1 + 0.18 * drag})`;
      sldFill.style.width = `${(v / 100) * 130}px`;
      sldVal.style.left = `${(v / 100) * 130}px`;
      sldVal.textContent = String(Math.round(v));
      sldVal.style.transform = `translateY(${-4 * drag}px)`;
      // 分段
      const s = segIdx(t);
      segPill.style.left = `${2 + (s * (144 - 4)) / 3}px`;
      segText.forEach((span, i) => (span.style.color = mixColor('#1d1d1f', '#8e8e93', clamp(Math.abs(s - i)))));
      // 点赞：变色、放大、一圈小圆点炸开，数字往上滚一格
      const l = liked(t);
      heart.setAttribute('fill', mixColor('#ffffff', '#ff375f', l));
      heart.setAttribute('stroke', mixColor('#8e8e93', '#ff375f', l));
      heart.setAttribute('transform', `translate(17 17) scale(${heartScale(t)}) translate(-17 -17)`);
      const burst = clamp((t - 3.2) / 0.55);
      dots.forEach((d, i) => {
        const ang = (i / dots.length) * TAU - Math.PI / 2;
        const rad = 12 + burst * 16;
        d.setAttribute('cx', String(17 + Math.cos(ang) * rad));
        d.setAttribute('cy', String(17 + Math.sin(ang) * rad));
        d.setAttribute('opacity', String(burst > 0 && burst < 1 ? 1 - burst : 0));
      });
      cntStrip.style.transform = `translateY(${-l * 44}px)`;
      // 步进器：数字像滚轮一样滚动
      const n = stepVal(t);
      numStrip.style.transform = `translateY(${-n * 36}px)`;
      plus.style.transform = `scale(${press(t, [4.2, 4.8])})`;
      minus.style.transform = `scale(${press(t, [8.8])})`;
      // 点击波纹
      for (const tap of taps) {
        const k = (t - tap.t) / 0.5;
        const on = k >= 0 && k < 1;
        tap.node.style.opacity = on ? String(1 - k) : '0';
        tap.node.style.transform = `scale(${on ? 0.3 + k * 0.9 : 0})`;
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 4.6 });
  },
};
