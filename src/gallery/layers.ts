// 图层爆炸：一张做好的海报，切到“分层”视图后斜着倒下去，背景、装饰、主体、文案、按钮五层沿 Z 轴一层层浮起来，
// 每层右下角拉出一条引线标出层名；选中框从最上层一路往下扫，被选中的那层再抬高一点；最后一层层合回去，变回成品。
// 五层是真正的 DOM 平面，用 CSS 3D 变换摆放；引线的端点用同一套旋转和透视公式算出来，所以始终贴着平面的角。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { easeInOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, TAU, type SceneDef } from './util.ts';

const D = 8.4;
const PW = 200; // 海报尺寸
const PH = 260;
const PX = 320; // 海报中心
const PY = 200;
const GAP = 52; // 层间距
const P = 1500; // 透视距离
const LX = 426; // 层名标签那一列
const TILT = 0.6;
const BACK = 5.75;

const TEXT = {
  zh: {
    names: ['背景', '装饰', '主体', '文案', '按钮'],
    metas: ['渐变 · 网格', '矢量 × 9', '球体 · 光环', '文字 × 4', '组件'],
    frame: '海报 / 大会主视觉',
    flat: '平面',
    split: '分层',
    sub: '设计与动效大会',
    date: ['11.08—11.09', '上海 · 西岸'],
    cta: '立即报名',
  },
  en: {
    names: ['Background', 'Decoration', 'Subject', 'Copy', 'Button'],
    metas: ['Gradient · grid', 'Vector × 9', 'Sphere · ring', 'Text × 4', 'Component'],
    frame: 'Poster / Key visual',
    flat: 'Flat',
    split: 'Layers',
    sub: 'Design & Motion Conf.',
    date: ['Nov 8—9', 'Shanghai'],
    cta: 'Register',
  },
};
const ICONS = [
  'M2.5 2.5h9v9h-9zM2.5 8.5l3-3 6 6', // 背景：带渐变的矩形
  'M7 1.8l1.3 3.9 3.9 1.3-3.9 1.3L7 12.2 5.7 8.3 1.8 7l3.9-1.3z', // 装饰：星芒
  'M7 2a5 5 0 1 1 0 10A5 5 0 0 1 7 2zM1.5 9.5c2.5-1.2 8.5-4 11-5', // 主体：带光环的球
  'M3 3.5h8M7 3.5v8', // 文案：T
  'M7 1.8l2.4 2.4L7 6.6 4.6 4.2zM7 7.4l2.4 2.4L7 12.2 4.6 9.8zM4.2 4.6l2.4 2.4-2.4 2.4L1.8 7zM9.8 4.6 12.2 7l-2.4 2.4L7.4 7z', // 按钮：组件
];

