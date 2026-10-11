// 扩散出图：提示词在输入框里逐字打出，光标移过去点“生成”；画面从一整片彩色噪点开始，
// 每一步都重新采样噪点、补上一点细节，30 步之后定格成一张黄昏海边的照片。
// 每一步的画面只由步数决定（噪点用 seeded 生成），拖到哪一帧都一样；画完后清空输入框，回到开头。
import { spring } from '../spring.ts';
import { track, clamp, mix, remap } from '../track.ts';
import { easeInOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, seeded, smooth, TAU, type SceneDef } from './util.ts';

const D = 12;
// 图像区域（逻辑像素）
const IX = 96;
const IY = 20;
const IW = 448;
const IH = 280;
const STEPS = 30;
const GEN = 3.2; // 开始采样
const GEN_DUR = 4.4; // 30 步用时
const DONE = GEN + GEN_DUR;
const RESET = 10.75; // 开始清空

const TEXT = {
  zh: {
    prompt: '黄昏的海边，落日沉进海平线，金色波光，一艘小帆船，电影感，35mm 胶片',
    placeholder: '描述你想生成的画面…',
    empty: '图像会出现在这里',
    go: '生成',
    busy: '生成中',
    step: '步数',
    done: '完成',
    sec: ' 秒',
    meta: '16:10 · 种子 2718',
  },
  en: {
    prompt: 'A beach at dusk, the sun sinking into the sea, golden glints, a lone sailboat, 35mm',
    placeholder: 'Describe the image you want…',
    empty: 'Your image will appear here',
    go: 'Generate',
    busy: 'Working',
    step: 'Step',
    done: 'Done',
    sec: 's',
    meta: '16:10 · Seed 2718',
  },
};

