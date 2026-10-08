// 三折页：一张折起来的卡片悬在空中，右页、左页依次带透视展开（铰链在折痕上），
// 里面的内容逐个弹出；停留后内容收起，两页再折回去，回到最初的封面。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, type SceneDef } from './util.ts';

const D = 8;
const PANEL_W = 140;
const PANEL_H = 220;

export const fold: SceneDef = {
  title: '三折页',
  category: '界面',
  description: '一张折起来的卡片，左右两页沿折痕带透视依次展开，内容逐个弹出，再原样折回去。',
  tags: ['track', '3D 透视', 'spring'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-fold');
    injectCSS(
      'nm-fold',
      `.nm-fold{background:radial-gradient(70% 80% at 50% 30%,#fff,#ecebe6)}
.nm-fold .scene{position:absolute;left:${320 - PANEL_W / 2}px;top:${200 - PANEL_H / 2 - 6}px;width:${PANEL_W}px;height:${PANEL_H}px;perspective:1100px}
.nm-fold .rig{position:absolute;inset:0;transform-style:preserve-3d}
.nm-fold .panel{position:absolute;top:0;width:${PANEL_W}px;height:${PANEL_H}px;transform-style:preserve-3d}
.nm-fold .face{position:absolute;inset:0;border-radius:6px;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.nm-fold .back{transform:rotateY(180deg)}
.nm-fold .mid .face{background:#fff}
.nm-fold .left{left:0;transform-origin:0 50%}
.nm-fold .right{left:0;transform-origin:100% 50%}
.nm-fold .in{background:#fff;padding:22px 16px}
.nm-fold .cover{background:linear-gradient(160deg,#1d1d1f,#3a3a3c);color:#fff;padding:22px 16px}
.nm-fold .cover b{display:block;font-size:30px;letter-spacing:-.03em;line-height:1}
.nm-fold .cover i{display:block;margin-top:8px;font-style:normal;font-size:11px;letter-spacing:.2em;color:rgba(255,255,255,.6)}
.nm-fold .cover u{position:absolute;left:16px;bottom:18px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#0071e3,#5ac8fa)}
.nm-fold .k{font-size:10px;letter-spacing:.18em;color:#86868b;font-weight:600}
.nm-fold .h{margin-top:6px;font-size:19px;font-weight:700;letter-spacing:-.02em;line-height:1.2}
.nm-fold .bar{height:7px;border-radius:4px;background:#e8e8ed;margin-top:10px}
.nm-fold .chip{display:inline-block;margin-top:14px;height:26px;padding:0 12px;border-radius:13px;background:#1d1d1f;color:#fff;font-size:12px;font-weight:600;line-height:26px}
.nm-fold .art{height:92px;border-radius:10px;margin-top:12px}
.nm-fold .shadow{position:absolute;left:${320 - 170}px;top:${200 + PANEL_H / 2 + 14}px;width:340px;height:18px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.18),transparent)}`,
    );
    const shadow = el('div', 'shadow', stage);
    const scene = el('div', 'scene', stage);
    const rig = el('div', 'rig', scene);

    // 中页（不动）
    const mid = el('div', 'panel mid', rig);
    const midFace = el('div', 'face in', mid);
    const midItems = [
      el('div', 'k', midFace, 'NOAH-MOTION'),
      el('div', 'h', midFace, options.text ?? '把时间写成函数'),
      el('div', 'art', midFace),
      el('div', 'bar', midFace),
    ];
    midItems[2]!.style.background = 'linear-gradient(135deg,#a1c4fd,#c2e9fb)';
    (midItems[3] as HTMLElement).style.width = '70%';

    // 左页：铰链在右边，起始折到中页上方（rotateY 180°）
    const left = el('div', 'panel left', rig);
    left.style.transformOrigin = '100% 50%';
    left.style.left = `${-PANEL_W}px`;
    const leftIn = el('div', 'face in', left);
    const leftItems = [el('div', 'k', leftIn, 'SPRING'), el('div', 'art', leftIn), el('div', 'bar', leftIn), el('div', 'bar', leftIn)];
    leftItems[1]!.style.background = 'linear-gradient(135deg,#fbc2eb,#a6c1ee)';
    (leftItems[3] as HTMLElement).style.width = '55%';
    const leftBack = el('div', 'face back cover', left);
    el('b', '', leftBack, 'motion');
    el('i', '', leftBack, 'VOL. 01');
    el('u', '', leftBack);

    // 右页：铰链在左边，起始折到中页上方（rotateY -180°），折起时压在左页下面
    const right = el('div', 'panel right', rig);
    right.style.transformOrigin = '0 50%';
    right.style.left = `${PANEL_W}px`;
    const rightIn = el('div', 'face in', right);
    const rightItems = [el('div', 'k', rightIn, 'TIMELINE'), el('div', 'h', rightIn, '随意拖动'), el('div', 'bar', rightIn), el('span', 'chip', rightIn, '开始 →')];
    const rightBack = el('div', 'face back', right);
    rightBack.style.background = '#f2f2f7';

    const hinge = spring({ duration: 0.85, bounce: 0.14 });
    const pop = spring({ duration: 0.5, bounce: 0.35 });
    const close = spring({ duration: 0.7, bounce: 0.06 });
    // 展开：右页 0.5 秒、左页 1.0 秒；折回：左页 5.6 秒、右页 6.0 秒
    const rightAngle = track(-180, [[0.5, 0, hinge], [6.0, -180, close]]);
    const leftAngle = track(180, [[1.0, 0, hinge], [5.6, 180, close]]);
    const tilt = track(-14, [[0.6, -6, hinge], [6.2, -14, close]]);
    const all = [...leftItems, ...midItems, ...rightItems];
    const items = all.map((node, i) => ({ node, p: track(0, [[1.6 + i * 0.06, 1, pop], [5.1 + (all.length - i) * 0.025, 0, close]]) }));

    const render = (t: number) => {
      const ra = rightAngle(t);
      const la = leftAngle(t);
      // 3D 里 z-index 不起作用：折起的页按折叠程度往前推一点（左页在最上，右页在中间），避免和中页重叠闪烁
      const rf = clamp(Math.abs(ra) / 180);
      const lf = clamp(Math.abs(la) / 180);
      right.style.transform = `translateZ(${rf * 1.5}px) rotateY(${ra}deg)`;
      left.style.transform = `translateZ(${lf * 3}px) rotateY(${la}deg)`;
      rig.style.transform = `rotateX(10deg) rotateY(${tilt(t)}deg)`;
      const open = 1 - rf * 0.5 - lf * 0.5;
      shadow.style.transform = `scaleX(${0.45 + open * 0.55})`;
      for (const it of items) {
        const p = it.p(t);
        it.node.style.opacity = String(clamp(p));
        it.node.style.transform = `translateY(${(1 - p) * 10}px)`;
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.5 });
  },
};
