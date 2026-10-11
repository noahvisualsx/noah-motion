// 节点工作流：深色画布上，出图用的节点一个个弹出来，提示词逐字打进去，贝塞尔连线从输出口画到输入口；
// 点下运行后节点依次亮起、打勾，数据光点沿连线流进采样器，步数一格格往上跳，预览从噪点慢慢变清晰，
// 解码完成后图像定格，输出节点被推到前面、弹出“已保存”提示，最后连线收回、节点退场，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, seeded, smooth, TAU, type SceneDef } from './util.ts';

const D = 12;
const GREEN = '#3ddc97';
// 连线和接口按数据类型上色
const TYPE = { model: '#b69cff', cond: '#ffb454', latent: '#ff7eb6', image: '#5ac8fa' };
type Kind = keyof typeof TYPE;

const COPY = {
  zh: {
    tab: '晨雾山谷.json',
    count: '5 个节点',
    run: ['运行', '运行中', '完成'],
    model: ['加载模型', '模型', '名称', 'vista_xl'],
    prompt: ['提示词', '条件', '晨雾中的山谷，远山层层叠叠，柔和的逆光，电影感'],
    latent: ['空白潜空间', '潜空间', '尺寸', '768 × 768'],
    sampler: ['采样器', '模型', '条件', '潜空间', '图像', '种子', '步数', 'CFG', '采样'],
    output: ['预览图像', '图像', '等待运行', '解码中'],
    saved: '已保存',
    file: '晨雾山谷_0001.png',
  },
  en: {
    tab: 'misty-valley.json',
    count: '5 nodes',
    run: ['Run', 'Running', 'Done'],
    model: ['Load Checkpoint', 'MODEL', 'ckpt', 'vista_xl'],
    prompt: ['Prompt', 'CONDITIONING', 'a misty valley at dawn, layered ridges, soft backlight, cinematic'],
    latent: ['Empty Latent', 'LATENT', 'size', '768 × 768'],
    sampler: ['KSampler', 'model', 'positive', 'latent', 'IMAGE', 'seed', 'steps', 'cfg', 'sampler'],
    output: ['Preview Image', 'images', 'Waiting', 'decoding'],
    saved: 'Saved',
    file: 'misty_valley_0001.png',
  },
} as const;

// 时间表
const APPEAR = [0.25, 0.37, 0.49, 0.72, 0.95]; // 模型、提示词、潜空间、采样器、预览
const RUN_AT = 2.5;
const RUNS: [number, number][] = [
  [2.65, 3.0],
  [2.8, 3.15],
  [2.95, 3.2],
  [3.5, 6.85],
  [6.85, 7.3],
];
const STEPS = 24;
const FOCUS = 8.0;
const UNFOCUS = 10.2;
const RESET = 10.55;

// ---------- 程序化生成的“出图”：晨雾里层叠的山谷 ----------

