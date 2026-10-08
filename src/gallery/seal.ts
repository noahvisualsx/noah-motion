// 印章：宣纸上，竖排的毛笔字从上往下依次“写”出来；一方红印从空中落下，
// 盖下去的瞬间压扁一下，抬起后留下带纸纹的红色印迹。最后整幅淡出，回到空白宣纸。
import { spring } from '../spring.ts';
import { track, clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, type SceneDef } from './util.ts';

const D = 8;

export const seal: SceneDef = {
  title: '印章',
  category: '文字',
  description: '宣纸上竖排的字从上往下写出来，一方红印从空中落下，盖下去时压扁一下，留下带纸纹的印迹。',
  tags: ['spring', '挤压与回弹', 'SVG 滤镜'],
  tone: 'light',
  en: {
    title: 'Seal',
    description: 'Vertical Chinese calligraphy is brushed onto rice paper from top to bottom, then a red seal drops from above, squashes as it lands and leaves a textured print.',
    tags: ['spring', 'squash & stretch', 'SVG filters'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-seal');
    injectCSS(
      'nm-seal',
      `.nm-seal{background:radial-gradient(90% 90% at 50% 40%,#fbf6ea,#efe5d1)}
.nm-seal .paper{position:absolute;inset:0;opacity:.35;mix-blend-mode:multiply}
.nm-seal .col{position:absolute;top:52px;width:64px;display:flex;flex-direction:column;align-items:center;font-family:"Songti SC","STSong","Noto Serif SC",serif;font-weight:900;font-size:44px;line-height:52px;color:#1d1a16}
.nm-seal .col span{display:block}
.nm-seal .small{font-size:20px;line-height:28px;font-weight:600;color:#6b6257}
.nm-seal .stamp,.nm-seal .print{position:absolute;left:298px;top:262px;width:84px;height:84px}
.nm-seal .stamp{border-radius:6px;background:linear-gradient(160deg,#c9a26b,#8a6a3c);box-shadow:0 30px 40px rgba(60,40,10,.25)}
.nm-seal .stamp::before{content:"";position:absolute;left:10px;right:10px;top:-58px;height:64px;border-radius:8px 8px 4px 4px;background:linear-gradient(160deg,#d8b47e,#9b774a)}
.nm-seal .print{display:grid;grid-template-columns:1fr 1fr;place-items:center;padding:8px;border:5px solid #c0311f;border-radius:4px;color:#c0311f;font-family:"Songti SC","STSong",serif;font-weight:900;font-size:27px;line-height:1;filter:url(#nmSealRough)}`,
    );
    // 宣纸纤维和印泥的粗糙边缘：用 SVG 噪声滤镜
    const defs = svg('svg', { width: 0, height: 0, style: 'position:absolute' }, stage);
    const f = svg('filter', { id: 'nmSealRough' }, defs);
    svg('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2, seed: 3, result: 'n' }, f);
    svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 3.5 }, f);
    const paper = svg('svg', { class: 'paper', viewBox: '0 0 640 400' }, stage);
    const pf = svg('filter', { id: 'nmSealPaper' }, paper);
    svg('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.75, numOctaves: 3, seed: 8 }, pf);
    svg('feColorMatrix', { values: '0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.5 0' }, pf);
    svg('rect', { width: 640, height: 400, filter: 'url(#nmSealPaper)' }, paper);

    const text = [...(options.text ?? '每个人都有自己的闪光点')];
    // 竖排：从右往左两列
    const half = Math.ceil(text.length / 2);
    const colA = el('div', 'col', stage);
    colA.style.left = '476px';
    const colB = el('div', 'col', stage);
    colB.style.left = '406px';
    const chars = text.map((ch, i) => el('span', '', i < half ? colA : colB, ch));
    const sign = el('div', 'col small', stage);
    // 落款：日期一列在正文左边，印章盖在它下面
    sign.style.left = '308px';
    sign.style.top = '60px';
    [...'二〇二六年秋'].forEach((ch) => el('span', '', sign, ch));

    const print = el('div', 'print', stage);
    [...'原创动效'].forEach((ch) => el('span', '', print, ch));
    const stamp = el('div', 'stamp', stage);

    const ink = spring({ duration: 0.5, bounce: 0 });
    const writes = chars.map((_, i) => track(0, [[0.3 + i * 0.16, 1, ink], [6.9, 0, spring({ duration: 0.6 })]]));
    const signIn = track(0, [[2.2, 1, ink], [6.9, 0, spring({ duration: 0.6 })]]);
    // 印章：2.6 秒落下（快、几乎不回弹），3.05 秒抬起
    const drop = spring({ duration: 0.38, bounce: 0.05 });
    const lift = spring({ duration: 0.6, bounce: 0 });
    const y = track(-170, [[2.6, 0, drop], [3.05, -190, lift]]);
    const squash = track(0, [[2.78, 1, spring({ duration: 0.12 })], [2.86, 0, spring({ duration: 0.35, bounce: 0.4 })]]);
    const stampO = track(0, [[2.3, 1, spring({ duration: 0.3 })], [3.3, 0, spring({ duration: 0.4 })]]);
    const printO = track(0, [[2.78, 0.92, spring({ duration: 0.15 })], [6.9, 0, spring({ duration: 0.6 })]]);

    const render = (t: number) => {
      chars.forEach((c, i) => {
        // 毛笔“写”出来：从上往下露出，同时墨色从淡到浓
        const p = clamp(writes[i]!(t));
        c.style.clipPath = `inset(0 0 ${(1 - p) * 100}% 0)`;
        c.style.opacity = String(0.25 + 0.75 * p);
      });
      const s = clamp(signIn(t));
      sign.style.opacity = String(s);
      const sq = clamp(squash(t));
      const lifted = y(t);
      stamp.style.transform = `translateY(${lifted}px) scale(${1 + Math.max(0, -lifted) / 900}, ${1 - sq * 0.08})`;
      stamp.style.boxShadow = `0 ${12 + Math.max(0, -lifted) * 0.25}px ${20 + Math.max(0, -lifted) * 0.3}px rgba(60,40,10,${0.3 - Math.min(0.2, Math.max(0, -lifted) / 900)})`;
      stamp.style.opacity = String(clamp(stampO(t)));
      const po = clamp(printO(t));
      print.style.opacity = String(po);
      print.style.transform = `scale(${0.97 + 0.03 * po})`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 4.5 });
  },
};
