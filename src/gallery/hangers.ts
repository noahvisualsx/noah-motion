// 吊牌：一排标签挂在横杆上。三阵风从左往右吹过，每阵风到达每个标签的时间不同，
// 标签绕着挂点摆动，弹簧带着越来越小的摆幅慢慢停下。时间差用“周期折回”，所以循环无缝。
import { spring } from '../spring.ts';
import { track } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, wrap, type SceneDef } from './util.ts';

const D = 8;
const GUSTS = [
  { at: 0.4, power: 22 },
  { at: 3.0, power: 15 },
  { at: 5.4, power: 10 },
];

export const hangers: SceneDef = {
  title: '吊牌',
  category: '插画',
  description: '一排标签挂在横杆上，三阵风从左往右吹过，标签依次摆动，摆幅越来越小，慢慢停下。',
  tags: ['spring', '叠加冲击', '周期折回'],
  tone: 'light',
  mount(host, options = {}) {
    const words = (options.text ?? '灵感 提示词 作品 视频 动效').split(/\s+/).filter(Boolean).slice(0, 6);
    const stage = createStage(host, 'light', 'nm-hang');
    injectCSS(
      'nm-hang',
      `.nm-hang{background:linear-gradient(180deg,#f7f3ea,#efe8da)}
.nm-hang .rail{position:absolute;left:50px;right:50px;top:64px;height:8px;border-radius:4px;background:linear-gradient(180deg,#c9a26b,#8a6a3c);box-shadow:0 4px 8px rgba(0,0,0,.12)}
.nm-hang .h{position:absolute;top:68px;width:0;height:0}
.nm-hang .arm{position:absolute;left:0;top:0;transform-origin:0 0}
.nm-hang .string{position:absolute;left:-1px;top:0;width:2px;background:#8a7d68}
.nm-hang .tag{position:absolute;left:-46px;width:92px;height:118px;border-radius:12px;display:grid;place-items:center;font-size:20px;font-weight:700;color:#1d1d1f;box-shadow:0 10px 22px rgba(60,40,10,.14)}
.nm-hang .tag::before{content:"";position:absolute;top:10px;left:50%;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:#efe8da;box-shadow:inset 0 1px 2px rgba(0,0,0,.25)}
.nm-hang .wind{position:absolute;top:0;left:0;height:2px;border-radius:1px;background:linear-gradient(90deg,transparent,rgba(91,122,166,.5),transparent)}`,
    );
    el('div', 'rail', stage);
    const colors = ['#ffd6e0', '#cfe4ff', '#d9f7e8', '#ffe8b8', '#e6dcff', '#ffd9c7'];
    const n = words.length;
    const tags = words.map((w, i) => {
      const x = 50 + ((540 - 0) * (i + 0.5)) / n;
      const len = 46 + ((i * 37) % 3) * 22; // 绳长不一样，错落一点
      const hook = el('div', 'h', stage);
      hook.style.left = `${x}px`;
      const arm = el('div', 'arm', hook);
      const string = el('div', 'string', arm);
      string.style.height = `${len}px`;
      const tag = el('div', 'tag', arm, w);
      tag.style.top = `${len}px`;
      tag.style.background = colors[i % colors.length]!;
      // 风从左往右走，到达每个标签有延迟；绳越长摆得越慢
      const delay = (x - 50) / 540;
      const s = spring({ duration: 1.1 + len / 200, bounce: 0.62 });
      return { arm, gusts: GUSTS.map((g) => ({ at: g.at + delay, power: g.power })), pulse: track(0, [[0, 1, s], [0.22, 0, s]]) }; // 一阵风持续 0.22 秒，然后弹簧自己摆
    });
    const winds = GUSTS.map(() => el('div', 'wind', stage));

    const render = (t: number) => {
      for (const tg of tags) {
        let a = 0;
        for (const g of tg.gusts) {
          const local = wrap(t, g.at, D);
          if (local < 4) a += tg.pulse(local) * g.power;
        }
        tg.arm.style.transform = `rotate(${a}deg)`;
      }
      // 每阵风一道淡淡的风线从左往右划过
      GUSTS.forEach((g, i) => {
        const local = wrap(t, g.at - 0.2, D);
        const w = winds[i]!;
        const p = local / 1.3;
        w.style.opacity = p < 1 ? String(Math.sin(p * Math.PI) * (g.power / 22)) : '0';
        w.style.width = '160px';
        w.style.transform = `translate(${-160 + p * 800}px, ${150 + i * 46}px)`;
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 2.9 });
  },
};
