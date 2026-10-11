// 琥珀融球：六颗琥珀色的液态玻璃滴依次被吸到中间、黏成一大团，晃一晃，再被拉开——拉开时中间扯出一根越来越细的丝，最后断开缩回去。
// 画法：
//   1. 场：每颗液滴在一张 2.5px 一格的网格上累加 r²/d²（乘一个窗口让它在 3 倍半径外归零，只算包围盒里的格子），拉丝是一段两头粗中间细的线段场；
//   2. 轮廓：对场做 marching squares，取阈值 1 的等值线并连成闭合曲线，用二次曲线磨平，作为裁剪路径——边缘在任何分辨率下都是锐利的；
//   3. 质感：把场当成一个“鼓包”的高度，用场的解析梯度算法线，逐格算折射（透过液滴看到放大、偏移的底纹和自己的影子）、
//      按厚度吸收（薄处浅蜜色、厚处深琥珀）、菲涅尔边缘反光和两处高光；
//   4. 阴影：同一张场错开一点取柔和阈值，中间亮的地方叠一块聚焦的暖光（焦散）。
// 所有运动都是 t 的纯函数，弹簧轨道把上一轮的余波叠到开头，循环无缝。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, smooth, TAU, type SceneDef } from './util.ts';

const D = 10;
const CELL = 2.5;
const GW = 640 / CELL;
const GH = 400 / CELL;
const PW = GW + 1; // 网格点（格子的角）
const PH = GH + 1;
const NP = PW * PH;
const THR = 1;
const REACH = 3; // 核函数在几倍半径外归零
const CENTER = { x: 330, y: 204 };
const SHADOW = { x: 12.5, y: 20 }; // 阴影错开的距离（px），取整到格子
const HMAX = 30; // 把场当成鼓包时的最大高度（px），决定法线有多“鼓”
const REFR = 24; // 折射的偏移量（px）

// 液滴：家的位置、半径、收拢和拉开的顺序
const DROPS = [
  { x: 118, y: 128, r: 36, merge: 2, split: 1 },
  { x: 212, y: 302, r: 28, merge: 4, split: 4 },
  { x: 334, y: 74, r: 23, merge: 0, split: 2 },
  { x: 480, y: 108, r: 31, merge: 1, split: 5 },
  { x: 534, y: 282, r: 40, merge: 3, split: 0 },
  { x: 378, y: 336, r: 24, merge: 5, split: 3 },
];
const MERGE_AT = 0.7;
const MERGE_GAP = 0.34;
const SPLIT_AT = 5.4;
const SPLIT_GAP = 0.3;
const SNAP = 0.58; // 拉丝在离开后多久断开

// 光：主光在左上，补光在右下
const norm3 = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l] as const;
};
const KEY = norm3(-0.5, -0.62, 0.6);
const HALF = norm3(KEY[0], KEY[1], KEY[2] + 1);
const FILL = norm3(0.62, 0.55, 0.56);
const HALF2 = norm3(FILL[0], FILL[1], FILL[2] + 1);
// 琥珀对 r、g、b 的吸收系数：蓝光吸收得最多
const SIGMA = [0.2, 0.86, 2.3];
const SCATTER = [255, 168, 52];
const SHADOW_RGB = [118, 70, 24];
const CAUSTIC_RGB = [255, 204, 116];

// 底纹：和 CSS 背景同一个函数（暖白的径向渐变 + 24px 一格的圆点），给折射取样用
const BG_STOPS: [number, number[]][] = [
  [0, [251, 248, 242]],
  [0.6, [240, 233, 222]],
  [1, [228, 219, 205]],
];
const DOT = [168, 146, 116];
function background(x: number, y: number, out: number[]) {
  const d = Math.min(1, Math.hypot((x - 256) / 544, (y - 112) / 300));
  const k = d < 0.6 ? d / 0.6 : (d - 0.6) / 0.4;
  const a = d < 0.6 ? BG_STOPS[0]![1] : BG_STOPS[1]![1];
  const b = d < 0.6 ? BG_STOPS[1]![1] : BG_STOPS[2]![1];
  const gx = (((x % 24) + 24) % 24) - 12;
  const gy = (((y % 24) + 24) % 24) - 12;
  // 圆点：采样比点本身粗，用更宽的软边，避免闪烁
  const dot = 0.3 * clamp((4.2 - Math.hypot(gx, gy)) / 2.6);
  for (let c = 0; c < 3; c++) out[c] = mix(mix(a[c]!, b[c]!, k), DOT[c]!, dot);
}