export const diffusion: SceneDef = {
  title: '扩散出图',
  category: '界面',
  description: '提示词逐字打进输入框，点下生成，画面从纯噪点一步步去噪，30 步后定格成一张黄昏海边的照片。',
  tags: ['spring', 'track', 'canvas', '确定性随机'],
  tone: 'dark',
  en: {
    title: 'Diffusion',
    description: 'A prompt is typed into the box and Generate is clicked. The picture starts as pure noise and is denoised step by step until, 30 steps later, it settles into a beach at dusk.',
    tags: ['spring', 'track', 'canvas', 'deterministic noise'],
  },
  mount(host, options = {}) {
    const L = TEXT[options.lang ?? 'zh'];
    const stage = createStage(host, 'dark', 'nm-diff');
    injectCSS(
      'nm-diff',
      `.nm-diff{background:radial-gradient(120% 90% at 50% 0%,#1a1830 0%,#0d0d12 55%,#09090c 100%)}
.nm-diff .frame{position:absolute;left:${IX}px;top:${IY}px;width:${IW}px;height:${IH}px;border-radius:18px;background:#141418;overflow:hidden;
  box-shadow:0 0 0 1px rgba(255,255,255,.07),0 24px 60px rgba(0,0,0,.55);transform-origin:50% 50%}
.nm-diff .ring,.nm-diff .halo{position:absolute;left:${IX - 1}px;top:${IY - 1}px;width:${IW + 2}px;height:${IH + 2}px;border-radius:19px;padding:1.5px;
  background:conic-gradient(from var(--a,0deg),transparent 0deg,#7d6bff 50deg,#ff7ac3 95deg,#ffc27a 120deg,transparent 170deg,transparent 360deg);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.nm-diff .halo{filter:blur(10px);padding:4px}
.nm-diff .aura{position:absolute;inset:-40px;background:radial-gradient(40% 50% at 62% 62%,rgba(255,150,110,.5),transparent 70%),radial-gradient(45% 55% at 30% 30%,rgba(125,107,255,.5),transparent 70%),radial-gradient(35% 45% at 80% 25%,rgba(255,122,195,.4),transparent 70%);filter:blur(10px)}
.nm-diff .ph{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:12px;color:rgba(235,235,245,.38);font-size:13px;
  background-image:radial-gradient(rgba(255,255,255,.075) 1px,transparent 1.2px);background-size:16px 16px;background-position:8px 8px}
.nm-diff canvas{position:absolute;inset:0;width:${IW}px;height:${IH}px}
.nm-diff .chip{position:absolute;top:12px;height:26px;padding:0 10px;border-radius:13px;display:flex;align-items:center;gap:7px;
  background:rgba(12,12,16,.52);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);
  font-size:11.5px;font-weight:600;color:#f5f5f7;white-space:nowrap;font-variant-numeric:tabular-nums}
.nm-diff .chip.l{left:12px;transform-origin:0 50%}
.nm-diff .chip.r{right:12px;color:rgba(245,245,247,.72);font-weight:500;transform-origin:100% 50%}
.nm-diff .spin{width:11px;height:11px;border-radius:50%;border:1.6px solid rgba(255,255,255,.22);border-top-color:#b7a9ff}
.nm-diff .ok{width:14px;height:14px;border-radius:50%;background:#34c759;display:grid;place-items:center}
.nm-diff .bar{position:absolute;left:14px;right:14px;bottom:12px;height:4px;border-radius:2px;background:rgba(255,255,255,.16);overflow:hidden}
.nm-diff .bar i{position:absolute;inset:0;transform-origin:0 50%;background:linear-gradient(90deg,#7d6bff,#ff7ac3 70%,#ffc27a)}
.nm-diff .sweep{position:absolute;top:-20px;bottom:-20px;width:120px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);mix-blend-mode:soft-light}
.nm-diff .acts{position:absolute;right:12px;bottom:12px;display:flex;gap:6px}
.nm-diff .acts span{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(12,12,16,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.nm-diff .box{position:absolute;left:${IX}px;top:316px;width:${IW}px;height:66px;border-radius:20px;background:linear-gradient(180deg,#1b1b21,#151519);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 0 0 1px rgba(255,255,255,.08),0 16px 40px rgba(0,0,0,.4)}
.nm-diff .focus{position:absolute;inset:-3px;border-radius:23px;box-shadow:0 0 0 1.5px rgba(139,123,255,.75),0 0 18px rgba(139,123,255,.35)}
.nm-diff .spark{position:absolute;left:16px;top:16px}
.nm-diff .field{position:absolute;left:44px;top:13px;width:${IW - 44 - 112}px;height:40px;overflow:hidden;font-size:13.5px;line-height:20px;color:#f5f5f7}
.nm-diff .field .tx{position:absolute;left:0;top:0;right:0}
.nm-diff .field .tx b{font-weight:400;border-radius:3px}
.nm-diff .caret{display:inline-block;width:1.5px;height:16px;margin-left:1px;vertical-align:-3px;background:#a99bff}
.nm-diff .hint{position:absolute;left:0;top:0;color:rgba(235,235,245,.34);white-space:nowrap}
.nm-diff .go{position:absolute;right:12px;top:13px;height:40px;min-width:92px;padding:0 15px;border-radius:13px;display:flex;align-items:center;justify-content:center;gap:7px;
  background:linear-gradient(135deg,#7f6bff,#b56bff 55%,#ff7ac3);color:#fff;font-size:13.5px;font-weight:650;white-space:nowrap;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 6px 18px rgba(150,100,255,.35)}
.nm-diff .wave{position:absolute;left:${IX + IW - 12 - 46}px;top:349px;width:0;height:0}
.nm-diff .wave i{position:absolute;left:-60px;top:-28px;width:120px;height:56px;border-radius:24px;box-shadow:0 0 0 2px rgba(190,160,255,.8)}
.nm-diff .cur{position:absolute;left:0;top:0;width:22px;height:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}`,
    );

    // 背后流动的彩色描边：生成时绕着图像转
    const halo = el('div', 'halo', stage);
    const ring = el('div', 'ring', stage);
    const frame = el('div', 'frame', stage);
    // 打字时占位区里慢慢聚起一团和提示词同色调的光，像画面在“酝酿”
    const aura = el('div', 'aura', frame);
    const ph = el('div', 'ph', frame);
    const icon = svg('svg', { width: 34, height: 34, viewBox: '0 0 34 34', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, ph);
    svg('rect', { x: 3, y: 5, width: 28, height: 24, rx: 6 }, icon);
    svg('path', { d: 'M4 24l8-8 6 6 4-4 8 8', 'stroke-linecap': 'round' }, icon);
    svg('circle', { cx: 23, cy: 12, r: 2.6 }, icon);
    el('div', '', ph, L.empty);

    const canvas = document.createElement('canvas');
    canvas.width = IW * 2;
    canvas.height = IH * 2;
    frame.append(canvas);
    const ctx = canvas.getContext('2d')!;

    const sweep = el('div', 'sweep', frame);
    const chipL = el('div', 'chip l', frame);
    const spin = el('i', 'spin', chipL);
    const ok = el('i', 'ok', chipL);
    const okSvg = svg('svg', { width: 8, height: 8, viewBox: '0 0 8 8', fill: 'none', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ok);
    svg('path', { d: 'M1.4 4.2l1.7 1.7 3.5-3.7' }, okSvg);
    const chipText = el('span', '', chipL);
    const chipR = el('div', 'chip r', frame, L.meta);
    const bar = el('div', 'bar', frame);
    const fill = el('i', '', bar);
    // 出图后的三个操作：下载、放大、变体
    const acts = el('div', 'acts', frame);
    const actIcons = ['M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10', 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10', 'M8 2.2l1.5 3.9 3.9 1.5-3.9 1.5L8 13l-1.5-3.9-3.9-1.5 3.9-1.5z'].map((d) => {
      const b = el('span', '', acts);
      const s = svg('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: '#f5f5f7', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, b);
      svg('path', { d }, s);
      return b;
    });

    // 输入框
    const box = el('div', 'box', stage);
    const focus = el('div', 'focus', box);
    const sp = svg('svg', { class: 'spark', width: 20, height: 20, viewBox: '0 0 20 20' }, box);
    svg('path', { d: 'M10 1.5l2 5.6 5.5 2-5.5 2L10 16.7l-2-5.6-5.5-2 5.5-2z', fill: '#a99bff' }, sp);
    svg('path', { d: 'M16 13.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z', fill: '#ff9ad0' }, sp);
    const field = el('div', 'field', box);
    const hint = el('div', 'hint', field, L.placeholder);
    const tx = el('div', 'tx', field);
    const typed = el('b', '', tx);
    const caret = el('i', 'caret', tx);
    const go = el('div', 'go', box);
    const goIcon = svg('svg', { width: 14, height: 14, viewBox: '0 0 20 20' }, go);
    svg('path', { d: 'M10 1.5l2 5.6 5.5 2-5.5 2L10 16.7l-2-5.6-5.5-2 5.5-2z', fill: '#fff' }, goIcon);
    const goSpin = el('i', 'spin', go);
    goSpin.style.borderTopColor = '#fff';
    goSpin.style.borderColor = 'rgba(255,255,255,.35) rgba(255,255,255,.35) rgba(255,255,255,.35) #fff';
    const goText = el('span', '', go, L.go);
    const wave = el('div', 'wave', stage);
    const waveRing = el('i', '', wave);
    const cur = svg('svg', { class: 'cur', viewBox: '0 0 22 26' }, stage);
    svg('path', { d: 'M3 2.5v18.2l4.6-4.3 3 6.6 3.1-1.4-3-6.4h6.4z', fill: '#fff', stroke: '#111', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, cur);

    // ---------- 逐字打出提示词 ----------
    const chars = [...(options.text ?? L.prompt)];
    const rnd = seeded(77);
    const gaps = chars.map((ch) => (0.55 + rnd() * 0.9) * (/[，,。.、]/.test(ch) ? 2.6 : 1));
    const sum = gaps.reduce((a, b) => a + b, 0);
    const TYPE0 = 0.55;
    const typeDur = clamp(chars.length * 0.07, 1.1, 2.15);
    const at: number[] = [];
    gaps.reduce((acc, g) => (at.push(TYPE0 + (acc / sum) * typeDur), acc + g), 0);
    const TYPE1 = TYPE0 + typeDur;

    // ---------- 弹簧剧本 ----------
    const pop = spring({ duration: 0.45, bounce: 0.28 });
    const soft = spring({ duration: 0.5, bounce: 0 });
    const quick = spring({ duration: 0.22, bounce: 0 });
    const CLICK = 3.0;
    // 光标：滑到按钮上，按下，再慢慢移开
    const curX = track(612, [[TYPE1 - 0.15, 494, spring({ duration: 0.75, bounce: 0.05 })], [CLICK + 0.55, 566, spring({ duration: 1.1, bounce: 0 })]]);
    const curY = track(408, [[TYPE1 - 0.15, 346, spring({ duration: 0.75, bounce: 0.05 })], [CLICK + 0.55, 392, spring({ duration: 1.1, bounce: 0 })]]);
    const curO = track(0, [[TYPE1 - 0.15, 1, soft], [CLICK + 0.7, 0, soft]]);
    const press = track(1, [[CLICK, 0.93, quick], [CLICK + 0.12, 1, spring({ duration: 0.4, bounce: 0.45 })]]);
    const enabled = track(0, [[TYPE0 + 0.05, 1, soft], [RESET + 0.35, 0, soft]]);
    const focusO = track(0, [[TYPE0 - 0.15, 1, soft], [CLICK + 0.3, 0, soft], [RESET - 0.1, 1, soft], [RESET + 0.6, 0, soft]]);
    const busy = track(0, [[CLICK + 0.05, 1, quick], [DONE, 0, quick]]);
    // 图像区
    const canvasO = track(0, [[CLICK + 0.05, 1, spring({ duration: 0.3 })], [RESET + 0.2, 0, spring({ duration: 0.6 })]]);
    const auraIn = track(0, [[TYPE0, 1, spring({ duration: 2.6, bounce: 0 })], [CLICK + 0.35, 0, spring({ duration: 0.5 })]]);
    const reveal = track(0, [[CLICK + 0.05, 1, spring({ duration: 0.7, bounce: 0 })], [RESET + 0.2, 0, spring({ duration: 0.6 })]]);
    const chipIn = track(0, [[CLICK + 0.15, 1, pop], [RESET + 0.1, 0, soft]]);
    const barIn = track(0, [[CLICK + 0.25, 1, soft], [DONE + 0.45, 0, soft]]);
    const settle = track(1, [[DONE, 1.018, quick], [DONE + 0.12, 1, spring({ duration: 0.7, bounce: 0.35 })]]);
    const actIn = actIcons.map((_, i) => track(0, [[DONE + 0.55 + i * 0.07, 1, pop], [RESET + 0.05, 0, soft]]));
    const ringO = track(0, [[CLICK + 0.1, 1, soft], [DONE + 0.1, 0, spring({ duration: 0.8 })]]);

    // ---------- 画面：最终图 + 每一步的噪点 ----------
    const final = document.createElement('canvas');
    final.width = IW * 2;
    final.height = IH * 2;
    const fg = final.getContext('2d')!;
    fg.scale(2, 2);
    paintDusk(fg);
    const noise = makeNoise();
    const small = document.createElement('canvas');
    const sg = small.getContext('2d')!;
    let drawn = -1; // 已经画好的步数（只是缓存：同一步的画面完全一样，不必重画）

    if (options.image) {
      const img = new Image();
      img.onload = () => {
        const k = Math.max((IW * 2) / img.naturalWidth, (IH * 2) / img.naturalHeight);
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        fg.setTransform(1, 0, 0, 1, 0, 0);
        fg.drawImage(img, (IW * 2 - w) / 2, (IH * 2 - h) / 2, w, h);
        drawn = -1;
        api.seek(api.time);
      };
      img.src = options.image;
    }

    /** 第 k 步的画面：最终图先缩小到很低的分辨率再放大（只剩大色块），盖上一层按步数衰减的噪点 */
    const drawStep = (k: number) => {
      const s = k / STEPS;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (k >= STEPS) {
        ctx.drawImage(final, 0, 0);
        return;
      }
      const f = 2 ** (-6 * (1 - s) ** 1.25); // 分辨率：1/64 → 接近原图
      const sw = Math.max(2, Math.round(IW * 2 * f));
      const sh = Math.max(2, Math.round(IH * 2 * f));
      small.width = sw;
      small.height = sh;
      sg.imageSmoothingQuality = 'high';
      sg.drawImage(final, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#4a3f5c';
      ctx.fillRect(0, 0, IW * 2, IH * 2);
      ctx.globalAlpha = clamp(remap(s, 0, 0.25, 0.4, 1));
      ctx.drawImage(small, 0, 0, IW * 2, IH * 2);
      // 噪点：每一步换一张、换个位置，像重新采样；越往后越淡
      const r = seeded(1000 + k * 31);
      const tile = noise[k % noise.length]!;
      ctx.globalAlpha = k === 0 ? 1 : 0.92 * (1 - s) ** 2.4;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tile, -Math.floor(r() * 40) * 2, -Math.floor(r() * 30) * 2, tile.width * 2, tile.height * 2);
      ctx.globalAlpha = 1;
    };

    const render = (t: number) => {
      // 输入框：逐字打出，清空前先全选
      let n = 0;
      while (n < chars.length && at[n]! <= t) n++;
      const cleared = t >= RESET + 0.3;
      const shown = cleared ? 0 : n;
      if (typed.dataset.n !== String(shown)) {
        typed.dataset.n = String(shown);
        typed.textContent = chars.slice(0, shown).join('');
        // 超过两行时像文本框一样往上滚，始终露出最后一行
        tx.style.transform = `translateY(${-Math.max(0, tx.scrollHeight - 40)}px)`;
      }
      const selecting = t >= RESET && !cleared;
      typed.style.background = selecting ? 'rgba(139,123,255,.45)' : 'transparent';
      hint.style.opacity = shown === 0 ? '1' : '0';
      const typing = t > TYPE0 && t < TYPE1 + 0.05;
      const focused = clamp(focusO(t));
      const blink = Math.floor(t * 2) % 2 === 0;
      // 打字时光标常亮，停下来就闪；输入框没获得焦点时闪得淡一些
      caret.style.opacity = focused > 0.5 ? (typing || blink ? '1' : '0') : blink ? '0.55' : '0';
      focus.style.opacity = String(focused);

      // 生成按钮
      const busyK = clamp(busy(t));
      go.style.opacity = String(mix(0.42, 1, clamp(enabled(t))));
      go.style.transform = `scale(${press(t)})`;
      goIcon.style.display = busyK > 0.5 ? 'none' : '';
      goSpin.style.display = busyK > 0.5 ? '' : 'none';
      goSpin.style.transform = `rotate(${t * 540}deg)`;
      goText.textContent = busyK > 0.5 ? L.busy : L.go;
      const wk = clamp((t - CLICK) / 0.6);
      waveRing.style.opacity = String(wk > 0 && wk < 1 ? (1 - wk) * 0.9 : 0);
      waveRing.style.transform = `scale(${0.8 + 0.5 * easeInOut(wk)}, ${0.8 + 0.8 * easeInOut(wk)})`;

      // 鼠标
      cur.style.opacity = String(clamp(curO(t)));
      cur.style.transform = `translate(${curX(t) - 3}px, ${curY(t) - 2}px) scale(${press(t) < 0.99 ? 0.9 : 1})`;

      // 图像区：占位 → 噪点 → 逐步清晰 → 定格
      const co = clamp(canvasO(t));
      canvas.style.opacity = String(co);
      // 噪点从按钮那一侧圆形铺开
      const rv = reveal(t);
      canvas.style.clipPath = rv < 0.999 ? `circle(${Math.max(0, rv) * 560}px at 78% 112%)` : 'none';
      ph.style.opacity = String(1 - clamp(rv * 1.4));
      aura.style.opacity = String(0.55 * clamp(auraIn(t)));
      aura.style.transform = `translate(${Math.sin(t * 0.9) * 14}px, ${Math.cos(t * 0.7) * 10}px) scale(${1 + 0.06 * Math.sin(t * 1.3)})`;
      const p = clamp((t - GEN) / GEN_DUR);
      const k = t < GEN ? 0 : Math.min(STEPS, Math.floor(p * STEPS));
      if (co > 0 && k !== drawn) {
        drawStep(k);
        drawn = k;
      }
      frame.style.transform = `scale(${settle(t)})`;
      const ro = clamp(ringO(t));
      if (ro > 0.001) {
        const a = `${(t * 150) % 360}deg`;
        ring.style.setProperty('--a', a);
        halo.style.setProperty('--a', a);
      }
      ring.style.opacity = String(ro);
      halo.style.opacity = String(ro * 0.75);

      const ci = chipIn(t);
      chipL.style.opacity = String(clamp(ci));
      chipL.style.transform = `scale(${0.85 + 0.15 * ci})`;
      chipR.style.opacity = String(clamp(ci));
      chipR.style.transform = `scale(${0.85 + 0.15 * ci})`;
      const finished = t >= DONE;
      spin.style.display = finished ? 'none' : '';
      ok.style.display = finished ? '' : 'none';
      spin.style.transform = `rotate(${t * 540}deg)`;
      chipText.textContent = finished ? `${L.done} · ${GEN_DUR.toFixed(1)}${L.sec}` : `${L.step} ${Math.max(1, k)} / ${STEPS}`;
      const bi = clamp(barIn(t));
      bar.style.opacity = String(bi);
      fill.style.transform = `scaleX(${t < GEN ? 0 : Math.max(0.02, k / STEPS)})`;
      // 出图瞬间：一道柔光扫过
      const sw = clamp((t - DONE - 0.05) / 0.9);
      sweep.style.opacity = sw > 0 && sw < 1 ? String(Math.sin(sw * Math.PI)) : '0';
      sweep.style.transform = `translateX(${mix(-160, IW + 40, easeInOut(sw))}px) skewX(-12deg)`;
      actIcons.forEach((b, i) => {
        const v = actIn[i]!(t);
        b.style.opacity = String(clamp(v));
        b.style.transform = `translateY(${(1 - v) * 10}px) scale(${0.7 + 0.3 * v})`;
      });
    };

    const api = timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 9 });
    return api;
  },
};

/** 四张彩色噪点：低频色块 + 细颗粒，像潜空间里刚采样出来的高斯噪声 */
function makeNoise() {
  const tiles: HTMLCanvasElement[] = [];
  const NW = IW + 48;
  const NH = IH + 36;
  for (let n = 0; n < 4; n++) {
    const r = seeded(500 + n * 97);
    const c = document.createElement('canvas');
    c.width = NW;
    c.height = NH;
    const g = c.getContext('2d')!;
    // 低频：一张很小的随机色图放大
    const lo = document.createElement('canvas');
    lo.width = 14;
    lo.height = 9;
    const lg = lo.getContext('2d')!;
    const li = lg.createImageData(14, 9);
    for (let i = 0; i < li.data.length; i += 4) {
      li.data[i] = 60 + r() * 150;
      li.data[i + 1] = 50 + r() * 130;
      li.data[i + 2] = 80 + r() * 160;
      li.data[i + 3] = 255;
    }
    lg.putImageData(li, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(lo, 0, 0, NW, NH);
    // 高频：每个像素 RGB 各自随机，三角分布更接近高斯
    const img = g.getImageData(0, 0, NW, NH);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i]! * 0.3 + (r() + r()) * 0.5 * 255 * 0.85;
      d[i + 1] = d[i + 1]! * 0.3 + (r() + r()) * 0.5 * 255 * 0.85;
      d[i + 2] = d[i + 2]! * 0.3 + (r() + r()) * 0.5 * 255 * 0.85;
    }
    g.putImageData(img, 0, 0);
    tiles.push(c);
  }
  return tiles;
}

