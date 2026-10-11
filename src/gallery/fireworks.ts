// 烟花：江边夜景。天际线分远、中、近三层，轮廓各不相同，窗户零星亮着灯，塔顶的航空灯一闪一闪。
// 一发发烟花拖着火星升空，在顶点炸成菊花、牡丹、土星环、交叉双环、闪光和金色垂柳。
// 星点按三维球面 / 倾斜圆环发射，前半球亮、后半球暗；带空气阻力、重力和风，位置用闭式解直接算，
// 任意一帧都能直接跳到。炸开瞬间照亮天空、烟雾和楼顶，余烬一边闪一边落下，水面倒映着整片夜景。
// 每一发按 wrap 折回时间，最后那朵垂柳会落进下一轮的开头，首尾相接。
import { timeline } from '../timeline.ts';
import { clamp, mix } from '../track.ts';
import { createStage, createCanvas, seeded, smooth, wrap, TAU, type SceneDef } from './util.ts';

const D = 12;
const WATER = 318; // 水岸线
const SKY_TOP = 128; // 天际线图层覆盖的最高处
const WIND = 7; // 向右的风，像素 / 秒
// 前后三档：后面的星点暗、细、小，前面的亮、粗、大
const DEPTH_A = [0.36, 0.68, 1];
const DEPTH_W = [0.6, 0.85, 1.1];
const DEPTH_R = [0.55, 0.85, 1.2];
const EMBER = 1.6; // 余烬比主体多活多久

type RGB = readonly [number, number, number];
const WHITE: RGB = [255, 255, 255];
const GOLD: RGB = [255, 196, 112];
const AMBER: RGB = [255, 138, 64];
const ROSE: RGB = [255, 88, 122];
const CYAN: RGB = [92, 214, 255];
const VIOLET: RGB = [170, 128, 255];
const SILVER: RGB = [226, 234, 255];
const RED: RGB = [255, 64, 56];
const SMOKE: RGB = [86, 84, 120];