export const metaballs: SceneDef = {
  title: '琥珀融球',
  category: '图形',
  description: '六颗琥珀色的液态玻璃滴依次黏成一大团，晃一晃再被拉开，中间扯出细丝、断开缩回。透过液滴能看到被放大的底纹和它自己的影子。',
  tags: ['spring', 'track', '距离场', 'marching squares', '折射', 'canvas'],
  tone: 'light',
  en: {
    title: 'Amber metaballs',
    description: 'Six drops of amber liquid glass fuse one by one into a single blob, wobble, then pull apart with strands that stretch thin, snap and retract. Through the glass you see the dot grid magnified, and the drop’s own shadow.',
    tags: ['spring', 'track', 'distance field', 'marching squares', 'refraction', 'canvas'],
  },
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-meta');
    stage.style.background =
      'radial-gradient(circle at 12px 12px, rgba(168,146,116,.42) 1.3px, rgba(168,146,116,0) 2px) 0 0 / 24px 24px, radial-gradient(85% 75% at 40% 28%, #fbf8f2, #f0e9de 60%, #e4dbcd)';
    const { ctx } = createCanvas(stage, 2);
    // 两张网格分辨率的小图：阴影和液滴本体，画的时候放大到整个舞台
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = PW;
      c.height = PH;
      const g = c.getContext('2d')!;
      return { c, g, img: g.createImageData(PW, PH) };
    };
    const shadowImg = mk();
    const bodyImg = mk();

    const F = new Float32Array(NP);
    const GX = new Float32Array(NP);
    const GY = new Float32Array(NP);
    const WR = new Float32Array(NP); // 按半径加权的场：WR / F ≈ 这一处属于多粗的形状（液滴还是细丝）
    const SA = new Float32Array(NP); // 每个格点的阴影浓度，折射时用

    // 累加一颗液滴：r²/d² × (1 − d²/R²)²，同时累加解析梯度
    const addBall = (cx: number, cy: number, r: number) => {
      if (r <= 0.5) return;
      const R = r * REACH;
      const R2 = R * R;
      const r2 = r * r;
      const i0 = Math.max(0, Math.ceil((cx - R) / CELL));
      const i1 = Math.min(GW, Math.floor((cx + R) / CELL));
      const j0 = Math.max(0, Math.ceil((cy - R) / CELL));
      const j1 = Math.min(GH, Math.floor((cy + R) / CELL));
      for (let j = j0; j <= j1; j++) {
        const dy = j * CELL - cy;
        const dy2 = dy * dy;
        let p = j * PW + i0;
        for (let i = i0; i <= i1; i++, p++) {
          const dx = i * CELL - cx;
          const d2 = dx * dx + dy2;
          if (d2 >= R2) continue;
          const q = 1 - d2 / R2;
          const inv = 1 / (d2 + 0.01);
          const base = r2 * inv;
          F[p] = F[p]! + base * q * q;
          WR[p] = WR[p]! + base * q * q * r;
          const g = -2 * base * q * (q * inv + 2 / R2);
          GX[p] = GX[p]! + g * dx;
          GY[p] = GY[p]! + g * dy;
        }
      }
    };
    // 累加一根拉丝：到线段的距离场，粗细从 wa 渐变到 wb，再乘一个中间细的“颈”（neck = 中点粗细的比例）
    const addStrand = (ax: number, ay: number, bx: number, by: number, wa: number, wb: number, neck: number) => {
      if (Math.max(wa, wb) <= 0.3) return;
      const vx = bx - ax;
      const vy = by - ay;
      const L2 = vx * vx + vy * vy || 1;
      const R = Math.max(wa, wb) * REACH;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx) - R) / CELL));
      const i1 = Math.min(GW, Math.floor((Math.max(ax, bx) + R) / CELL));
      const j0 = Math.max(0, Math.ceil((Math.min(ay, by) - R) / CELL));
      const j1 = Math.min(GH, Math.floor((Math.max(ay, by) + R) / CELL));
      for (let j = j0; j <= j1; j++) {
        const y = j * CELL;
        let p = j * PW + i0;
        for (let i = i0; i <= i1; i++, p++) {
          const x = i * CELL;
          const u = clamp(((x - ax) * vx + (y - ay) * vy) / L2);
          const dx = x - (ax + u * vx);
          const dy = y - (ay + u * vy);
          const d2 = dx * dx + dy * dy;
          const m = 2 * u - 1;
          const we = (wa + (wb - wa) * u) * (neck + (1 - neck) * m * m);
          const R2 = we * we * REACH * REACH;
          if (d2 >= R2) continue;
          const q = 1 - d2 / R2;
          const inv = 1 / (d2 + 0.01);
          const base = we * we * inv;
          F[p] = F[p]! + base * q * q;
          WR[p] = WR[p]! + base * q * q * we;
          const g = -2 * base * q * (q * inv + 2 / R2);
          GX[p] = GX[p]! + g * dx;
          GY[p] = GY[p]! + g * dy;
        }
      }
    };

    // ---------- marching squares：阈值等值线 → 闭合曲线 ----------
    const HC = GW * PH; // 横边数
    const EC = HC + PW * GH; // 加上竖边
    const EX = new Float32Array(EC);
    const EY = new Float32Array(EC);
    const L0 = new Int32Array(EC).fill(-1);
    const L1 = new Int32Array(EC).fill(-1);
    const SEEN = new Int32Array(EC);
    const used: number[] = [];
    const loop = new Float32Array(EC * 2);
    let stamp = 0;
    const touch = (e: number) => {
      if (SEEN[e] === stamp) return;
      SEEN[e] = stamp;
      used.push(e);
      let pa: number;
      let pb: number;
      if (e < HC) {
        const j = Math.floor(e / GW);
        pa = j * PW + (e - j * GW);
        pb = pa + 1;
      } else {
        pa = e - HC;
        pb = pa + PW;
      }
      const fa = F[pa]!;
      const k = (THR - fa) / (F[pb]! - fa);
      const ia = pa % PW;
      const ja = (pa - ia) / PW;
      EX[e] = (ia + (e < HC ? k : 0)) * CELL;
      EY[e] = (ja + (e < HC ? 0 : k)) * CELL;
    };
    const seg = (a: number, b: number) => {
      touch(a);
      touch(b);
      if (L0[a] === -1) L0[a] = b;
      else L1[a] = b;
      if (L0[b] === -1) L0[b] = a;
      else L1[b] = a;
    };
    const contour = () => {
      stamp++;
      for (let j = 0; j < GH; j++) {
        for (let i = 0; i < GW; i++) {
          const a = j * PW + i;
          const fa = F[a]!;
          const fb = F[a + 1]!;
          const fd = F[a + PW]!;
          const fc = F[a + PW + 1]!;
          const k = (fa > THR ? 1 : 0) | (fb > THR ? 2 : 0) | (fc > THR ? 4 : 0) | (fd > THR ? 8 : 0);
          if (k === 0 || k === 15) continue;
          const top = j * GW + i;
          const bottom = top + GW;
          const left = HC + a;
          const right = left + 1;
          const mid = (fa + fb + fc + fd) / 4 > THR;
          switch (k) {
            case 1: case 14: seg(left, top); break;
            case 2: case 13: seg(top, right); break;
            case 3: case 12: seg(left, right); break;
            case 4: case 11: seg(right, bottom); break;
            case 6: case 9: seg(top, bottom); break;
            case 7: case 8: seg(left, bottom); break;
            case 5:
              if (mid) { seg(top, right); seg(bottom, left); } else { seg(left, top); seg(right, bottom); }
              break;
            case 10:
              if (mid) { seg(left, top); seg(right, bottom); } else { seg(top, right); seg(bottom, left); }
              break;
          }
        }
      }
      // 沿着链接把线段串成闭合曲线，相邻点之间用二次曲线过中点，磨掉折角
      const path = new Path2D();
      stamp++;
      for (const e of used) {
        if (SEEN[e] === stamp) continue;
        let n = 0;
        let prev = -1;
        let cur = e;
        for (;;) {
          SEEN[cur] = stamp;
          loop[n++] = EX[cur]!;
          loop[n++] = EY[cur]!;
          const n0 = L0[cur]!;
          const next = n0 !== prev ? n0 : L1[cur]!;
          if (next < 0 || SEEN[next] === stamp) break;
          prev = cur;
          cur = next;
        }
        const m = n / 2;
        if (m < 3) continue;
        path.moveTo((loop[n - 2]! + loop[0]!) / 2, (loop[n - 1]! + loop[1]!) / 2);
        for (let k = 0; k < m; k++) {
          const k2 = ((k + 1) % m) * 2;
          path.quadraticCurveTo(loop[k * 2]!, loop[k * 2 + 1]!, (loop[k * 2]! + loop[k2]!) / 2, (loop[k * 2 + 1]! + loop[k2 + 1]!) / 2);
        }
        path.closePath();
      }
      for (const e of used) L0[e] = L1[e] = -1;
      used.length = 0;
      return path;
    };

    // ---------- 运动 ----------
    const pull = spring({ duration: 1.35, bounce: 0.3 });
    const release = spring({ duration: 1.6, bounce: 0.34 });
    const drops = DROPS.map((d, i) => {
      const mergeAt = MERGE_AT + d.merge * MERGE_GAP;
      const splitAt = SPLIT_AT + d.split * SPLIT_GAP;
      const p = track(0, [[mergeAt, 1, pull], [splitAt, 0, release]]);
      // 收拢后在大团里的位置：围着中心错开一点，让大团不是正圆
      // 在大团里各自绕着中心慢慢转（整数圈），大团的轮廓就一直在缓缓变形
      const a = (i / DROPS.length) * TAU + 0.4;
      const off = 13 + (i % 3) * 8;
      const orbit = ((i % 3) - 1 || 2) * (TAU / D);
      // 走弧线：路径的法向偏一点
      const dx = CENTER.x - d.x;
      const dy = CENTER.y - d.y;
      const len = Math.hypot(dx, dy);
      return { ...d, splitAt, p: (t: number) => p(t) + p(t + D), a, off, orbit, nx: -dy / len, ny: dx / len, bend: (i % 2 ? 1 : -1) * 34, ph: i * 1.9 };
    });

    const rgb = [0, 0, 0];
    const render = (t: number) => {
      F.fill(0);
      WR.fill(0);
      GX.fill(0);
      GY.fill(0);
      // 大团的中心慢慢漂，收拢后的整体也慢慢转
      const cx = CENTER.x + 10 * Math.sin((TAU * t) / D);
      const cy = CENTER.y + 6 * Math.sin((TAU * 2 * t) / D + 0.5);
      const spin = 0.5 * Math.sin((TAU * t) / D);
      const pos = drops.map((d) => {
        const p = d.p(t);
        const pc = clamp(p);
        const bob = 1 - pc;
        const hx = d.x + bob * 7 * Math.sin((TAU * 2 * t) / D + d.ph);
        const hy = d.y + bob * 6 * Math.cos((TAU * 3 * t) / D + d.ph);
        const ang = d.a + d.orbit * t + spin;
        const tx = cx + Math.cos(ang) * d.off;
        const ty = cy + Math.sin(ang) * d.off * 0.85;
        const arc = Math.sin(Math.PI * pc) * d.bend;
        return { x: mix(hx, tx, p) + d.nx * arc, y: mix(hy, ty, p) + d.ny * arc, r: d.r };
      });
      for (const b of pos) addBall(b.x, b.y, b.r);
      // 拉丝：液滴离开大团时，从大团中心到液滴连一根中间细的丝，越拉越细；
      // 中点细到一格左右就断开，两截各自缩回去，断口处留下一颗小液珠被拉回大团
      drops.forEach((d, i) => {
        const local = t - d.splitAt;
        if (local < 0.05 || local > SNAP + 0.5) return;
        const b = pos[i]!;
        // 丝的另一头：还留在大团里的液滴的重心；最后一颗离开时大团已经空了，就连到上一颗离开的液滴
        let sw = 0;
        let ax = 0;
        let ay = 0;
        drops.forEach((o, j) => {
          if (j === i) return;
          const k = o.r * o.r * smooth(0.4, 0.9, o.p(t));
          sw += k;
          ax += pos[j]!.x * k;
          ay += pos[j]!.y * k;
        });
        if (sw > 1) {
          ax /= sw;
          ay /= sw;
        } else {
          const prev = pos[drops.findIndex((o) => o.split === d.split - 1)] ?? b;
          ax = prev.x;
          ay = prev.y;
        }
        const w0 = Math.max(10, d.r * 0.42);
        if (local < SNAP) {
          const k = smooth(0.05, SNAP, local);
          const w = w0 * mix(0.95, 0.55, k) * smooth(0.05, 0.18, local);
          addStrand(ax, ay, b.x, b.y, w, w, mix(0.6, 3 / (w0 * 0.55), k));
          return;
        }
        const k = smooth(SNAP, SNAP + 0.4, local);
        const mx = (ax + b.x) / 2;
        const my = (ay + b.y) / 2;
        const w = w0 * 0.55 * (1 - 0.4 * k);
        addStrand(b.x, b.y, mix(mx, b.x, k), mix(my, b.y, k), w, 3, 1);
        addStrand(ax, ay, mix(mx, ax, k), mix(my, ay, k), w, 3, 1);
        // 断口处的小液珠被拉回较大的那一边
        const sk = smooth(SNAP, SNAP + 0.5, local);
        addBall(mix(mx, ax, sk * sk), mix(my, ay, sk * sk), 5.5 * (1 - smooth(0.75, 1, sk)));
      });

      // 阴影：场错开一点后取一个软阈值；场高的地方（液滴最厚处）叠焦散的暖光
      const sox = Math.round(SHADOW.x / CELL);
      const soy = Math.round(SHADOW.y / CELL);
      const sd = shadowImg.img.data;
      for (let j = 0; j < PH; j++) {
        for (let i = 0; i < PW; i++) {
          const p = j * PW + i;
          const si = i - sox;
          const sj = j - soy;
          const f = si >= 0 && sj >= 0 ? F[sj * PW + si]! : 0;
          const o = p * 4;
          if (f < 0.42) {
            SA[p] = 0;
            sd[o + 3] = 0;
            continue;
          }
          const a = smooth(0.42, 1.35, f) * 0.3;
          const c = f > THR ? smooth(0.3, 0.85, Math.sqrt(1 - THR / f)) * 0.9 : 0;
          SA[p] = a;
          const wc = c / (a + c + 1e-4);
          sd[o] = mix(SHADOW_RGB[0]!, CAUSTIC_RGB[0]!, wc);
          sd[o + 1] = mix(SHADOW_RGB[1]!, CAUSTIC_RGB[1]!, wc);
          sd[o + 2] = mix(SHADOW_RGB[2]!, CAUSTIC_RGB[2]!, wc);
          sd[o + 3] = 255 * clamp(a + c * 0.55);
        }
      }

      // 液滴本体：逐格算法线、折射、吸收、反光
      const bd = bodyImg.img.data;
      for (let j = 0; j < PH; j++) {
        for (let i = 0; i < PW; i++) {
          const p = j * PW + i;
          const f = F[p]!;
          const o = p * 4;
          if (f < 0.5) {
            bd[o + 3] = 0;
            continue;
          }
          const gx = GX[p]!;
          const gy = GY[p]!;
          // 高度 H = HMAX·h(f)，h = √(1 − THR/f)；dH/dx = HMAX·THR/(2h·f²)·∂f/∂x；法线 = (−dH/dx, −dH/dy, 1)。
          // 阈值外的那一圈也用同一个式子（h 取下限），法线在轮廓内外是连续的，细丝上不会一格亮一格暗
          const h = f > THR ? Math.sqrt(1 - THR / f) : 0;
          // 这一处形状的粗细：液滴接近 1，细丝很小。细丝的鼓包矮、光程短，整根颜色均匀，不会出现一串亮点
          const tk = clamp(WR[p]! / f / 24, 0.15, 1);
          const k = (HMAX * tk * THR) / (2 * Math.max(h, 0.06) * f * f);
          let nx = -k * gx;
          let ny = -k * gy;
          let nz = 1;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l;
          ny /= l;
          nz /= l;
          // 折射：往法线反方向（液滴中心）取样，透镜效果就是放大
          const x = i * CELL;
          const y = j * CELL;
          const sx = x - nx * REFR * (0.35 + h);
          const sy = y - ny * REFR * (0.35 + h);
          background(sx, sy, rgb);
          const si = Math.min(PW - 1, Math.max(0, Math.round(sx / CELL)));
          const sj = Math.min(PH - 1, Math.max(0, Math.round(sy / CELL)));
          const sh = SA[sj * PW + si]!;
          // 按厚度吸收，再加上介质里散射出来的琥珀色
          // 光程：中间按厚度算；越靠边缘折射得越斜、光在里面走得越远，所以边缘反而更深（真实的玻璃滴就是这样）
          const edge = 1 - smooth(0, 0.62, h);
          const tau = 0.24 + 0.42 * h * tk + 1.9 * edge * edge * (0.5 + 0.5 * tk);
          // 透光侧（背光的一边）亮一点，像光在液滴里聚焦后透出来
          const glow = (Math.max(0, nx * FILL[0] + ny * FILL[1]) * (1 - edge) * 0.8 + 0.34 * h * h) * tk;
          // 菲涅尔：只在最外一圈反出一道亮边
          const fres = edge * edge * edge * edge * 0.55;
          // 高光：细丝只有一两格宽，法线在格子之间变化太快，高光会变成一串亮点，所以按粗细淡掉
          const thick = smooth(0.3, 0.8, tk);
          const s1 = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 70) * 1.7 * thick;
          const s2 = Math.pow(Math.max(0, nx * HALF2[0] + ny * HALF2[1] + nz * HALF2[2]), 22) * 0.32 * thick;
          for (let c = 0; c < 3; c++) {
            const T = Math.exp(-SIGMA[c]! * tau);
            const bg = mix(rgb[c]!, SHADOW_RGB[c]!, sh);
            let v = bg * T + SCATTER[c]! * (1 - T) * 0.2 + SCATTER[c]! * glow * 0.26;
            v = mix(v, c === 2 ? 226 : 252, fres);
            v += 255 * s1 + (c === 2 ? 190 : 255) * s2;
            bd[o + c] = v;
          }
          bd[o + 3] = 255;
        }
      }

      const path = contour();
      ctx.clearRect(0, 0, 640, 400);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      shadowImg.g.putImageData(shadowImg.img, 0, 0);
      bodyImg.g.putImageData(bodyImg.img, 0, 0);
      // 网格点在格子的角上：小图的像素中心要对准格点
      ctx.drawImage(shadowImg.c, -CELL / 2, -CELL / 2, PW * CELL, PH * CELL);
      ctx.save();
      ctx.clip(path, 'evenodd');
      ctx.drawImage(bodyImg.c, -CELL / 2, -CELL / 2, PW * CELL, PH * CELL);
      ctx.restore();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(112,52,4,0.4)';
      ctx.stroke(path);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 7.3 });
  },
};