function valley(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const k = size / 256;
  g.scale(k, k);
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#7d97c0');
  sky.addColorStop(0.42, '#e7c7bb');
  sky.addColorStop(0.62, '#f8e2c6');
  sky.addColorStop(1, '#f3e6d6');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 256);
  const sun = g.createRadialGradient(160, 104, 0, 160, 104, 110);
  sun.addColorStop(0, 'rgba(255,246,222,1)');
  sun.addColorStop(0.18, 'rgba(255,236,200,.75)');
  sun.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 256, 256);
  const rnd = seeded(77);
  // 由远到近五层山脊，颜色越近越深；每层山脚上方铺一层雾
  const ridges = ['#b4b9d2', '#8d9bb9', '#61788f', '#3b5865', '#1f3439'];
  ridges.forEach((color, i) => {
    const base = 118 + i * 26;
    const amp = 26 - i * 2.5;
    const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
    const f = 0.018 + i * 0.004;
    g.beginPath();
    g.moveTo(0, 256);
    for (let x = 0; x <= 256; x += 2) {
      const y = base - amp * (0.55 * Math.abs(Math.sin(x * f + ph[0]!)) + 0.3 * Math.sin(x * f * 2.3 + ph[1]!) + 0.15 * Math.sin(x * f * 5.1 + ph[2]!));
      g.lineTo(x, y);
    }
    g.lineTo(256, 256);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    // 最近的一层山上加一排小松树
    if (i === ridges.length - 1) {
      g.fillStyle = '#16282c';
      for (let x = 4; x < 256; x += 5 + rnd() * 7) {
        const y = base - amp * (0.55 * Math.abs(Math.sin(x * f + ph[0]!)) + 0.3 * Math.sin(x * f * 2.3 + ph[1]!) + 0.15 * Math.sin(x * f * 5.1 + ph[2]!));
        const h = 7 + rnd() * 9;
        g.beginPath();
        g.moveTo(x, y - h);
        g.lineTo(x - h * 0.28, y + 2);
        g.lineTo(x + h * 0.28, y + 2);
        g.fill();
      }
    }
    const fog = g.createLinearGradient(0, base - 6, 0, base + 22);
    fog.addColorStop(0, 'rgba(250,240,232,0)');
    fog.addColorStop(0.6, `rgba(250,240,232,${0.5 - i * 0.07})`);
    fog.addColorStop(1, 'rgba(250,240,232,0)');
    g.fillStyle = fog;
    g.fillRect(0, base - 6, 256, 28);
  });
  // 两只飞鸟
  g.strokeStyle = 'rgba(40,50,60,.55)';
  g.lineWidth = 1;
  [
    [88, 70, 5],
    [100, 78, 3.6],
  ].forEach(([x, y, s]) => {
    g.beginPath();
    g.moveTo(x! - s!, y! - s! * 0.5);
    g.quadraticCurveTo(x! - s! * 0.4, y! - s! * 0.6, x!, y!);
    g.quadraticCurveTo(x! + s! * 0.4, y! - s! * 0.6, x! + s!, y! - s! * 0.5);
    g.stroke();
  });
  // 细颗粒
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    g.fillRect(rnd() * 256, rnd() * 256, 0.8, 0.8);
  }
  return c;
}

/** 把图缩到 n×n 再一倍一倍放大回来：采样早期那种柔和的模糊色块（一次放大会出现方格） */
function coarse(src: HTMLCanvasElement, n: number, out = 192) {
  let c = document.createElement('canvas');
  c.width = c.height = n;
  c.getContext('2d')!.drawImage(src, 0, 0, n, n);
  while (c.width < out) {
    const next = document.createElement('canvas');
    next.width = next.height = Math.min(out, c.width * 2);
    next.getContext('2d')!.drawImage(c, 0, 0, next.width, next.height);
    c = next;
  }
  return c;
}