/** 程序化画一张黄昏海边：渐变天空、半沉的落日、晚霞、远山、帆船、海面波光、前景沙滩、暗角和颗粒 */
function paintDusk(g: CanvasRenderingContext2D) {
  const w = IW;
  const h = IH;
  const hz = 166; // 海平线
  const sx = 292; // 太阳
  const rnd = seeded(2718);

  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#121838');
  sky.addColorStop(0.32, '#33295f');
  sky.addColorStop(0.6, '#8f4877');
  sky.addColorStop(0.82, '#e8775f');
  sky.addColorStop(1, '#ffc98a');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hz);

  // 星星：只在天顶
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const y = rnd() * 60;
    g.fillStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.5) * (1 - y / 70)})`;
    g.fillRect(x, y, 1, 1);
  }

  // 太阳的大光晕
  g.globalCompositeOperation = 'screen';
  const glow = g.createRadialGradient(sx, hz - 6, 0, sx, hz - 6, 210);
  glow.addColorStop(0, 'rgba(255,200,130,.85)');
  glow.addColorStop(0.25, 'rgba(255,140,100,.35)');
  glow.addColorStop(1, 'rgba(255,120,90,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';

  // 晚霞：一条条细长的云带，先画在低分辨率画布上再放大，边缘自然变柔；靠近太阳的云底被照亮
  soft(g, 0.3, (c) => {
    for (let i = 0; i < 22; i++) {
      const y = 30 + rnd() ** 0.8 * 112;
      const x = rnd() * w;
      const len = 60 + rnd() * 170;
      const th = 2.5 + rnd() * 5 * (y / 140);
      const near = clamp(1 - Math.abs(x - sx) / 280) * smooth(10, 130, y);
      // 云身：远离太阳的偏紫灰，靠近的偏橘粉
      c.fillStyle = `rgba(${mix(96, 238, near) + y * 0.3},${mix(62, 128, near) + y * 0.15},${mix(118, 128, near)},${0.45 + rnd() * 0.25})`;
      for (let j = 0; j < 4; j++) {
        c.beginPath();
        c.ellipse(x + (j - 1.5) * len * 0.22, y + (rnd() - 0.5) * th, len * (0.22 + rnd() * 0.16), th * (0.6 + rnd() * 0.5), 0, 0, TAU);
        c.fill();
      }
      // 云底的亮边
      c.fillStyle = `rgba(255,${196 + near * 30},${150 + near * 30},${0.12 + near * 0.6})`;
      c.beginPath();
      c.ellipse(x + 8, y + th * 0.75, len * 0.4, th * 0.42, 0, 0, TAU);
      c.fill();
    }
  });

  // 落日：一半沉进海里
  g.save();
  g.beginPath();
  g.rect(0, 0, w, hz);
  g.clip();
  const sun = g.createRadialGradient(sx, hz - 10, 0, sx, hz - 2, 26);
  sun.addColorStop(0, '#fffaf0');
  sun.addColorStop(0.55, '#ffe2a8');
  sun.addColorStop(1, '#ffad6b');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(sx, hz + 4, 26, 0, TAU);
  g.fill();
  g.restore();

  // 远山：左边两层、右边一座小岛，越远越淡
  const ridge = (x0: number, x1: number, base: number, peak: number, col: string, seed: number) => {
    const r = seeded(seed);
    const a = r() * 6;
    const b = r() * 6;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x0, base);
    for (let x = x0; x <= x1; x += 3) {
      const u = (x - x0) / (x1 - x0);
      const env = Math.sin(Math.PI * u) ** 0.8;
      const y = base - env * (peak + 0.22 * peak * Math.sin(u * 9 + a) + 0.1 * peak * Math.sin(u * 23 + b));
      g.lineTo(x, y);
    }
    g.lineTo(x1, base);
    g.closePath();
    g.fill();
  };
  ridge(-40, 200, hz, 34, '#7a4a78', 3);
  ridge(-20, 128, hz, 22, '#5a3762', 5);
  ridge(372, 470, hz, 11, '#8a5579', 8);
  // 海平线附近的薄雾，把山脚化开
  const haze = g.createLinearGradient(0, hz - 34, 0, hz);
  haze.addColorStop(0, 'rgba(255,170,140,0)');
  haze.addColorStop(1, 'rgba(255,180,145,.42)');
  g.fillStyle = haze;
  g.fillRect(0, hz - 34, w, 34);

  // 海面
  const sea = g.createLinearGradient(0, hz, 0, h);
  sea.addColorStop(0, '#e48d74');
  sea.addColorStop(0.18, '#a35a7a');
  sea.addColorStop(0.55, '#3d2c5a');
  sea.addColorStop(1, '#17142c');
  g.fillStyle = sea;
  g.fillRect(0, hz, w, h - hz);
  // 海平线上一道亮线
  const line = g.createLinearGradient(sx - 200, 0, sx + 200, 0);
  line.addColorStop(0, 'rgba(255,220,180,0)');
  line.addColorStop(0.5, 'rgba(255,236,200,.9)');
  line.addColorStop(1, 'rgba(255,220,180,0)');
  g.fillStyle = line;
  g.fillRect(0, hz - 0.5, w, 1.2);

  // 波纹：越近越疏、越长
  for (let i = 0; i < 90; i++) {
    const u = rnd();
    const y = hz + 3 + u * u * (h - hz - 6);
    const x = rnd() * w;
    const len = 6 + u * 46 * (0.5 + rnd());
    g.fillStyle = `rgba(255,190,200,${0.08 + 0.12 * (1 - u)})`;
    g.fillRect(x, y, len, 0.8 + u * 0.8);
  }

  // 太阳的倒影：一列碎金，越近越宽；底下先铺一道柔和的光柱
  g.globalCompositeOperation = 'screen';
  soft(g, 0.12, (c) => {
    const column = c.createLinearGradient(0, hz, 0, h - 20);
    column.addColorStop(0, 'rgba(255,200,140,.3)');
    column.addColorStop(1, 'rgba(255,160,140,0)');
    c.fillStyle = column;
    c.beginPath();
    c.moveTo(sx - 20, hz);
    c.lineTo(sx + 20, hz);
    c.lineTo(sx + 70, h - 20);
    c.lineTo(sx - 70, h - 20);
    c.closePath();
    c.fill();
  });
  soft(g, 0.75, (c) => {
    c.globalCompositeOperation = 'lighter';
    for (let y = hz + 1; y < h - 26; y += 1.5 + (y - hz) * 0.035) {
      const u = (y - hz) / (h - hz);
      const span = 16 + u * 130;
      const pieces = 2 + Math.floor(rnd() * 3);
      for (let j = 0; j < pieces; j++) {
        const x = sx + (rnd() - 0.5) * span * 1.15;
        const len = (5 + rnd() * 22) * (1 - u * 0.3);
        c.fillStyle = `rgba(255,${190 + rnd() * 50},${130 + rnd() * 60},${(0.8 - u * 0.8) * (0.45 + rnd() * 0.55)})`;
        c.beginPath();
        c.ellipse(x, y, len / 2, 0.6 + u * 0.9, 0, 0, TAU);
        c.fill();
      }
    }
  });
  g.globalCompositeOperation = 'source-over';

  // 帆船和倒影
  const bx = 148;
  const by = hz + 15;
  const boat = (flip: number, alpha: number) => {
    g.save();
    g.translate(bx, by);
    g.scale(1, flip);
    g.fillStyle = `rgba(28,20,44,${alpha})`;
    g.beginPath();
    g.moveTo(-15, 0);
    g.lineTo(15, 0);
    g.lineTo(11, 4);
    g.lineTo(-12, 4);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(1, -1);
    g.lineTo(1, -31);
    g.lineTo(13, -3);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-1, -2);
    g.lineTo(-1, -24);
    g.lineTo(-12, -3);
    g.closePath();
    g.fill();
    g.restore();
  };
  boat(1, 0.95);
  g.save();
  g.beginPath();
  g.rect(bx - 20, by + 4, 40, 30);
  g.clip();
  g.translate(0, 8);
  boat(-0.8, 0.28);
  g.restore();

  // 海鸟
  g.strokeStyle = 'rgba(40,26,58,.85)';
  g.lineWidth = 1.1;
  g.lineCap = 'round';
  [[214, 70, 5], [228, 62, 4], [244, 76, 3.5]].forEach(([x, y, s]) => {
    g.beginPath();
    g.moveTo(x! - s!, y! - s! * 0.3);
    g.quadraticCurveTo(x! - s! * 0.4, y! - s! * 0.7, x!, y!);
    g.quadraticCurveTo(x! + s! * 0.4, y! - s! * 0.7, x! + s!, y! - s! * 0.3);
    g.stroke();
  });

  // 前景沙滩：斜着切进画面，湿沙反着一点天光，边上一道浪花
  const shore = (dy: number) => {
    g.beginPath();
    g.moveTo(w * 0.42, h + 2);
    g.bezierCurveTo(w * 0.62, h - 34 + dy, w * 0.8, h - 40 + dy, w + 2, h - 62 + dy);
    g.lineTo(w + 2, h + 2);
    g.closePath();
  };
  // 退潮留下的一层湿亮
  g.fillStyle = 'rgba(255,190,190,.14)';
  shore(-7);
  g.fill();
  const sand = g.createLinearGradient(0, h - 60, 0, h);
  sand.addColorStop(0, '#4d2d48');
  sand.addColorStop(1, '#1b1324');
  g.fillStyle = sand;
  shore(0);
  g.fill();
  const foam = g.createLinearGradient(w * 0.42, 0, w, 0);
  foam.addColorStop(0, 'rgba(255,226,214,0)');
  foam.addColorStop(0.45, 'rgba(255,230,218,.7)');
  foam.addColorStop(1, 'rgba(255,226,214,.25)');
  g.strokeStyle = foam;
  g.lineWidth = 1.2;
  shore(-1);
  g.stroke();
  g.lineWidth = 0.6;
  g.globalAlpha = 0.5;
  shore(-5);
  g.stroke();
  g.globalAlpha = 1;

  // 暗角
  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.66);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(8,4,18,.42)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);

  // 胶片颗粒
  for (let i = 0; i < 2600; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.035 + rnd() * 0.04})`;
    g.fillRect(rnd() * w, rnd() * h, 0.7, 0.7);
  }
}

/** 在低分辨率的画布上画，再放大贴回来：边缘自然变柔，比 filter: blur 便宜，各浏览器表现一致 */
function soft(g: CanvasRenderingContext2D, scale: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = Math.round(IW * scale);
  c.height = Math.round(IH * scale);
  const sg = c.getContext('2d')!;
  sg.scale(scale, scale);
  draw(sg);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, IW, IH);
}