export const layers: SceneDef = {
  title: '图层爆炸',
  category: '图形',
  description: '一张做好的海报斜着倒下，背景、装饰、主体、文案、按钮五层沿 Z 轴浮起并标出层名，选中框逐层扫过，最后合回成品。',
  tags: ['spring', 'track', 'stagger', 'CSS 3D'],
  tone: 'dark',
  en: {
    title: 'Exploded layers',
    description: 'A finished poster tips back and its five layers (background, decoration, subject, copy, button) float apart along Z with name tags, a selection sweeps through them, then they stack back into the final piece.',
    tags: ['spring', 'track', 'stagger', 'CSS 3D'],
  },
  mount(host, options = {}) {
    const L = TEXT[options.lang ?? 'zh'];
    const stage = createStage(host, 'dark', 'nm-layers');
    injectCSS(
      'nm-layers',
      `.nm-layers{background:#141417;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.3px),radial-gradient(90% 70% at 40% 45%,#1f1d2b 0%,#141417 70%);background-size:18px 18px,100% 100%;background-position:9px 9px,0 0}
.nm-layers .ly{position:absolute;left:${PX - PW / 2}px;top:${PY - PH / 2}px;width:${PW}px;height:${PH}px;transform-origin:50% 50%;will-change:transform}
.nm-layers .ct{position:absolute;inset:0;border-radius:6px;overflow:hidden}
.nm-layers .plate{position:absolute;inset:0;border-radius:6px;background:linear-gradient(135deg,rgba(44,40,66,.34),rgba(22,22,30,.24));box-shadow:inset 0 0 0 1px rgba(255,255,255,.26),inset 0 1px 0 rgba(255,255,255,.3)}
.nm-layers .sel{position:absolute;inset:-1px;border-radius:6px;box-shadow:0 0 0 1.5px #0d99ff,0 0 24px rgba(13,153,255,.35)}
.nm-layers .sel i{position:absolute;width:7px;height:7px;background:#fff;border:1.5px solid #0d99ff;border-radius:1.5px}
.nm-layers .bg{background:radial-gradient(75% 45% at 64% 74%,rgba(255,120,120,.6) 0%,transparent 70%),radial-gradient(80% 50% at 15% 10%,rgba(110,70,255,.45) 0%,transparent 70%),linear-gradient(176deg,#0e0a2b 0%,#1f135a 42%,#56207e 74%,#b4426e 100%)}
.nm-layers .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:20px 20px;
  -webkit-mask:linear-gradient(180deg,transparent 30%,#000 75%,rgba(0,0,0,.4) 100%);mask:linear-gradient(180deg,transparent 30%,#000 75%,rgba(0,0,0,.4) 100%)}
.nm-layers .sun{position:absolute;left:52px;top:114px;width:140px;height:140px;border-radius:50%;
  background:radial-gradient(circle at 32% 26%,#fff4da 0%,#ffc27a 14%,#ff7a6e 38%,#c23c98 66%,#3a1d8c 94%);
  box-shadow:0 0 56px rgba(255,110,150,.5),inset -12px -16px 34px rgba(30,10,90,.55)}
.nm-layers .cp{position:absolute;color:#fff;white-space:nowrap}
.nm-layers .vol{left:14px;top:12px;font:600 8.5px/1 "SF Mono",ui-monospace,Menlo,monospace;letter-spacing:.14em;opacity:.8}
.nm-layers .yr{right:14px;top:12px;font:600 8.5px/1 "SF Mono",ui-monospace,Menlo,monospace;letter-spacing:.14em;opacity:.8}
.nm-layers .big{left:12px;top:26px;font-weight:850;letter-spacing:-.045em;line-height:1}
.nm-layers .sub{left:15px;font-size:11px;font-weight:650;opacity:.95}
.nm-layers .date{left:15px;font-size:8.5px;font-weight:600;opacity:.7;letter-spacing:.02em}
.nm-layers .btn{position:absolute;left:14px;bottom:13px;height:24px;padding:0 10px 0 11px;border-radius:12px;background:#fff;color:#1a1240;font-size:10px;font-weight:750;display:flex;align-items:center;gap:4px;white-space:nowrap;box-shadow:0 4px 12px rgba(20,8,60,.35)}
.nm-layers .gloss{position:absolute;top:-40px;bottom:-40px;width:70px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.32),transparent)}
.nm-layers .shadow{position:absolute;left:${PX - PW / 2}px;top:${PY - PH / 2}px;width:${PW}px;height:${PH}px;border-radius:12px;background:#000;filter:blur(18px)}
.nm-layers svg.ov{position:absolute;left:0;top:0;width:640px;height:400px;overflow:visible;pointer-events:none}
.nm-layers .tag{position:absolute;left:${LX}px;top:0;height:28px;padding:0 10px 0 7px;border-radius:9px;display:flex;align-items:center;gap:7px;white-space:nowrap;
  background:rgba(32,32,38,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 8px 20px rgba(0,0,0,.35);font-size:12px;font-weight:600;color:#f5f5f7;transform-origin:0 50%}
.nm-layers .tag svg{display:block}
.nm-layers .tag small{font-size:10.5px;font-weight:500;color:rgba(235,235,245,.5)}
.nm-layers .frame{position:absolute;left:${PX - PW / 2}px;top:${PY - PH / 2 - 20}px;width:${PW}px;display:flex;justify-content:space-between;font-size:10.5px;color:rgba(235,235,245,.55);white-space:nowrap}
.nm-layers .seg{position:absolute;left:${PX - 70}px;top:362px;width:140px;height:28px;border-radius:14px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);display:flex;font-size:11.5px;font-weight:600}
.nm-layers .seg span{position:relative;flex:1;display:grid;place-items:center;z-index:1}
.nm-layers .seg .knob{position:absolute;left:3px;top:3px;width:67px;height:22px;border-radius:11px;background:#f5f5f7;box-shadow:0 2px 6px rgba(0,0,0,.3)}`,
    );

    // 地上的影子：在最底层再往下一点，分开时变大变淡
    const shadow = el('div', 'shadow', stage);

    // ---------- 五层海报 ----------
    const mk = () => {
      const ly = el('div', 'ly', stage);
      const plate = el('div', 'plate', ly); // 分层时每层底下的一块玻璃板，在内容后面
      const ct = el('div', 'ct', ly);
      const sel = el('div', 'sel', ly);
      [[-4, -4], [PW - 3, -4], [-4, PH - 3], [PW - 3, PH - 3]].forEach(([x, y]) => {
        const h = el('i', '', sel);
        h.style.left = `${x}px`;
        h.style.top = `${y}px`;
      });
      return { ly, ct, plate, sel };
    };
    // 1 背景
    const l0 = mk();
    l0.ct.classList.add('bg');
    el('div', 'grid', l0.ct);
    // 2 装饰：轨道圈、星芒、小圆点
    const l1 = mk();
    const deco = svg('svg', { width: PW, height: PH, viewBox: `0 0 ${PW} ${PH}`, fill: 'none' }, l1.ct);
    svg('circle', { cx: 122, cy: 184, r: 92, stroke: 'rgba(255,255,255,.2)', 'stroke-width': 0.8 }, deco);
    svg('circle', { cx: 122, cy: 184, r: 112, stroke: 'rgba(255,255,255,.14)', 'stroke-width': 0.8, 'stroke-dasharray': '2 4' }, deco);
    svg('path', { d: 'M174 94A104 104 0 0 1 219.7 148.4', stroke: 'rgba(255,214,170,.7)', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, deco);
    const stars = [
      [172, 44, 7],
      [150, 96, 4],
      [26, 156, 5],
      [186, 128, 3.5],
      [34, 124, 3],
    ].map(([x, y, r], i) => {
      const s = svg('path', { d: `M${x} ${y! - r!}L${x! + r! * 0.28} ${y! - r! * 0.28}L${x! + r!} ${y}L${x! + r! * 0.28} ${y! + r! * 0.28}L${x} ${y! + r!}L${x! - r! * 0.28} ${y! + r! * 0.28}L${x! - r!} ${y}L${x! - r! * 0.28} ${y! - r! * 0.28}Z`, fill: '#fff' }, deco);
      return { s, i };
    });
    [[124, 24], [188, 84], [14, 112], [40, 196], [108, 70]].forEach(([x, y]) => svg('circle', { cx: x!, cy: y!, r: 1.3, fill: 'rgba(255,255,255,.7)' }, deco));
    // 3 主体：发光的球 + 一圈光环（后半圈在球后面，前半圈在球前面）
    const l2 = mk();
    const ringBack = svg('svg', { width: PW, height: PH, viewBox: `0 0 ${PW} ${PH}`, fill: 'none' }, l2.ct);
    ringBack.style.position = 'absolute';
    svg('path', { d: 'M27.8 211A98 22 -16 0 1 216.2 157', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1.6 }, ringBack);
    el('div', 'sun', l2.ct);
    const ringFront = svg('svg', { width: PW, height: PH, viewBox: `0 0 ${PW} ${PH}`, fill: 'none' }, l2.ct);
    ringFront.style.position = 'absolute';
    const rg = svg('linearGradient', { id: `nmLyRing${Math.floor(Math.random() * 1e6)}`, x1: 0, y1: 0, x2: 1, y2: 0 }, ringFront);
    svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.2 }, rg);
    svg('stop', { offset: 0.5, 'stop-color': '#ffe2b8', 'stop-opacity': 1 }, rg);
    svg('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0.25 }, rg);
    svg('path', { d: 'M27.8 211A98 22 -16 0 0 216.2 157', stroke: `url(#${rg.id})`, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, ringFront);
    // 4 文案
    const l3 = mk();
    el('div', 'cp vol', l3.ct, 'VOL.04');
    el('div', 'cp yr', l3.ct, '2026');
    const title = options.text ?? 'ORBIT';
    const big = el('div', 'cp big', l3.ct, title);
    // 标题按字宽自动缩小：中日韩字符按 1 个字号宽，其他按 0.62
    const units = [...title].reduce((s, ch) => s + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.64), 0);
    const size = Math.min(54, 176 / Math.max(units, 1));
    big.style.fontSize = `${size}px`;
    el('div', 'cp sub', l3.ct, L.sub).style.top = `${30 + size}px`;
    el('div', 'cp date', l3.ct, L.date.join(' · ')).style.top = `${46 + size}px`;
    // 5 按钮
    const l4 = mk();
    const btn = el('div', 'btn', l4.ct, L.cta);
    const arrow = svg('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: '#1a1240', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, btn);
    svg('path', { d: 'M2 5h6M5.5 2.5 8 5 5.5 7.5' }, arrow);
    const gloss = el('i', 'gloss', l4.ct);
    const LAYERS = [l0, l1, l2, l3, l4];
    l0.plate.style.display = 'none';

    // 叠在最上面的 2D 层：引线、标签、画框名、切换开关
    const ov = svg('svg', { class: 'ov', viewBox: '0 0 640 400' }, stage);
    const leads = LAYERS.map(() => ({
      line: svg('path', { stroke: 'rgba(235,235,245,.45)', 'stroke-width': 1, fill: 'none', 'stroke-dasharray': '3 3' }, ov),
      dot: svg('circle', { r: 2.6, fill: '#f5f5f7' }, ov),
    }));
    const tagMeta: HTMLElement[] = [];
    const tags = LAYERS.map((_, i) => {
      const tag = el('div', 'tag', stage);
      const ic = svg('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, tag);
      svg('path', { d: ICONS[i]! }, ic);
      el('span', '', tag, L.names[i]);
      tagMeta.push(el('small', '', tag, L.metas[i]));
      return tag;
    });
    const frame = el('div', 'frame', stage);
    el('span', '', frame, L.frame);
    el('span', '', frame, '1080 × 1404');
    const seg = el('div', 'seg', stage);
    const knob = el('i', 'knob', seg);
    const segA = el('span', '', seg, L.flat);
    const segB = el('span', '', seg, L.split);

    // ---------- 剧本 ----------
    const tilt = spring({ duration: 1.1, bounce: 0.12 });
    const settle = spring({ duration: 0.95, bounce: 0.18 });
    const lift = spring({ duration: 0.9, bounce: 0.28 });
    const land = spring({ duration: 0.6, bounce: 0.22 });
    const pop = spring({ duration: 0.42, bounce: 0.3 });
    const soft = spring({ duration: 0.35, bounce: 0 });
    const ax = track(0, [[TILT, 60, tilt], [BACK, 0, settle]]);
    const az = track(0, [[TILT, -42, tilt], [BACK, 0, settle]]);
    const sc = track(1, [[TILT, 0.74, tilt], [BACK, 1, settle]]);
    const tx = track(0, [[TILT, -84, tilt], [BACK, 0, settle]]);
    const ty = track(0, [[TILT, -4, tilt], [BACK, 0, settle]]);
    const flatK = track(0, [[TILT - 0.05, 1, soft], [BACK - 0.05, 0, soft]]); // 0 = 平面，1 = 分层
    // 分开：最上层先走、走得最远；合回：最下层先落
    const sep = LAYERS.map((_, i) => track(0, [[TILT + 0.18 + (4 - i) * 0.07, 1, lift], [BACK - 0.25 + i * 0.06, 0, land]]));
    // 选中框：从按钮一路往下扫到背景
    const SEL0 = 2.65;
    const SEL_DT = 0.5;
    const sel = LAYERS.map((_, i) => {
      const at = SEL0 + (4 - i) * SEL_DT;
      return track(0, [[at, 1, soft], [at + SEL_DT, 0, soft]]);
    });
    const tagIn = LAYERS.map((_, i) => track(0, [[1.65 + (4 - i) * 0.09, 1, pop], [BACK - 0.45 + i * 0.04, 0, soft]]));

    /** 层坐标 (x, y) 经过 平移 → 透视 → rotateX → rotateZ → translateZ → scale 之后在舞台上的位置（和 CSS 的变换顺序一致） */
    const project = (x: number, y: number, z: number, a: number, b: number, s: number, ox: number, oy: number) => {
      const X = x * s;
      const Y = y * s;
      const cz = Math.cos(b);
      const sz = Math.sin(b);
      const x1 = X * cz - Y * sz;
      const y1 = X * sz + Y * cz;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const y2 = y1 * ca - z * sa;
      const z2 = y1 * sa + z * ca;
      const f = P / (P - z2);
      return [PX + ox + x1 * f, PY + oy + y2 * f] as const;
    };

    const render = (t: number) => {
      const A = ax(t);
      const B = az(t) + 5 * Math.sin(Math.PI * clamp((t - 1.7) / 3.9)); // 停留时整摞慢慢转一点再转回来
      const S = sc(t);
      const X = tx(t);
      const Y = ty(t);
      const E = clamp(A / 60); // 倒下去的程度，用来淡入淡出辅助元素
      const aR = (A * Math.PI) / 180;
      const bR = (B * Math.PI) / 180;

      LAYERS.forEach((l, i) => {
        const sp = sep[i]!(t);
        const sk = clamp(sel[i]!(t));
        const bob = Math.sin((TAU * t) / 3 + i * 1.1) * 3 * E;
        const z = (i - 2) * GAP * sp + 14 * sel[i]!(t) + bob;
        l.ly.style.transform = `translate(${X}px, ${Y}px) perspective(${P}px) rotateX(${A}deg) rotateZ(${B}deg) translateZ(${z}px) scale(${S})`;
        l.plate.style.opacity = String(clamp(sp) * E);
        l.sel.style.opacity = String(sk);
        // 引线和标签：从这一层的右下角水平拉到标签
        const [cx, cy] = project(PW / 2, PH / 2, z, aR, bR, S, X, Y);
        const ti = tagIn[i]!(t);
        const show = clamp(ti);
        const { line, dot } = leads[i]!;
        const end = mix(cx, LX - 8, clamp(ti * 1.4));
        line.setAttribute('d', `M${cx} ${cy}H${end}`);
        line.setAttribute('opacity', String(show));
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', String(cy));
        dot.setAttribute('opacity', String(show));
        dot.setAttribute('fill', sk > 0.5 ? '#0d99ff' : '#f5f5f7');
        const tag = tags[i]!;
        tag.style.opacity = String(show);
        tag.style.transform = `translate(${(1 - ti) * -14}px, ${cy - 14}px) scale(${0.8 + 0.2 * ti})`;
        tag.style.background = sk > 0.5 ? '#0d99ff' : '';
        tag.style.boxShadow = sk > 0.5 ? '0 8px 22px rgba(13,153,255,.4)' : '';
        tagMeta[i]!.style.color = sk > 0.5 ? 'rgba(255,255,255,.78)' : '';
      });

      // 地上的影子跟着最底层，再往下一点
      const z0 = -2 * GAP * sep[0]!(t) - 30 * E;
      shadow.style.transform = `translate(${X}px, ${Y + 8 * (1 - E)}px) perspective(${P}px) rotateX(${A}deg) rotateZ(${B}deg) translateZ(${z0}px) scale(${S * (0.92 + 0.06 * E)})`;
      shadow.style.opacity = String(0.55 + 0.15 * E);

      // 星芒一闪一闪（周期整除总时长）
      stars.forEach(({ s, i }) => s.setAttribute('opacity', String(0.55 + 0.45 * Math.sin((TAU * t * (i + 2)) / D + i * 1.7) ** 2)));

      // 画框名、切换开关
      frame.style.opacity = String(1 - clamp(E * 2.5));
      const f = flatK(t);
      knob.style.transform = `translateX(${f * 67}px)`;
      segA.style.color = f < 0.5 ? '#141417' : 'rgba(235,235,245,.6)';
      segB.style.color = f >= 0.5 ? '#141417' : 'rgba(235,235,245,.6)';
      // 合回成品后，一道光扫过海报
      const gk = clamp((t - (BACK + 1.05)) / 0.9);
      gloss.style.opacity = gk > 0 && gk < 1 ? String(Math.sin(gk * Math.PI)) : '0';
      gloss.style.transform = `translateX(${mix(-90, PW + 20, easeInOut(gk))}px) skewX(-14deg)`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 2.6 });
  },
};