function noise(n: number) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  const rnd = seeded(5);
  for (let i = 0; i < n * n; i++) {
    // 偏灰、带一点冷暖色偏的噪点，比电视雪花柔和
    const v = 60 + rnd() * 150;
    img.data[i * 4] = v + (rnd() - 0.5) * 50;
    img.data[i * 4 + 1] = v + (rnd() - 0.5) * 40;
    img.data[i * 4 + 2] = v + (rnd() - 0.3) * 60;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** 三次贝塞尔连线；按弧长取样，光点才会匀速走 */
function wirePath(x1: number, y1: number, x2: number, y2: number) {
  const h = Math.max(30, Math.abs(x2 - x1) * 0.55);
  const P = [x1, y1, x1 + h, y1, x2 - h, y2, x2, y2] as const;
  const at = (u: number) => {
    const v = 1 - u;
    const a = v * v * v;
    const b = 3 * v * v * u;
    const c = 3 * v * u * u;
    const d = u * u * u;
    return [a * P[0] + b * P[2] + c * P[4] + d * P[6], a * P[1] + b * P[3] + c * P[5] + d * P[7]] as const;
  };
  const N = 64;
  const pts = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const len = [0];
  for (let i = 1; i <= N; i++) len.push(len[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = len[N]!;
  /** 弧长比例 s（0~1）处的点 */
  const point = (s: number) => {
    const target = clamp(s) * total;
    let i = 1;
    while (i < N && len[i]! < target) i++;
    const k = (target - len[i - 1]!) / (len[i]! - len[i - 1]! || 1);
    return [mix(pts[i - 1]![0], pts[i]![0], k), mix(pts[i - 1]![1], pts[i]![1], k)] as const;
  };
  return { d: `M${P[0]} ${P[1]}C${P[2]} ${P[3]} ${P[4]} ${P[5]} ${P[6]} ${P[7]}`, point, total };
}

export const nodes: SceneDef = {
  title: '节点工作流',
  category: '界面',
  description: '出图用的节点依次弹出、贝塞尔连线画出来，运行后节点逐个亮起打勾，光点沿连线流动，预览从噪点慢慢变清晰。',
  tags: ['track', 'spring', 'stagger', '贝塞尔弧长'],
  tone: 'dark',
  en: {
    title: 'Node workflow',
    description: 'Image-generation nodes pop in and bezier wires draw between them; on Run each node lights up and checks off, data dots stream along the wires and the preview resolves from noise.',
    tags: ['track', 'spring', 'stagger', 'bezier arc length'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const C = COPY[en ? 'en' : 'zh'];
    const stage = createStage(host, 'dark', 'nm-nodes');
    injectCSS(
      'nm-nodes',
      `.nm-nodes{background:#0d0e11}
.nm-nodes .grid{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.075) 1px,transparent 1.3px);background-size:18px 18px;background-position:6px 4px}
.nm-nodes .vig{position:absolute;inset:0;background:radial-gradient(ellipse 75% 70% at 50% 50%,rgba(13,14,17,0),rgba(6,6,8,.75));pointer-events:none}
.nm-nodes svg.wires{position:absolute;inset:0;width:640px;height:400px;overflow:visible}
.nm-nodes .node{position:absolute;border-radius:10px;background:#1a1b1f;border:1px solid rgba(255,255,255,.07);box-shadow:0 12px 28px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04);color:#e9e9ec;font-size:10px}
.nm-nodes .glow{position:absolute;inset:-1px;border-radius:10px;box-shadow:0 0 0 1.5px ${GREEN},0 0 22px rgba(61,220,151,.3);pointer-events:none}
.nm-nodes .hd{position:absolute;left:0;right:0;top:0;height:24px;border-radius:9px 9px 0 0;background:linear-gradient(#24252a,#202126);border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;padding:0 9px;gap:6px;font-size:10.5px;font-weight:600;letter-spacing:.01em}
.nm-nodes .hd .dot{flex:none;width:6px;height:6px;border-radius:50%}
.nm-nodes .hd span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nm-nodes .hd .st{flex:none;margin-left:auto;position:relative;width:12px;height:12px}
.nm-nodes .hd .st svg{position:absolute;inset:0}
.nm-nodes .hd em{flex:none;font-style:normal;font-weight:500;color:#7c7d85;font-size:9.5px;font-variant-numeric:tabular-nums}
.nm-nodes .row{position:absolute;left:0;right:0;height:18px;line-height:18px;color:#a3a4ad;font-size:9.5px}
.nm-nodes .row span{position:absolute}
.nm-nodes .sock{position:absolute;top:4.5px;width:9px;height:9px;border-radius:50%;border:1.5px solid;background:#1a1b1f}
.nm-nodes .sock b{position:absolute;inset:1px;border-radius:50%}
.nm-nodes .ring{position:absolute;width:9px;height:9px;border-radius:50%;border:1.5px solid}
.nm-nodes .field{position:absolute;left:8px;right:8px;height:20px;border-radius:6px;background:#121316;border:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;padding:0 8px;color:#7f8089;font-size:9.5px}
.nm-nodes .field b{font-weight:500;color:#e6e6ea;font-variant-numeric:tabular-nums}
.nm-nodes .area{position:absolute;left:8px;right:8px;border-radius:6px;background:#121316;border:1px solid rgba(255,255,255,.05);padding:6px 7px;color:#d9d9de;font-size:9.5px;line-height:13px;overflow:hidden;word-break:break-word}
.nm-nodes .area i{display:inline-block;width:1.5px;height:11px;margin-left:1px;vertical-align:-2px;background:${GREEN}}
.nm-nodes .prog{position:absolute;left:8px;right:8px;height:4px;border-radius:2px;background:#121316;overflow:hidden}
.nm-nodes .prog i{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:2px;background:linear-gradient(90deg,#2fbf86,${GREEN});transform-origin:0 50%}
.nm-nodes .pv{position:absolute;left:8px;right:8px;border-radius:7px;overflow:hidden;background:#111215 repeating-linear-gradient(135deg,rgba(255,255,255,.025) 0 6px,transparent 6px 12px);border:1px solid rgba(255,255,255,.05)}
.nm-nodes .pv canvas{position:absolute;inset:0;width:100%;height:100%}
.nm-nodes .pv .wait{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#5d5e66;font-size:9.5px}
.nm-nodes .pv .dec{position:absolute;left:8px;top:8px;padding:0 8px;height:18px;line-height:18px;border-radius:9px;background:rgba(12,14,18,.62);color:#8fdcff;font-size:9px;font-weight:600}
.nm-nodes .pv .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.9),rgba(255,255,255,.2))}
.nm-nodes .pv .sheen{position:absolute;top:-30%;left:0;width:50px;height:160%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.35),rgba(255,255,255,0))}
.nm-nodes .tab{position:absolute;left:16px;top:14px;height:26px;padding:0 11px;border-radius:8px;background:#17181c;border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:7px;font-size:10.5px;color:#d5d5da}
.nm-nodes .tab .dot{width:6px;height:6px;border-radius:50%;background:${GREEN}}
.nm-nodes .tab em{font-style:normal;color:#6b6c74}
.nm-nodes .run{position:absolute;right:14px;top:14px;width:94px;height:26px;border-radius:8px;background:linear-gradient(#34c98f,#25a875);box-shadow:0 6px 16px -6px rgba(61,220,151,.55),inset 0 1px 0 rgba(255,255,255,.25);color:#06140e;font-size:10.5px;font-weight:650;overflow:hidden}
.nm-nodes .run span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap}
.nm-nodes .run i{position:absolute;left:0;bottom:0;height:2px;width:100%;background:rgba(255,255,255,.75);transform-origin:0 50%}
.nm-nodes .toast{position:absolute;left:50%;top:352px;height:30px;padding:0 14px 0 9px;border-radius:15px;background:rgba(32,33,38,.92);border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;align-items:center;gap:8px;font-size:11px;color:#e9e9ec;white-space:nowrap}
.nm-nodes .toast em{font-style:normal;color:#8b8c94}`,
    );

    el('div', 'grid', stage);
    el('div', 'vig', stage);
    const wiresSvg = svg('svg', { class: 'wires', viewBox: '0 0 640 400' }, stage);
    const layer = el('div', '', stage);

    // ---------- 节点 ----------
    type Node = {
      root: HTMLElement;
      x: number;
      y: number;
      w: number;
      cy: number;
      glow: HTMLElement;
      spin: SVGSVGElement;
      check: SVGSVGElement;
      time: HTMLElement;
    };
    const makeNode = (x: number, y: number, w: number, title: string, dot: string, timed = false): Node => {
      const root = el('div', 'node', layer);
      Object.assign(root.style, { left: `${x}px`, top: `${y}px`, width: `${w}px` });
      const glow = el('div', 'glow', root);
      const hd = el('div', 'hd', root);
      el('i', 'dot', hd).style.background = dot;
      el('span', '', hd, title);
      // 只有耗时长的采样和预览显示用时，左边窄节点放不下
      const time = el('em', '', hd);
      time.style.cssText = timed ? 'margin-left:auto' : 'display:none';
      const st = el('div', 'st', hd);
      if (timed) st.style.marginLeft = '0';
      const spin = svg('svg', { viewBox: '0 0 12 12' }, st);
      svg('circle', { cx: 6, cy: 6, r: 4.5, fill: 'none', stroke: 'rgba(61,220,151,.25)', 'stroke-width': 1.6 }, spin);
      svg('circle', { cx: 6, cy: 6, r: 4.5, fill: 'none', stroke: GREEN, 'stroke-width': 1.6, 'stroke-linecap': 'round', pathLength: 10, 'stroke-dasharray': '3.2 10' }, spin);
      const check = svg('svg', { viewBox: '0 0 12 12' }, st);
      svg('circle', { cx: 6, cy: 6, r: 6, fill: GREEN }, check);
      svg('path', { d: 'M3.4 6.2l1.7 1.7 3.5-3.6', fill: 'none', stroke: '#0b1a13', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, check);
      return { root, x, y, w, cy: 30, glow, spin, check, time };
    };
    type Sock = { x: number; y: number; fill: HTMLElement; node: HTMLElement };
    const sock = (n: Node, side: 'in' | 'out', row: HTMLElement, kind: Kind): Sock => {
      const s = el('i', 'sock', row);
      s.style.borderColor = TYPE[kind];
      s.style[side === 'in' ? 'left' : 'right'] = '-5px';
      const fill = el('b', '', s);
      fill.style.background = TYPE[kind];
      return { x: side === 'in' ? n.x : n.x + n.w, y: n.y + n.cy + 9, fill, node: s };
    };
    /** 一行接口：左边输入、右边输出（都可省略） */
    const io = (n: Node, inp?: [string, Kind], out?: [string, Kind]) => {
      const row = el('div', 'row', n.root);
      row.style.top = `${n.cy}px`;
      let a: Sock | undefined;
      let b: Sock | undefined;
      if (inp) {
        el('span', '', row, inp[0]).style.left = '10px';
        a = sock(n, 'in', row, inp[1]);
      }
      if (out) {
        el('span', '', row, out[0]).style.right = '10px';
        b = sock(n, 'out', row, out[1]);
      }
      n.cy += 18;
      return { a, b };
    };
    const field = (n: Node, label: string, value: string) => {
      const f = el('div', 'field', n.root);
      f.style.top = `${n.cy + 2}px`;
      el('span', '', f, label);
      const v = el('b', '', f, value);
      n.cy += 24;
      return v;
    };
    const finish = (n: Node) => {
      n.cy += 6;
      n.root.style.height = `${n.cy}px`;
      return n;
    };

    // 模型
    const nModel = makeNode(16, 52, 140, C.model[0], TYPE.model);
    const sModel = io(nModel, undefined, [C.model[1], 'model']).b!;
    field(nModel, C.model[2], C.model[3]);
    finish(nModel);
    // 提示词
    const nPrompt = makeNode(16, 150, 140, C.prompt[0], TYPE.cond);
    const sPrompt = io(nPrompt, undefined, [C.prompt[1], 'cond']).b!;
    const area = el('div', 'area', nPrompt.root);
    area.style.top = `${nPrompt.cy + 2}px`;
    area.style.height = '70px';
    nPrompt.cy += 74;
    finish(nPrompt);
    const promptText = [...(options.text ?? C.prompt[2])];
    const typed = document.createTextNode('');
    area.append(typed);
    const caret = el('i', '', area);
    // 潜空间
    const nLatent = makeNode(16, 290, 140, C.latent[0], TYPE.latent);
    const sLatent = io(nLatent, undefined, [C.latent[1], 'latent']).b!;
    field(nLatent, C.latent[2], C.latent[3]);
    finish(nLatent);
    // 采样器
    const S = C.sampler;
    const nSampler = makeNode(226, 82, 150, S[0], TYPE.latent, true);
    const r1 = io(nSampler, [S[1], 'model'], [S[4], 'image']);
    const r2 = io(nSampler, [S[2], 'cond']);
    const r3 = io(nSampler, [S[3], 'latent']);
    nSampler.cy += 4;
    field(nSampler, S[5], '4127');
    const stepVal = field(nSampler, S[6], '24');
    field(nSampler, S[7], '6.5');
    field(nSampler, S[8], 'euler_a');
    const prog = el('div', 'prog', nSampler.root);
    prog.style.top = `${nSampler.cy + 6}px`;
    const progFill = el('i', '', prog);
    nSampler.cy += 12;
    finish(nSampler);
    // 预览
    const nOut = makeNode(436, 64, 190, C.output[0], TYPE.image, true);
    const sOut = io(nOut, [C.output[1], 'image']).a!;
    const pv = el('div', 'pv', nOut.root);
    const PV = 190 - 16;
    pv.style.top = `${nOut.cy + 2}px`;
    pv.style.height = `${PV}px`;
    nOut.cy += PV + 4;
    const wait = el('div', 'wait', pv);
    const icon = svg('svg', { width: 22, height: 22, viewBox: '0 0 22 22' }, wait);
    svg('rect', { x: 2, y: 4, width: 18, height: 14, rx: 3, fill: 'none', stroke: '#4a4b52', 'stroke-width': 1.4 }, icon);
    svg('path', { d: 'M4 16l5-5 4 4 2-2 4 3', fill: 'none', stroke: '#4a4b52', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, icon);
    el('span', '', wait, C.output[2]);
    // 预览图的几层：噪点 → 粗色块 → 细一点 → 成图
    const big = 512;
    const pvLayers = el('div', '', pv);
    pvLayers.style.cssText = 'position:absolute;inset:0';
    const mk = (c: HTMLCanvasElement) => {
      pvLayers.append(c);
      return c;
    };
    let lCoarse = mk(document.createElement('canvas'));
    let lMid = mk(document.createElement('canvas'));
    let lFinal = mk(document.createElement('canvas'));
    const noiseWrap = el('div', '', pvLayers);
    noiseWrap.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    const lNoise = noise(96);
    lNoise.style.cssText = 'position:absolute;left:0;top:0;width:200%;height:200%;image-rendering:pixelated';
    noiseWrap.append(lNoise);
    const flash = el('div', 'flash', pv);
    const decoding = el('div', 'dec', pv, `${C.output[3]}…`);
    const sheen = el('i', 'sheen', pv);
    const useImage = (src: HTMLCanvasElement) => {
      // 图片异步加载完才换上；沿用旧层的样式，暂停时画面也不会跳
      const swap = (old: HTMLCanvasElement, next: HTMLCanvasElement) => {
        next.style.cssText = old.style.cssText;
        old.replaceWith(next);
        return next;
      };
      lCoarse = swap(lCoarse, coarse(src, 6));
      lMid = swap(lMid, coarse(src, 22));
      lFinal = swap(lFinal, src);
    };
    if (options.image) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = big;
        const k = Math.max(big / img.naturalWidth, big / img.naturalHeight);
        c.getContext('2d')!.drawImage(img, (big - img.naturalWidth * k) / 2, (big - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
        useImage(c);
      };
      img.src = options.image;
    } else useImage(valley(big));
    const foot = el('div', 'row', nOut.root);
    foot.style.top = `${nOut.cy}px`;
    el('span', '', foot, '768 × 768').style.left = '10px';
    const footR = el('span', '', foot, 'png');
    footR.style.right = '10px';
    nOut.cy += 18;
    finish(nOut);

    const all = [nModel, nPrompt, nLatent, nSampler, nOut];

    // ---------- 连线 ----------
    const ins = [r1.a!, r2.a!, r3.a!, sOut];
    const outs = [sModel, sPrompt, sLatent, r1.b!];
    const kinds: Kind[] = ['model', 'cond', 'latent', 'image'];
    const DRAW = [1.3, 1.45, 1.6, 1.85];
    // 每条线上数据流动的时段
    const FLOW: [number, number][] = [
      [RUNS[0]![1], RUNS[0]![1] + 0.6],
      [RUNS[1]![1], RUNS[1]![1] + 0.6],
      [RUNS[2]![1], RUNS[2]![1] + 0.6],
      [RUNS[3]![0] + 0.25, RUNS[4]![0] + 0.15],
    ];
    const POOL = 4;
    const GAP = 0.2;
    const TRAVEL = 0.62;
    const wires = outs.map((o, i) => {
      const p = wirePath(o.x, o.y, ins[i]!.x, ins[i]!.y);
      const color = TYPE[kinds[i]!];
      const halo = svg('path', { d: p.d, fill: 'none', stroke: color, 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0, pathLength: 1, 'stroke-dasharray': '1 1' }, wiresSvg);
      const line = svg('path', { d: p.d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, wiresSvg);
      const dots = Array.from({ length: POOL }, () => ({
        glow: svg('circle', { r: 5.5, fill: color, opacity: 0 }, wiresSvg),
        core: svg('circle', { r: 2.3, fill: '#fff', opacity: 0 }, wiresSvg),
      }));
      // 接上时输入口泛起一圈
      const ring = el('i', 'ring', layer);
      Object.assign(ring.style, { left: `${ins[i]!.x - 4.5}px`, top: `${ins[i]!.y - 4.5}px`, borderColor: color });
      return { ...p, halo, line, dots, ring, i };
    });

    // ---------- 顶栏、提示 ----------
    const tab = el('div', 'tab', stage);
    el('i', 'dot', tab);
    el('span', '', tab, C.tab);
    el('em', '', tab, C.count);
    const run = el('div', 'run', stage);
    const runLabels = C.run.map((s, i) => {
      const span = el('span', '', run);
      if (i === 0) {
        const play = svg('svg', { width: 8, height: 9, viewBox: '0 0 8 9' }, span);
        svg('path', { d: 'M1 1l6 3.5L1 8z', fill: '#06140e', 'stroke-linejoin': 'round', stroke: '#06140e', 'stroke-width': 1 }, play);
      }
      el('b', '', span, s);
      return span;
    });
    const runPct = el('em', '', runLabels[1]!);
    runPct.style.cssText = 'font-style:normal;font-weight:500;opacity:.7;font-variant-numeric:tabular-nums';
    const runBar = el('i', '', run);
    const toast = el('div', 'toast', stage);
    const tCheck = svg('svg', { width: 16, height: 16, viewBox: '0 0 12 12' }, toast);
    svg('circle', { cx: 6, cy: 6, r: 6, fill: GREEN }, tCheck);
    svg('path', { d: 'M3.4 6.2l1.7 1.7 3.5-3.6', fill: 'none', stroke: '#0b1a13', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, tCheck);
    el('span', '', toast, C.saved);
    el('em', '', toast, C.file);

    // ---------- 轨道 ----------
    const popIn = spring({ duration: 0.55, bounce: 0.28 });
    const away = spring({ duration: 0.45, bounce: 0 });
    const fade = spring({ duration: 0.3, bounce: 0 });
    const tick = spring({ duration: 0.4, bounce: 0.5 });
    const nodeIn = all.map((_, i) => track(0, [[APPEAR[i]!, 1, popIn], [RESET + 0.35 + (4 - i) * 0.08, 0, away]]));
    const wireIn = wires.map((_, i) => track(0, [[DRAW[i]!, 1, spring({ duration: 0.5, bounce: 0 })], [RESET + i * 0.06, 0, spring({ duration: 0.45, bounce: 0 })]]));
    const checks = RUNS.map(([, end]) => track(0, [[end, 1, tick], [RESET + 0.3, 0, fade]]));
    const focus = track(0, [[FOCUS, 1, spring({ duration: 0.8, bounce: 0.12 })], [UNFOCUS, 0, spring({ duration: 0.7, bounce: 0 })]]);
    const toastIn = track(0, [[FOCUS + 0.45, 1, spring({ duration: 0.55, bounce: 0.3 })], [UNFOCUS - 0.3, 0, away]]);
    const press = track(0, [[RUN_AT, 1, spring({ duration: 0.12 })], [RUN_AT + 0.12, 0, spring({ duration: 0.4, bounce: 0.4 })]]);
    const typeEnd = 0.7 + promptText.length / (en ? 40 : 18);

    const render = (t: number) => {
      const F = focus(t);
      // 节点：弹出、运行时描边发光、完成后打勾
      all.forEach((n, i) => {
        const k = nodeIn[i]!(t);
        const [r0, r1] = RUNS[i]!;
        const running = t >= r0 && t < r1;
        const isOut = i === 4;
        // 聚焦阶段：预览节点被推到前面，其他节点退后变暗
        const fx = isOut ? -200 * F : 0;
        const fs = isOut ? 1 + 0.14 * F : 1 - 0.03 * F;
        n.root.style.opacity = String(clamp(k * 1.6) * (isOut ? 1 : 1 - 0.65 * F));
        n.root.style.transform = `translate(${fx}px, ${(1 - k) * 14 + (isOut ? -4 * F : 0)}px) scale(${(0.9 + 0.1 * k) * fs})`;
        n.root.style.zIndex = isOut ? '2' : '';
        const on = clamp((t - r0) / 0.15) * (1 - clamp((t - r1) / 0.6));
        n.glow.style.opacity = String(on);
        n.spin.style.opacity = running ? '1' : '0';
        n.spin.style.transform = `rotate(${(t * 520) % 360}deg)`;
        const c = checks[i]!(t);
        n.check.style.opacity = String(clamp(c * 2));
        n.check.style.transform = `scale(${clamp(c, 0, 1.4)})`;
        n.time.textContent = t >= r1 ? `${(r1 - r0).toFixed(1)}s` : '';
        n.time.style.opacity = String(clamp((t - r1) / 0.3) * clamp(c * 2));
      });
      // 提示词逐字打出来
      const nChars = Math.floor(clamp((t - 0.7) / (typeEnd - 0.7)) * promptText.length);
      typed.data = promptText.slice(0, nChars).join('');
      caret.style.opacity = t > 0.6 && t < typeEnd + 0.6 && Math.floor(t * 3) % 2 === 0 ? '1' : t > 0.6 && t < typeEnd ? '1' : '0';
      // 采样器：步数一格格往上跳
      const [s0, s1] = RUNS[3]!;
      const sp = clamp((t - s0) / (s1 - s0));
      const step = t < s0 ? 0 : Math.max(1, Math.ceil(sp * STEPS));
      const resetK = clamp((t - RESET) / 0.4);
      stepVal.textContent = t >= s0 && t < s1 ? `${step} / ${STEPS}` : String(STEPS);
      progFill.style.transform = `scaleX(${(t < s0 ? 0 : step / STEPS) * (1 - resetK)})`;

      // 预览：随步数从噪点变清晰，解码完成后定格
      const [d0, d1] = RUNS[4]!;
      const live = clamp((t - s0) / 0.25) * (1 - resetK);
      pvLayers.style.opacity = String(live);
      const wq = clamp(1 - live * 3);
      (pv.firstChild as HTMLElement).style.opacity = String(wq);
      lNoise.style.opacity = String(1 - smooth(0, 0.6, sp));
      // 噪点每一步换一个位置，像在采样
      const jr = seeded(step * 31 + 7);
      lNoise.style.transform = `translate(${-Math.floor(jr() * 50)}%, ${-Math.floor(jr() * 50)}%)`;
      lMid.style.opacity = String(smooth(0.3, 0.85, sp));
      const fin = smooth(d0, d1, t);
      lFinal.style.opacity = String(fin);
      // 聚焦时成图缓缓推近一点
      lFinal.style.transform = `scale(${1 + 0.06 * clamp((t - FOCUS) / (UNFOCUS - FOCUS + 0.6)) * (t < RESET + 0.6 ? 1 : 0)})`;
      decoding.style.opacity = t >= d0 && t < d1 ? '1' : '0';
      const fl = clamp((t - d1) / 0.5);
      flash.style.opacity = fl > 0 && fl < 1 ? String((1 - fl) * 0.55) : '0';
      const sh = clamp((t - FOCUS - 0.4) / 0.9);
      sheen.style.opacity = sh > 0 && sh < 1 ? '1' : '0';
      sheen.style.transform = `translateX(${mix(-60, PV + 20, sh)}px) rotate(16deg)`;

      // 连线：画出来、数据光点流动、聚焦时变暗、最后收回
      for (const w of wires) {
        const k = clamp(wireIn[w.i]!(t));
        const drawn = t < RESET ? k : 1;
        const off = t < RESET ? 1 - k : -(1 - k);
        w.line.setAttribute('stroke-dashoffset', String(off));
        w.halo.setAttribute('stroke-dashoffset', String(off));
        const [f0, f1] = FLOW[w.i]!;
        const active = clamp((t - f0) / 0.2) * (1 - clamp((t - f1) / 0.4));
        // 没画出来时整条藏起来：圆头线帽在长度为 0 的虚线段上也会画出一个小点
        w.line.setAttribute('opacity', k < 0.01 ? '0' : String((0.55 + 0.45 * active) * (1 - 0.75 * F)));
        w.halo.setAttribute('opacity', String(0.16 * active));
        w.dots.forEach((d) => {
          d.glow.setAttribute('opacity', '0');
          d.core.setAttribute('opacity', '0');
        });
        for (let n = Math.max(0, Math.floor((t - f0 - TRAVEL) / GAP)); f0 + n * GAP <= Math.min(t, f1); n++) {
          const u = (t - f0 - n * GAP) / TRAVEL;
          if (u < 0 || u > 1) continue;
          const d = w.dots[n % POOL]!;
          const [x, y] = w.point(u);
          const o = Math.sin(Math.PI * u) ** 0.5;
          d.glow.setAttribute('cx', String(x));
          d.glow.setAttribute('cy', String(y));
          d.glow.setAttribute('opacity', String(0.35 * o));
          d.core.setAttribute('cx', String(x));
          d.core.setAttribute('cy', String(y));
          d.core.setAttribute('opacity', String(o));
        }
        // 接口：输出口在开始画线时填满，输入口在线接上时填满并泛起一圈
        outs[w.i]!.fill.style.opacity = String(clamp(drawn * 4));
        ins[w.i]!.fill.style.opacity = String(clamp((drawn - 0.85) * 8));
        const rp = clamp((t - DRAW[w.i]! - 0.35) / 0.5);
        w.ring.style.opacity = rp > 0 && rp < 1 ? String(1 - rp) : '0';
        w.ring.style.transform = `scale(${1 + rp * 1.8})`;
      }

      // 运行按钮：按下、文字切换、底部进度
      const pr = press(t);
      run.style.transform = `scale(${1 - 0.06 * pr})`;
      const phase = t < RUN_AT || t >= RESET ? 0 : t < d1 ? 1 : 2;
      runLabels.forEach((s, i) => {
        s.style.opacity = i === phase ? '1' : '0';
        s.style.transform = `translateY(${(i - phase) * 6}px)`;
      });
      const total = clamp((t - RUN_AT) / (d1 - RUN_AT));
      runPct.textContent = `${Math.round(total * 100)}%`;
      runBar.style.transform = `scaleX(${t >= RUN_AT && t < RESET ? total : 0})`;
      runBar.style.opacity = phase === 1 ? '1' : String(1 - clamp((t - d1) / 0.4));

      const ti = toastIn(t);
      toast.style.opacity = String(clamp(ti * 1.5));
      toast.style.transform = `translate(-50%, ${(1 - ti) * 24}px)`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 7.9 });
  },
};