const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a).toFixed(3)})`;
const mixRGB = (a: RGB, b: RGB, p: number): RGB => [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p)];

/** 确定性的“随机”数：同一个星点、同一个时间片永远给出同一个值，闪烁也能逐帧复现 */
const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// 每种烟花的物理和画法：星点数、初速、阻力、重力、寿命、拖尾长度（秒）和分几段画、线宽、星头半径、余烬比例、
// 内芯星点数和速度比例、透视距离（越小前后大小差越明显，圆环靠它显出倾斜的立体感）
const KINDS = {
  chrys: { n: 140, v: 250, drag: 2.5, g: 55, life: 2.8, trail: 0.42, segs: 5, w: 1.15, head: 0.8, ember: 0.3, core: 0, coreV: 0, persp: 700 },
  peony: { n: 120, v: 240, drag: 2.7, g: 58, life: 2.4, trail: 0.13, segs: 3, w: 1.9, head: 1.25, ember: 0.22, core: 40, coreV: 0.42, persp: 700 },
  saturn: { n: 64, v: 245, drag: 2.6, g: 50, life: 2.5, trail: 0.07, segs: 3, w: 1.8, head: 1.7, ember: 0.15, core: 34, coreV: 0.3, persp: 330 },
  ring: { n: 56, v: 235, drag: 2.6, g: 50, life: 2.4, trail: 0.07, segs: 3, w: 1.7, head: 1.6, ember: 0.15, core: 0, coreV: 0, persp: 330 },
  willow: { n: 90, v: 150, drag: 1.5, g: 50, life: 4.6, trail: 2.1, segs: 10, w: 0.95, head: 0.75, ember: 0.5, core: 0, coreV: 0, persp: 700 },
  strobe: { n: 100, v: 220, drag: 2.8, g: 55, life: 2.9, trail: 0.1, segs: 2, w: 1.5, head: 1.0, ember: 0, core: 0, coreV: 0, persp: 700 },
} as const;
type Kind = keyof typeof KINDS;

// 节目单：开场一发接一发，6.5 秒起三发几乎同时炸开是高潮，最后一朵大垂柳慢慢落进下一轮
// c：主色、变色后的颜色（牡丹）或第二个环、内芯颜色；tilt：圆环的俯仰和侧倾（弧度）
const SHOW: { at: number; x: number; y: number; kind: Kind; c: [RGB, RGB, RGB]; size: number; tilt?: [number, number] }[] = [
  { at: 0.15, x: 206, y: 136, kind: 'chrys', c: [GOLD, ROSE, GOLD], size: 0.95 },
  { at: 1.25, x: 456, y: 122, kind: 'saturn', c: [CYAN, CYAN, SILVER], size: 1, tilt: [0.86, -0.42] },
  { at: 2.35, x: 300, y: 118, kind: 'peony', c: [VIOLET, ROSE, SILVER], size: 1 },
  { at: 3.3, x: 532, y: 152, kind: 'strobe', c: [SILVER, SILVER, SILVER], size: 0.8 },
  { at: 4.15, x: 150, y: 128, kind: 'peony', c: [ROSE, GOLD, GOLD], size: 0.9 },
  { at: 5.15, x: 380, y: 126, kind: 'ring', c: [GOLD, ROSE, GOLD], size: 1, tilt: [0.92, 0.55] },
  { at: 6.4, x: 226, y: 118, kind: 'peony', c: [CYAN, VIOLET, SILVER], size: 1 },
  { at: 6.65, x: 472, y: 114, kind: 'chrys', c: [GOLD, GOLD, GOLD], size: 1.05 },
  { at: 6.95, x: 350, y: 162, kind: 'saturn', c: [ROSE, ROSE, GOLD], size: 0.85, tilt: [0.95, 0.3] },
  { at: 7.6, x: 100, y: 166, kind: 'strobe', c: [SILVER, SILVER, SILVER], size: 0.7 },
  { at: 8.8, x: 316, y: 100, kind: 'willow', c: [GOLD, AMBER, GOLD], size: 1 },
];

interface Part {
  vx: number;
  vy: number;
  vz: number;
  /** 重力倍数：余烬更重，落得更快 */
  gm: number;
  ember: boolean;
  /** 闪烁用的种子 */
  h: number;
}

type Rect = readonly [x: number, y: number, w: number, h: number];
const px2 = (v: number) => Math.round(v * 2) / 2; // 对齐到半个逻辑像素（高清 canvas 上的整像素），边缘不发虚

export const fireworks: SceneDef = {
  title: '烟花',
  category: '插画',
  description:
    '江边夜景：烟花拖着火星升空，炸成菊花、牡丹、土星环、交叉双环、闪光和金色垂柳。星点按三维球面发射，带阻力、重力和风，炸开时照亮天空、烟雾和楼顶，余烬闪着落下，水面倒映整片夜景。',
  tags: ['canvas', '闭式物理', 'wrap', '确定性随机'],
  tone: 'dark',
  en: {
    title: 'Fireworks',
    description:
      'A riverside night: shells climb on sparking tails and burst into chrysanthemums, peonies, Saturn rings, crossed rings, strobes and a golden willow. Stars fly out on 3D spheres with drag, gravity and wind, each burst lights the sky, smoke and rooftops, embers flicker down, and the river mirrors it all.',
    tags: ['canvas', 'closed-form physics', 'wrap', 'deterministic noise'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-fw');
    const { canvas, ctx } = createCanvas(stage);
    const SC = canvas.width / 640;
    const rnd = seeded(2024);

    // ---------- 预先画好的素材 ----------

    const offscreen = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * SC);
      c.height = Math.round(h * SC);
      return c;
    };
    // 柔光贴图：每种颜色一张，画光晕时直接贴
    const sprites = new Map<RGB, HTMLCanvasElement>();
    const sprite = (c: RGB) => {
      let s = sprites.get(c);
      if (!s) {
        s = document.createElement('canvas');
        s.width = s.height = 64;
        const g = s.getContext('2d')!;
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, rgba(c, 1));
        gr.addColorStop(0.22, rgba(c, 0.5));
        gr.addColorStop(0.55, rgba(c, 0.12));
        gr.addColorStop(1, rgba(c, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        sprites.set(c, s);
      }
      return s;
    };
    const glow = (c: RGB, x: number, y: number, r: number, a: number, g = ctx) => {
      if (a <= 0.004) return;
      g.globalAlpha = clamp(a);
      g.drawImage(sprite(c), x - r, y - r, r * 2, r * 2);
      g.globalAlpha = 1;
    };
    // 大片的柔光（照亮天空、烟雾）：衰减更平缓，没有亮核
    const washes = new Map<RGB, HTMLCanvasElement>();
    const wash = (c: RGB, x: number, y: number, r: number, a: number, g = ctx) => {
      if (a <= 0.004) return;
      let s = washes.get(c);
      if (!s) {
        s = document.createElement('canvas');
        s.width = s.height = 128;
        const sg = s.getContext('2d')!;
        const gr = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, rgba(c, 1));
        gr.addColorStop(0.4, rgba(c, 0.38));
        gr.addColorStop(0.75, rgba(c, 0.08));
        gr.addColorStop(1, rgba(c, 0));
        sg.fillStyle = gr;
        sg.fillRect(0, 0, 128, 128);
        washes.set(c, s);
      }
      g.globalAlpha = clamp(a);
      g.drawImage(s, x - r, y - r, r * 2, r * 2);
      g.globalAlpha = 1;
    };

    // 天空底色：顶上深蓝，地平线带一点城市光污染的紫。只画一次，每帧直接贴
    const skyCv = offscreen(640, WATER);
    {
      const g = skyCv.getContext('2d')!;
      g.scale(SC, SC);
      const gr = g.createLinearGradient(0, 0, 0, WATER);
      gr.addColorStop(0, '#03050d');
      gr.addColorStop(0.5, '#0a0e26');
      gr.addColorStop(0.82, '#1b1a3e');
      gr.addColorStop(1, '#33264d');
      g.fillStyle = gr;
      g.fillRect(0, 0, 640, WATER);
    }
    // 水面的加深层和四角暗角，也是静态的
    const DEPTH = 400 - WATER;
    const shadeCv = offscreen(640, 400);
    {
      const g = shadeCv.getContext('2d')!;
      g.scale(SC, SC);
      const water = g.createLinearGradient(0, WATER, 0, 400);
      water.addColorStop(0, 'rgba(6,8,22,0.04)');
      water.addColorStop(1, 'rgba(3,4,12,0.62)');
      g.fillStyle = water;
      g.fillRect(0, WATER, 640, DEPTH);
      const vig = g.createRadialGradient(320, 190, 220, 320, 190, 440);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = vig;
      g.fillRect(0, 0, 640, 400);
    }
    // 倒影的取样：每帧先把水线以上的一条拷到这里，再一行行贴进水里（一行行直接从主画布自己身上拷，每次都要复制整张画布，很慢）
    const SQUASH = 0.6;
    const reflH = Math.ceil(DEPTH / SQUASH) + 2;
    const reflCv = offscreen(640, reflH);
    const rc = reflCv.getContext('2d')!;

    // ---------- 三层天际线 ----------
    // 每层画两张图：sil 是剪影和窗灯，mask 是“能被照亮的面”（楼顶最亮、往下渐暗），炸开时用它给楼群上色

    interface Layer {
      sil: HTMLCanvasElement;
      mask: HTMLCanvasElement;
      /** 被烟花照亮的强度 */
      lit: number;
      beacons: [number, number][];
      lamps: [number, number][];
    }
    const layerH = WATER - SKY_TOP;
    const scratch = offscreen(640, layerH);
    const sc = scratch.getContext('2d')!;
    // 光场：炸开的光在楼群这一带的分布，很平滑，用 1/8 分辨率画再放大
    const field = document.createElement('canvas');
    field.width = 80;
    field.height = Math.ceil(layerH / 8);
    const fc = field.getContext('2d')!;

    type Style = 'flat' | 'setback' | 'spire' | 'slant' | 'dome' | 'mast' | 'crown' | 'gable' | 'tower';
    /** 把一栋楼的轮廓加进 path：所有子路径都按顺时针，非零环绕规则下自然取并集。返回可以开窗的矩形 */
    const addBuilding = (p: Path2D, x: number, w: number, h: number, style: Style, beacons?: [number, number][]): Rect[] => {
      x = px2(x);
      w = px2(w);
      const top = px2(WATER - h);
      const out: Rect[] = [];
      const body = (bx: number, by: number, bw: number, bh: number) => {
        p.rect(bx, by, bw, bh + 1);
        out.push([bx, by, bw, bh]);
      };
      const needle = (cx: number, y: number, len: number) => {
        p.rect(px2(cx) - 0.5, y - len, 1, len + 1);
        beacons?.push([px2(cx), y - len]);
      };
      switch (style) {
        case 'flat':
          body(x, top, w, h);
          if (rnd() < 0.6) p.rect(px2(x + w * (0.12 + rnd() * 0.45)), top - 3, px2(w * (0.18 + rnd() * 0.22)), 4); // 楼顶设备间
          break;
        case 'mast':
          body(x, top, w, h);
          needle(x + w * (0.3 + rnd() * 0.4), top, 8 + rnd() * 12);
          break;
        case 'setback': {
          // 退台：上面一截收窄，有时再收一截
          const h2 = px2(h * (0.16 + rnd() * 0.14));
          const w2 = px2(w * (0.55 + rnd() * 0.2));
          const x2 = px2(x + (w - w2) * (0.2 + rnd() * 0.6));
          body(x, top + h2, w, h - h2);
          body(x2, top, w2, h2);
          if (rnd() < 0.5) p.rect(px2(x2 + w2 * 0.25), top - 4, px2(w2 * 0.5), 5);
          break;
        }
        case 'spire': {
          body(x, top, w, h);
          const th = w * 0.7;
          p.moveTo(x + w * 0.18, top + 1);
          p.lineTo(x + w / 2, top - th);
          p.lineTo(x + w * 0.82, top + 1);
          p.closePath();
          needle(x + w / 2, top - th + 1, 10);
          break;
        }
        case 'slant': {
          // 斜屋顶，一边高一边低
          const s = w * (0.25 + rnd() * 0.25) * (rnd() < 0.5 ? 1 : -1);
          p.moveTo(x, top + Math.max(0, -s));
          p.lineTo(x + w, top + Math.max(0, s));
          p.lineTo(x + w, WATER + 1);
          p.lineTo(x, WATER + 1);
          p.closePath();
          out.push([x, top + Math.abs(s), w, h - Math.abs(s)]);
          break;
        }
        case 'dome': {
          body(x, top, w, h);
          const r = w * 0.32;
          p.moveTo(x + w / 2 - r, top + 1);
          p.arc(x + w / 2, top + 1, r, Math.PI, TAU);
          p.closePath();
          needle(x + w / 2, top - r + 1, 5);
          break;
        }
        case 'crown': {
          // 阶梯形的冠顶
          body(x, top, w, h);
          for (let i = 1; i <= 3; i++) p.rect(px2(x + (w * i) / 9), top - i * 3, px2(w - (w * 2 * i) / 9), 4);
          break;
        }
        case 'tower': {
          // 电视塔：上细下粗的塔身、两个球形观景台、天线
          const cx = x + w / 2;
          p.moveTo(cx - 4, WATER + 1);
          p.lineTo(cx - 1.5, top + 26);
          p.lineTo(cx + 1.5, top + 26);
          p.lineTo(cx + 4, WATER + 1);
          p.closePath();
          p.moveTo(cx + 9, top + 64);
          p.ellipse(cx, top + 64, 9, 7, 0, 0, TAU);
          p.moveTo(cx + 4.5, top + 36);
          p.ellipse(cx, top + 36, 4.5, 4, 0, 0, TAU);
          needle(cx, top + 27, 27);
          break;
        }
        case 'gable': {
          // 坡屋顶的小房子
          const rh = Math.min(w * 0.35, h * 0.6);
          body(x, top + rh, w, h - rh);
          p.moveTo(x - 1, top + rh + 1);
          p.lineTo(x + w / 2, top);
          p.lineTo(x + w + 1, top + rh + 1);
          p.closePath();
          break;
        }
      }
      return out;
    };

    const WARM: RGB = [255, 212, 148];
    const COOL: RGB = [196, 218, 255];
    const SODIUM: RGB = [255, 176, 96];
    /** 在剪影上开窗：每栋楼一个亮灯率，偶尔整层都亮着（还在加班的那层） */
    const windows = (g: CanvasRenderingContext2D, rects: Rect[], fh: number, cw: number, lit: number, dimA: number, side: boolean) => {
      const tint = rnd() < 0.3 ? COOL : rnd() < 0.2 ? SODIUM : WARM;
      for (const [x, y, w, h] of rects) {
        if (w < cw * 2 || h < fh * 2) continue;
        const cols = Math.floor((w - 3) / cw);
        const ox = x + (w - cols * cw) / 2;
        for (let fy = y + fh * 0.8; fy < y + h - fh * 0.6; fy += fh) {
          const floor = rnd() < 0.12 ? 3.5 : 1;
          for (let c = 0; c < cols; c++) {
            const wx = px2(ox + c * cw + cw * 0.22);
            const wy = px2(fy);
            const ww = Math.max(0.5, px2(cw * 0.5));
            const wh = Math.max(0.5, px2(fh * 0.5));
            // 侧面（右边三成）开窗少一些
            const onSide = side && c >= cols * 0.7;
            if (rnd() < lit * floor * (onSide ? 0.4 : 1)) {
              g.fillStyle = rgba(rnd() < 0.15 ? WARM : tint, 0.5 + rnd() * 0.45);
              g.fillRect(wx, wy, ww, wh);
            } else if (dimA > 0) {
              g.fillStyle = `rgba(150,170,230,${dimA})`;
              g.fillRect(wx, wy, ww, wh);
            }
          }
        }
      }
    };

    interface LayerSpec {
      color: RGB;
      lit: number;
      /** 楼顶受光的渐变长度；0 表示整面均匀（远处的楼隔着雾，看不出明暗） */
      rim: number;
      items: { x: number; w: number; h: number; style: Style; tree?: boolean; beacon?: boolean }[];
      win: { fh: number; cw: number; lit: number; dim: number; side: boolean };
      lamps?: number[];
      /** 盖在这层楼上的一层薄雾：从多高开始、到水线处多浓。远近之间隔着雾，层次才出来 */
      haze?: [y: number, a: number];
    }
    const buildLayer = (spec: LayerSpec): Layer => {
      const sil = offscreen(640, layerH);
      const mask = offscreen(640, layerH);
      const s = sil.getContext('2d')!;
      const m = mask.getContext('2d')!;
      for (const g of [s, m]) g.setTransform(SC, 0, 0, SC, 0, -SKY_TOP * SC);
      const beacons: [number, number][] = [];
      for (const it of spec.items) {
        const p = new Path2D();
        if (it.tree) {
          // 一排行道树：细树干顶着圆圆的树冠，高矮不一
          const count = Math.max(2, Math.round(it.w / 9));
          for (let i = 0; i < count; i++) {
            const cx = it.x + ((i + 0.5) / count) * it.w + (rnd() - 0.5) * 2;
            const th = it.h * (0.75 + rnd() * 0.35);
            const r = 3.2 + rnd() * 2.6;
            p.rect(px2(cx) - 0.5, WATER - th + r, 1, th - r + 1);
            p.moveTo(cx + r, WATER - th);
            p.ellipse(cx, WATER - th, r, r * 1.12, 0, 0, TAU);
            p.moveTo(cx + r * 0.8 + 2, WATER - th + r * 0.6);
            p.arc(cx + 2, WATER - th + r * 0.6, r * 0.8, 0, TAU);
          }
          s.fillStyle = rgba(mixRGB(spec.color, [0, 0, 0], 0.25), 1);
          s.fill(p);
          continue;
        }
        const rects = addBuilding(p, it.x, it.w, it.h, it.style, it.beacon ? beacons : undefined);
        // 每栋楼的颜色有一点深浅差别，相邻的楼才分得开
        const shade = 0.88 + rnd() * 0.24;
        s.fillStyle = rgba(mixRGB([0, 0, 0], spec.color, shade), 1);
        s.fill(p);
        if (spec.win.side) {
          // 右侧三成是背光的侧面
          s.save();
          s.clip(p);
          s.fillStyle = 'rgba(0,0,0,0.28)';
          s.fillRect(px2(it.x + it.w * 0.7), WATER - it.h - 30, it.w, it.h + 40);
          s.restore();
        }
        windows(s, rects, spec.win.fh, spec.win.cw, spec.win.lit * (0.4 + rnd() * 1.2), spec.win.dim, spec.win.side);
        const top = WATER - it.h - 12;
        if (spec.rim > 0) {
          const gr = m.createLinearGradient(0, top, 0, top + 12 + spec.rim);
          gr.addColorStop(0, 'rgba(255,255,255,1)');
          gr.addColorStop(0.35, 'rgba(255,255,255,0.75)');
          gr.addColorStop(1, 'rgba(255,255,255,0.14)');
          m.fillStyle = gr;
        } else m.fillStyle = 'rgba(255,255,255,0.7)';
        m.fill(p);
      }
      if (spec.haze) {
        const [y0, a] = spec.haze;
        const gr = s.createLinearGradient(0, y0, 0, WATER);
        gr.addColorStop(0, 'rgba(48,40,92,0)');
        gr.addColorStop(1, `rgba(48,40,92,${a})`);
        s.fillStyle = gr;
        s.fillRect(0, y0, 640, WATER - y0);
      }
      // 岸边的路灯
      const lamps: [number, number][] = [];
      for (const lx of spec.lamps ?? []) {
        s.fillStyle = rgba(spec.color, 1);
        s.fillRect(lx - 0.5, WATER - 13, 1, 13);
        s.fillRect(lx - 2, WATER - 13.5, 4, 1);
        lamps.push([lx, WATER - 12.5]);
      }
      return { sil, mask, lit: spec.lit, beacons, lamps };
    };

    // 楼高随 x 起伏：两三个“市中心”高，中间低，轮廓才有节奏
    const skyline = (from: number, to: number, minW: number, maxW: number, base: number, amp: number, styles: Style[], peaks: [number, number][]) => {
      const items: LayerSpec['items'] = [];
      for (let x = from; x < to; ) {
        const w = minW + rnd() * (maxW - minW);
        let lift = 0;
        for (const [px, k] of peaks) lift += k * Math.exp(-(((x + w / 2 - px) / 70) ** 2));
        const h = base * (0.6 + rnd() * 0.6) + amp * lift * (0.6 + rnd() * 0.5);
        items.push({ x, w, h, style: styles[Math.floor(rnd() * styles.length)]! });
        x += w + (rnd() < 0.18 ? 2 + rnd() * 6 : -0.5);
      }
      return items;
    };

    // 远景：雾里的高楼群，左边一座带尖顶的摩天楼，右边一座电视塔
    const farItems = skyline(-8, 650, 12, 26, 44, 60, ['flat', 'setback', 'mast', 'dome', 'flat'], [
      [170, 1],
      [470, 0.8],
      [300, 0.35],
    ]);
    farItems.push({ x: 82, w: 20, h: 138, style: 'spire', beacon: true }, { x: 556, w: 20, h: 176, style: 'tower', beacon: true });
    const far = buildLayer({
      color: [30, 32, 66],
      lit: 0.3,
      rim: 0,
      items: farItems,
      win: { fh: 3.5, cw: 3, lit: 0.07, dim: 0, side: false },
      haze: [WATER - 110, 0.42],
    });
    // 中景：主要的楼群，屋顶样式最多
    const midItems = skyline(-10, 650, 18, 40, 30, 74, ['flat', 'setback', 'slant', 'crown', 'mast', 'flat', 'dome'], [
      [400, 1],
      [250, 0.55],
      [600, 0.4],
    ]);
    // 中景最高的那栋楼顶上立一根带航空灯的天线
    const tallest = midItems.reduce((a, b) => (b.h > a.h ? b : a));
    Object.assign(tallest, { style: 'mast', beacon: true });
    const mid = buildLayer({
      color: [13, 16, 34],
      lit: 0.7,
      rim: 30,
      items: midItems,
      win: { fh: 5, cw: 4.2, lit: 0.16, dim: 0.05, side: true },
      haze: [WATER - 50, 0.28],
    });

    // 近景：岸边的矮房子、树丛和路灯
    const nearItems: LayerSpec['items'] = [];
    for (let x = -12; x < 650; ) {
      const tree = rnd() < 0.22;
      const w = tree ? 18 + rnd() * 16 : 22 + rnd() * 30;
      const h = tree ? 14 + rnd() * 10 : 10 + rnd() * 22 + (rnd() < 0.18 ? 16 : 0);
      nearItems.push({ x, w, h, style: (['flat', 'flat', 'setback', 'slant', 'gable', 'flat'] as const)[Math.floor(rnd() * 6)]!, tree });
      x += w + (rnd() < 0.3 ? 3 + rnd() * 10 : -0.5);
    }
    nearItems.push({ x: -10, w: 660, h: 4, style: 'flat' }); // 堤岸
    const near = buildLayer({
      color: [6, 8, 18],
      lit: 0.55,
      rim: 22,
      items: nearItems,
      win: { fh: 6, cw: 5.5, lit: 0.2, dim: 0.04, side: true },
      lamps: [38, 120, 204, 288, 372, 456, 540, 624],
    });
    const layers = [far, mid, near];

    // 星星：越往上越多
    const stars = Array.from({ length: 90 }, () => ({
      x: rnd() * 640,
      y: Math.pow(rnd(), 1.6) * 230,
      r: 0.35 + rnd() * 0.6,
      a: 0.25 + rnd() * 0.55,
      m: 1 + Math.floor(rnd() * 4),
      ph: rnd() * TAU,
    }));

    // ---------- 烟花：每个星点的初速度 ----------

    const shells = SHOW.map((d, id) => {
      const K = KINDS[d.kind];
      const parts: Part[] = [];
      // 球面：斐波那契螺旋取点再加一点抖动，比纯随机均匀，又不会排成整齐的格子
      const sphere = (n: number, v: number, core: boolean) => {
        for (let i = 0; i < n; i++) {
          const y = 1 - (2 * (i + 0.5)) / n;
          const r = Math.sqrt(1 - y * y);
          const a = i * 2.39996 + rnd() * 0.25;
          const s = v * d.size * (0.93 + rnd() * 0.14);
          parts.push(part(r * Math.cos(a) * s, y * s, r * Math.sin(a) * s, core));
        }
      };
      // 圆环：在 xy 平面上的一圈，先绕 x 轴俯仰、再绕视线侧倾，就成了斜着看到的立体环
      const ring = (n: number, v: number, pitch: number, roll: number) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rnd() * 0.04;
          const s = v * d.size * (0.97 + rnd() * 0.06);
          const x = Math.cos(a);
          const y = Math.sin(a) * Math.cos(pitch);
          const z = Math.sin(a) * Math.sin(pitch);
          parts.push(part((x * Math.cos(roll) - y * Math.sin(roll)) * s, (x * Math.sin(roll) + y * Math.cos(roll)) * s, z * s, false));
        }
      };
      const part = (vx: number, vy: number, vz: number, core: boolean): Part => {
        const ember = !core && rnd() < K.ember;
        return { vx, vy, vz, gm: ember ? 1.7 : 0.85 + rnd() * 0.3, ember, h: id * 1000 + parts.length };
      };
      const [pitch, roll] = d.tilt ?? [1, 0];
      if (d.kind === 'saturn') ring(K.n, K.v, pitch, roll);
      else if (d.kind === 'ring') {
        ring(K.n, K.v, pitch, roll);
        ring(K.n, K.v * 0.96, pitch, -roll); // 第二个环反向侧倾，两环交叉
      } else sphere(K.n, K.v, false);
      if (K.core) sphere(K.core, K.v * K.coreV, true);
      // 分组：（主色 / 第二色）×（后、中、前），每组一次画完
      const groups: number[][] = [[], [], [], [], [], []];
      parts.forEach((p, i) => {
        const isCore = i >= parts.length - K.core;
        const second = d.kind === 'ring' && i >= K.n && i < K.n * 2;
        const dz = p.vz / Math.hypot(p.vx, p.vy, p.vz);
        groups[(isCore || second ? 3 : 0) + (dz < -0.33 ? 0 : dz > 0.33 ? 2 : 1)]!.push(i);
      });
      const n = parts.length;
      const rise = 0.85 + (WATER - d.y) / 620;
      return {
        ...d,
        id,
        K,
        parts,
        groups,
        rise,
        x0: d.x - 10 - rnd() * 14 * (d.x > 320 ? -1 : 1),
        seed: rnd(),
        lc: mixRGB(d.c[0], WHITE, 0.3),
        X: new Float32Array(n * (K.segs + 1)),
        Y: new Float32Array(n * (K.segs + 1)),
        vis: new Uint8Array(n),
      };
    });
    type Shell = (typeof shells)[number];

    /** 升空：竖直上抛，越往上越慢，到顶点速度正好为零 */
    const riseAt = (s: Shell, tau: number): [number, number] => {
      const u = clamp(tau / s.rise);
      const e = 1 - (1 - u) * (1 - u);
      return [mix(s.x0, s.x, u) + Math.sin(u * 8 + s.seed * 6) * 1.6 * (1 - u), mix(WATER + 6, s.y, e)];
    };

    /** 炸开后的亮度：一瞬间冲到顶，然后很快暗下去 */
    const flashAt = (b: number) => (b < 0 ? 0 : smooth(0, 0.035, b) * Math.exp(-3.2 * b));

    const drawRise = (s: Shell, tau: number) => {
      // 淡淡的烟迹
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const [x, y] = riseAt(s, Math.max(0, tau - k * 0.06));
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,214,170,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 火星：从过去的位置喷出，往下掉、往两边散，越老越暗
      for (let k = 1; k <= 18; k++) {
        const age = k * 0.028;
        const te = tau - age;
        if (te < 0) break;
        const [x, y] = riseAt(s, te);
        const a = Math.pow(1 - age / 0.52, 1.6) * (0.3 + 0.7 * hash(s.id * 31 + k, Math.floor(tau * 26)));
        ctx.fillStyle = rgba(mixRGB(GOLD, WHITE, 0.4), a);
        ctx.fillRect(x + (hash(s.id, k) - 0.5) * age * 34 - 0.6, y + 46 * age * age - 0.6, 1.2, 1.2);
      }
      const [hx, hy] = riseAt(s, tau);
      glow(GOLD, hx, hy, 5, 0.6);
      ctx.fillStyle = 'rgba(255,246,228,0.95)';
      ctx.beginPath();
      ctx.arc(hx, hy, 1.3, 0, TAU);
      ctx.fill();
    };

    const drawBurst = (s: Shell, b: number) => {
      const { K, parts, X, Y, vis } = s;
      const S = K.segs;
      const n = parts.length;
      const k = K.drag;
      const ringy = s.kind === 'ring' || s.kind === 'saturn';
      // 圆环刚炸开时飞得最快，拖尾会连成一整片实心的椭圆；先把拖尾压短，让它一开始就是一圈分明的星点
      const trail = ringy ? K.trail * (0.2 + 0.8 * smooth(0.1, 0.5, b)) : K.trail;
      // 每个星点在 S+1 个时刻的位置：j = 0 是现在，j = S 是拖尾的末端
      // 闭式解：速度按 e^(−kt) 衰减、向风速和重力的终端速度靠拢；z 只用来做一点透视和前后明暗
      for (let j = 0; j <= S; j++) {
        const bb = Math.max(0, b - (trail * j) / S);
        const f = (1 - Math.exp(-k * bb)) / k;
        const drift = bb - f;
        for (let i = 0; i < n; i++) {
          const p = parts[i]!;
          const q = K.persp / (K.persp - p.vz * f);
          X[i * (S + 1) + j] = s.x + (p.vx * f + WIND * drift) * q;
          Y[i * (S + 1) + j] = s.y + (p.vy * f + ((K.g * p.gm) / k) * drift) * q;
        }
      }

      const life = K.life;
      const hot = 1 - smooth(0, ringy ? 0.16 : 0.26, b); // 刚炸开时白热
      // 圆环等它张开一点再亮起来，不然刚炸开时是一块实心的小椭圆
      let env = (ringy ? smooth(0.03, 0.13, b) : smooth(0, 0.025, b)) * (1 - smooth(life * 0.42, life, b));
      if (s.kind === 'strobe') env *= 1 - smooth(0.3, 0.85, b);
      // 快熄灭时星点一明一暗，越来越多地熄掉
      const off = s.kind === 'willow' ? 0 : smooth(life * 0.55, life, b) * 0.75;
      const tick = Math.floor(b * 16);
      for (let i = 0; i < n; i++) vis[i] = off === 0 || hash(parts[i]!.h, tick) >= off ? 1 : 0;

      let main = s.c[0];
      if (s.kind === 'peony') main = mixRGB(s.c[0], s.c[1], smooth(life * 0.4, life * 0.52, b)); // 变色星
      if (s.kind === 'willow') main = mixRGB(s.c[0], s.c[1], smooth(0.8, life, b));
      const second = s.kind === 'ring' ? s.c[1] : s.c[2];
      const cols = [mixRGB(main, WHITE, hot * 0.85), mixRGB(second, WHITE, hot * 0.85)];
      const alpha = s.kind === 'willow' ? 0.72 : 0.95;
      const bloom = smooth(0.05, 0.3, b);

      if (env > 0.004) {
        ctx.lineCap = 'round';
        for (let gi = 0; gi < 6; gi++) {
          const members = s.groups[gi]!;
          if (!members.length) continue;
          const dz = gi % 3;
          const depth = DEPTH_A[dz]!;
          const col = cols[gi < 3 ? 0 : 1]!;
          for (let j = 0; j < S; j++) {
            const a = env * depth * alpha * Math.pow(1 - j / S, 1.25);
            if (a < 0.006) continue;
            ctx.beginPath();
            for (const i of members) {
              if (!vis[i]) continue;
              const o = i * (S + 1) + j;
              ctx.moveTo(X[o]!, Y[o]!);
              ctx.lineTo(X[o + 1]!, Y[o + 1]!);
            }
            ctx.lineWidth = K.w * (1 - (0.5 * j) / S) * DEPTH_W[dz]! * s.size;
            ctx.strokeStyle = rgba(col, a);
            ctx.stroke();
            if (j === 0 && bloom > 0) {
              // 外面再描一圈宽而淡的线，当作光晕（刚炸开时星点挤在一起，先不加，免得糊成一团白）
              ctx.lineWidth *= 3.6;
              ctx.strokeStyle = rgba(col, a * 0.13 * bloom);
              ctx.stroke();
            }
          }
          // 星点的头：更亮、偏白
          ctx.beginPath();
          const r = K.head * DEPTH_R[dz]! * s.size * (0.4 + 0.6 * bloom);
          for (const i of members) {
            if (!vis[i]) continue;
            const o = i * (S + 1);
            ctx.moveTo(X[o]! + r, Y[o]!);
            ctx.arc(X[o]!, Y[o]!, r, 0, TAU);
          }
          ctx.fillStyle = rgba(mixRGB(col, WHITE, 0.55), env * depth);
          ctx.fill();
        }
      }

      // 闪光弹：后半段每个星点各自高频明灭
      if (s.kind === 'strobe' && b > 0.4) {
        const ga = smooth(0.4, 0.65, b) * (1 - smooth(life * 0.65, life, b));
        const q = Math.floor(b * 22);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (hash(parts[i]!.h, q) > 0.3) continue;
          const o = i * (S + 1);
          ctx.moveTo(X[o]! + 1.3, Y[o]!);
          ctx.arc(X[o]!, Y[o]!, 1.3, 0, TAU);
          glow(SILVER, X[o]!, Y[o]!, 6, ga * 0.35);
        }
        ctx.fillStyle = rgba(WHITE, ga);
        ctx.fill();
      }

      // 垂柳、菊花的梢头：细碎的金色闪点
      if ((s.kind === 'willow' || s.kind === 'chrys') && b > 0.5) {
        const ga = smooth(0.5, 1, b) * (1 - smooth(life * 0.7, life, b));
        const q = Math.floor(b * 18);
        ctx.fillStyle = rgba(mixRGB(GOLD, WHITE, 0.6), ga);
        for (let i = 0; i < n; i++) {
          if (hash(parts[i]!.h + 7, q) > 0.22) continue;
          const o = i * (S + 1);
          ctx.fillRect(X[o]! - 0.7, Y[o]! - 0.7, 1.4, 1.4);
        }
      }

      // 余烬：一部分星点熄灭后还带着暗橙色继续往下落，一闪一闪
      if (K.ember > 0 && b > life * 0.5) {
        const ea = smooth(life * 0.5, life * 0.8, b) * (1 - smooth(life, life + EMBER, b));
        if (ea > 0.004) {
          const col = mixRGB(AMBER, RED, smooth(life * 0.6, life + EMBER, b));
          const q = Math.floor(b * 12);
          for (const [lo, hi, a] of [
            [0, 0.35, 0.18],
            [0.35, 0.75, 0.5],
            [0.75, 1.01, 1],
          ] as const) {
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
              const p = parts[i]!;
              if (!p.ember) continue;
              const v = hash(p.h + 3, q);
              if (v < lo || v >= hi) continue;
              const o = i * (S + 1);
              ctx.rect(X[o]! - 0.65, Y[o]! - 0.65, 1.3, 1.3);
            }
            ctx.fillStyle = rgba(col, ea * a * 0.85);
            ctx.fill();
          }
        }
      }

      // 炸开的一瞬间：中心一小团白光，外面一圈主色
      if (b < 0.22) {
        const k2 = 1 - b / 0.22;
        wash(WHITE, s.x, s.y, (10 + 160 * b) * s.size, k2 * k2 * 0.75);
        glow(s.c[0], s.x, s.y, (40 + 200 * b) * s.size, k2 * k2 * 0.45);
      }
    };

    /**
     * 用炸开的光给一层楼上色：光场（低分辨率、已经叠好了各处的光）放大后用这层楼的受光面裁一下，再加到画面上。
     * 受光面楼顶最亮、往下渐暗，看起来就是楼顶被天上的光照亮了
     */
    const lightLayer = (L: Layer) => {
      sc.globalCompositeOperation = 'copy';
      sc.drawImage(L.mask, 0, 0);
      sc.globalCompositeOperation = 'source-in';
      sc.drawImage(field, 0, 0, scratch.width, scratch.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = L.lit;
      ctx.drawImage(scratch, 0, SKY_TOP, 640, layerH);
      ctx.globalAlpha = 1;
    };

    const lights: { s: Shell; I: number }[] = [];

    const render = (t: number) => {
      // 这一帧有哪些烟花刚炸开、亮度多少
      lights.length = 0;
      let flash = 0;
      for (const s of shells) {
        const I = flashAt(wrap(t, s.at, D) - s.rise) * s.size;
        if (I > 0.01) {
          lights.push({ s, I });
          flash += I;
        }
      }
      flash = clamp(flash);

      // 天空
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(skyCv, 0, 0, 640, WATER);

      // 星星（炸开时被亮光压暗一点），闪烁的周期都是整数圈
      const dim = 1 - 0.6 * flash;
      ctx.fillStyle = '#fff';
      for (const st of stars) {
        ctx.globalAlpha = st.a * dim * (0.6 + 0.4 * Math.sin((TAU * st.m * t) / D + st.ph));
        ctx.fillRect(st.x, st.y, st.r * 1.6, st.r * 1.6);
      }
      ctx.globalAlpha = 1;

      // 炸开的光把一大片天空染上颜色
      ctx.globalCompositeOperation = 'lighter';
      for (const { s, I } of lights) wash(s.c[0], s.x, s.y, 380, 0.36 * I);

      // 烟雾：每次炸开留下几团，随风飘散、慢慢下沉；平时几乎看不见，有新的烟花炸开时被照亮
      for (const s of shells) {
        const b = wrap(t, s.at, D) - s.rise;
        if (b < 0 || b > 7) continue;
        const a = smooth(0, 0.8, b) * (1 - smooth(2.5, 7, b)) * (0.05 + 0.22 * flash);
        for (let i = 0; i < 3; i++) {
          const r = (34 + 9 * b + 10 * i) * s.size;
          wash(SMOKE, s.x + (i - 1) * 22 * s.size + WIND * (0.7 + 0.25 * i) * b, s.y + (i % 2) * 14 + 4 * b, r, a * (1 - i * 0.2));
        }
      }

      // 光场：所有正在亮的烟花叠在一起，给三层楼共用
      if (lights.length) {
        fc.setTransform(1, 0, 0, 1, 0, 0);
        fc.globalCompositeOperation = 'source-over';
        fc.clearRect(0, 0, field.width, field.height);
        fc.setTransform(1 / 8, 0, 0, 1 / 8, 0, -SKY_TOP / 8);
        fc.globalCompositeOperation = 'lighter';
        for (const { s, I } of lights) wash(s.lc, s.x, s.y, 460, 1.15 * I, fc);
      }

      // 远景楼群（自带一层薄雾）
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(far.sil, 0, SKY_TOP, 640, layerH);
      if (lights.length) lightLayer(far);

      // 烟花在远景前、中景后：升空的弹从楼后面冒出来，余烬落回楼后
      ctx.globalCompositeOperation = 'lighter';
      for (const s of shells) {
        const tau = wrap(t, s.at, D);
        if (tau < s.rise) drawRise(s, tau);
        else if (tau - s.rise < s.K.life + EMBER) drawBurst(s, tau - s.rise);
      }

      // 中景、近景
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(mid.sil, 0, SKY_TOP, 640, layerH);
      if (lights.length) lightLayer(mid);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(near.sil, 0, SKY_TOP, 640, layerH);
      if (lights.length) lightLayer(near);

      // 塔顶的航空灯：每 1.5 秒闪一下（一轮正好 8 次）；岸边路灯
      ctx.globalCompositeOperation = 'lighter';
      const blink = Math.pow(Math.max(0, Math.cos((TAU * t) / 1.5)), 12);
      for (const L of layers) {
        for (const [x, y] of L.beacons) {
          glow(RED, x, y, 6, 0.2 + 0.8 * blink);
          ctx.fillStyle = rgba(RED, 0.35 + 0.65 * blink);
          ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
        }
        for (const [x, y] of L.lamps) {
          glow(SODIUM, x, y, 9, 0.55);
          ctx.fillStyle = rgba(mixRGB(SODIUM, WHITE, 0.6), 1);
          ctx.fillRect(x - 1, y - 0.5, 2, 1.5);
        }
      }

      // ---------- 水面 ----------
      // 先把水线以上的一条拷出来，再一行行上下翻转、压扁贴进水里，按行左右错开，越近波纹越大
      rc.globalCompositeOperation = 'copy';
      rc.drawImage(canvas, 0, (WATER - reflH) * SC, 640 * SC, reflH * SC, 0, 0, reflCv.width, reflCv.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#04060e';
      ctx.fillRect(0, WATER, 640, DEPTH);
      const ph = (TAU * t * 3) / D;
      for (let dy = 0; dy < DEPTH; dy += 2) {
        const k = dy / DEPTH;
        const sy = reflH - (dy + 2) / SQUASH;
        const shift = (0.5 + 3.4 * k) * Math.sin(dy * 0.5 - ph * 2) + 1.4 * k * Math.sin(dy * 0.17 + ph);
        ctx.globalAlpha = (0.92 - 0.35 * k) * (0.8 + 0.2 * Math.sin(dy * 1.7 + ph * 3));
        ctx.drawImage(reflCv, 0, sy * SC, 640 * SC, (2 / SQUASH) * SC, shift - 4, WATER + dy, 648, 2);
      }
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = 'lighter';
      // 烟花在水里的彩色碎光：一条条短横线，随波纹抖动
      for (const s of shells) {
        const b = wrap(t, s.at, D) - s.rise;
        if (b < 0 || b > s.K.life) continue;
        const B = Math.max(flashAt(b) * 1.2, 0.3 * (1 - smooth(0, s.K.life, b))) * s.size;
        wash(s.c[0], s.x + WIND * b, WATER + 14, 90, 0.16 * B);
        ctx.fillStyle = rgba(mixRGB(s.c[0], WHITE, 0.3), 1);
        for (let dy = 3; dy < DEPTH; dy += 3) {
          const k = dy / DEPTH;
          const a = B * 0.55 * Math.pow(1 - k, 1.3) * (0.5 + 0.5 * Math.sin(dy * 1.9 + ph * 4 + s.seed * 10));
          if (a < 0.01) continue;
          const w = (5 + 22 * k) * (0.6 + 0.4 * Math.sin(dy * 0.7 - ph * 2 + s.seed * 7));
          const x = s.x + WIND * b + Math.sin(dy * 0.45 + ph * 2) * (2 + 6 * k);
          ctx.globalAlpha = clamp(a);
          ctx.fillRect(x - w / 2, WATER + dy, w, 1.2);
        }
        ctx.globalAlpha = 1;
      }
      // 路灯的倒影：竖着拉长的暖色光柱
      ctx.fillStyle = rgba(SODIUM, 1);
      for (const [lx] of near.lamps) {
        for (let dy = 2; dy < DEPTH * 0.75; dy += 2.5) {
          const k = dy / DEPTH;
          ctx.globalAlpha = 0.32 * Math.pow(1 - k / 0.75, 1.5) * (0.5 + 0.5 * Math.sin(dy * 2.3 + ph * 5 + lx));
          const w = 1.5 + 5 * k * (0.5 + 0.5 * Math.sin(dy * 0.9 - ph * 3 + lx));
          ctx.fillRect(lx - w / 2 + Math.sin(dy * 0.5 - ph * 2) * (0.5 + 2 * k), WATER + dy, w, 1);
        }
      }
      ctx.globalAlpha = 1;
      // 水岸线上一道细细的反光
      ctx.fillStyle = `rgba(150,160,230,${0.1 + 0.25 * flash})`;
      ctx.fillRect(0, WATER, 640, 0.5);

      // 水面渐深、四角压暗
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(shadeCv, 0, 0, 640, 400);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 8.3 });
  },
};
