// 水墨晕染：宣纸上，墨滴一颗颗落下，在纸上晕开——中心浓、往外淡，边缘是顺着纸纤维渗出去的毛边。
// 接着晕开的墨往回收，顺着字形“流”进笔画，写出一行书法标题：墨从落点沿笔画走，越远越淡，末梢带飞白。
// 字形用系统字体，书写感全靠两样东西：按“沿笔画的距离”逐步显现的遮罩，和事先算好的墨色质感。
// 最后落款、盖一方小印；收尾时一张新宣纸从右边盖过来，回到空白，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { easeIn, easeInOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, seeded, smooth, TAU, W, H, type SceneDef } from './util.ts';

const D = 8.6;
const SPEED = 62; // 墨顺着笔画流动的速度（px/s），字长时会自动加快
const ARRIVE_BY = 5.1; // 字最晚在这之前写完
const FALL = 0.34; // 墨滴下落用时
const SHEET = 7.55; // 新宣纸开始盖过来
const ZH_FONT = '"Xingkai SC", "STXingkai", "Kaiti SC", "STKaiti", "KaiTi", "LXGW WenKai", "BiauKai", "Songti SC", "STSong", "Noto Serif SC", serif';
const EN_FONT = '"Snell Roundhand", "Apple Chancery", "Palatino", "Palatino Linotype", "Book Antiqua", Georgia, serif';
const SEAL_FONT = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
const INK = [28, 26, 24] as const;

/** 平滑的值噪声：格点上的随机数（来自 seeded）做双三次插值 */
function noise(seed: number) {
  const rnd = seeded(seed);
  const T = Float32Array.from({ length: 256 * 256 }, rnd);
  const at = (x: number, y: number) => T[((y & 255) << 8) | (x & 255)]!;
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!] as const;
}

/** 宣纸：米白底、大片的云状深浅、交错的纤维、细小的杂质、帘纹，再加一层像素级的纸面颗粒 */
function drawPaper(c: CanvasRenderingContext2D, k: number) {
  const rnd = seeded(2026);
  c.fillStyle = '#f3ecdd';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 50 + rnd() * 150;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const tone = rnd() < 0.55 ? '214,198,168' : '255,251,242';
    g.addColorStop(0, `rgba(${tone},${0.05 + rnd() * 0.06})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 帘纹：竖向的链线和极淡的横向细纹
  c.fillStyle = 'rgba(160,140,105,.035)';
  for (let x = 14; x < W; x += 27) c.fillRect(x, 0, 1.2, H);
  c.fillStyle = 'rgba(160,140,105,.018)';
  for (let y = 0; y < H; y += 2.4) c.fillRect(0, y, W, 0.5);
  // 纤维：长短不一、方向随意的细丝，有的偏深有的偏亮
  c.lineCap = 'round';
  for (let i = 0; i < 1100; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = rnd() * TAU;
    const long = rnd() < 0.12;
    const len = long ? 30 + rnd() * 50 : 4 + rnd() * 18;
    const bend = (rnd() - 0.5) * len * 0.5;
    const dark = rnd() < 0.6;
    c.strokeStyle = dark ? `rgba(150,128,92,${long ? 0.04 : 0.05 + rnd() * 0.08})` : `rgba(255,253,247,${0.16 + rnd() * 0.26})`;
    c.lineWidth = 0.25 + rnd() * (long ? 0.4 : 0.6);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  for (let i = 0; i < 300; i++) {
    const big = rnd() < 0.08;
    c.fillStyle = `rgba(${big ? '90,70,45' : '130,110,80'},${big ? 0.3 : 0.08 + rnd() * 0.18})`;
    c.beginPath();
    c.arc(rnd() * W, rnd() * H, big ? 0.5 + rnd() * 0.7 : 0.25 + rnd() * 0.5, 0, TAU);
    c.fill();
  }
  // 四周略暗，左上方受光
  const light = c.createRadialGradient(W * 0.38, H * 0.3, 40, W * 0.5, H * 0.5, 470);
  light.addColorStop(0, 'rgba(255,253,246,.35)');
  light.addColorStop(0.6, 'rgba(255,253,246,0)');
  light.addColorStop(1, 'rgba(120,96,60,.16)');
  c.fillStyle = light;
  c.fillRect(0, 0, W, H);
  // 纸面颗粒：一小块随机灰度平铺上去
  const [tile, tc] = canvas(256, 256);
  const grain = tc.createImageData(256, 256);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 70;
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = v;
    grain.data[i + 3] = 255;
  }
  tc.putImageData(grain, 0, 0);
  c.save();
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = 0.16;
  c.scale(1 / k, 1 / k);
  c.fillStyle = c.createPattern(tile, 'repeat')!;
  c.fillRect(0, 0, W * k, H * k);
  c.restore();
}

/** 一圈带噪声的轮廓，相邻点之间用二次曲线连起来 */
function blob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, prof: Float32Array) {
  const n = prof.length;
  const px = (i: number) => x + Math.cos((i / n) * TAU) * rx * prof[i % n]!;
  const py = (i: number) => y + Math.sin((i / n) * TAU) * ry * prof[i % n]!;
  c.moveTo((px(n - 1) + px(0)) / 2, (py(n - 1) + py(0)) / 2);
  for (let i = 0; i < n; i++) c.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
  c.closePath();
}

/** 晕染轮廓的半径系数：几段低频起伏 + 逐点抖动，偶尔有顺着纤维渗出去的“指头” */
function profile(rnd: () => number, n: number, low: number, jitter: number, fingers: number) {
  const waves = [2, 3, 5, 7].map((f) => [f, rnd() * TAU, low * (0.4 + rnd() * 0.6) * (3 / (f + 1))] as const);
  const raw = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    let v = 1 + (rnd() - 0.5) * jitter;
    for (const [f, ph, amp] of waves) v += amp * Math.sin(f * a + ph);
    if (rnd() < fingers) v += 0.05 + rnd() * 0.12;
    return v;
  });
  return Float32Array.from(raw, (v, i) => (v * 2 + raw[(i + 1) % n]! + raw[(i + n - 1) % n]!) / 4);
}

/** 最小堆，给多源 Dijkstra 用 */
function heap() {
  const keys: number[] = [];
  const vals: number[] = [];
  return {
    get size() {
      return keys.length;
    },
    push(k: number, v: number) {
      let i = keys.length;
      keys.push(k);
      vals.push(v);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p]! <= k) break;
        keys[i] = keys[p]!;
        vals[i] = vals[p]!;
        i = p;
      }
      keys[i] = k;
      vals[i] = v;
    },
    pop() {
      const v = vals[0]!;
      const k = keys.pop()!;
      const last = vals.pop()!;
      if (keys.length) {
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          if (l >= keys.length) break;
          const r = l + 1;
          const m = r < keys.length && keys[r]! < keys[l]! ? r : l;
          if (keys[m]! >= k) break;
          keys[i] = keys[m]!;
          vals[i] = vals[m]!;
          i = m;
        }
        keys[i] = k;
        vals[i] = last;
      }
      return v;
    },
  };
}

export const ink: SceneDef = {
  title: '水墨晕染',
  category: '文字',
  description: '墨滴落在宣纸上晕开，浓淡分明、毛边顺着纸纤维渗出；晕开的墨再收拢进笔画，沿字形流成一行书法标题，最后盖上一方小印。',
  tags: ['canvas', '距离场', 'track', 'spring'],
  tone: 'light',
  en: {
    title: 'Ink bloom',
    description: 'Ink drops fall on rice paper and bloom, dark at the heart and feathered along the fibres at the edge. Then the ink gathers back into the strokes and flows into a line of calligraphy, finished with a small red seal.',
    tags: ['canvas', 'distance field', 'track', 'spring'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-ink');
    injectCSS(
      'nm-ink',
      `.nm-ink{background:#f3ecdd}
.nm-ink canvas{position:absolute;left:0;top:0;width:640px;height:400px}
.nm-ink .scene{position:absolute;inset:0;transform-origin:52% 46%}
.nm-ink .ink{mix-blend-mode:multiply}
.nm-ink .sheet{position:absolute;inset:0;box-shadow:-14px 0 26px rgba(90,70,40,.16),-2px 0 3px rgba(90,70,40,.12)}
.nm-ink .sheet::after{content:"";position:absolute;left:0;top:0;bottom:0;width:18px;background:linear-gradient(90deg,rgba(255,255,255,.55),rgba(255,255,255,0))}`,
    );
    const K = 2;
    const scene = el('div', 'scene', stage);
    const [paper, pc] = canvas(W * K, H * K);
    pc.scale(K, K);
    drawPaper(pc, K);
    scene.append(paper);
    const [inkC, ic] = canvas(W * K, H * K);
    inkC.className = 'ink';
    scene.append(inkC);
    // 收尾时盖过来的新宣纸：和底下那张一模一样，盖满时画面正好回到开头
    const sheet = el('div', 'sheet', stage);
    const [cover, cc] = canvas(W * K, H * K);
    cc.drawImage(paper, 0, 0);
    sheet.append(cover);

    // ---------- 排版：中文按字、英文按词，每个单元落一滴墨 ----------
    const raw = (options.text ?? (en ? 'Let it bloom' : '见字如面')).trim() || (en ? 'Let it bloom' : '见字如面');
    const latin = !/[㐀-鿿豈-﫿]/.test(raw);
    const [, mc] = canvas(4, 4);
    const fontAt = (size: number) => (latin ? `italic 600 ${size}px ${EN_FONT}` : `600 ${size}px ${ZH_FONT}`);
    type Run = { s: string; x: number; w: number };
    const layout = (size: number) => {
      mc.font = fontAt(size);
      const runs: Run[] = [];
      let x = 0;
      if (latin) {
        const space = mc.measureText(' ').width;
        raw.split(/\s+/).forEach((word, i) => {
          if (i) x += space;
          const w = mc.measureText(word).width;
          runs.push({ s: word, x, w });
          x += w;
        });
      } else {
        const gap = size * 0.1;
        [...raw.replace(/\s+/g, '')].forEach((ch, i) => {
          if (i) x += gap;
          const w = mc.measureText(ch).width;
          runs.push({ s: ch, x, w });
          x += w;
        });
      }
      return { runs, width: x };
    };
    const maxSize = latin ? 104 : 112;
    let size = maxSize;
    let lay = layout(size);
    const maxW = latin ? 500 : 480;
    if (lay.width > maxW) {
      size = Math.max(28, (maxSize * maxW) / lay.width);
      lay = layout(size);
    }
    const CY = 178;
    const baseline = CY + size * (latin ? 0.28 : 0.36);
    const x0 = (W - lay.width) / 2;
    mc.font = fontAt(size);
    const m = mc.measureText(raw);
    const ascent = Math.max(m.actualBoundingBoxAscent || size * 0.8, size * 0.6);
    const descent = Math.max(m.actualBoundingBoxDescent || size * 0.2, size * 0.1);
    const PAD = 30;
    const RX = Math.floor(x0 - PAD - (latin ? size * 0.3 : 0));
    const RY = Math.floor(baseline - ascent - PAD);
    const RW = Math.ceil((lay.width + 2 * PAD + (latin ? size * 0.6 : 0)) / 8) * 8;
    const RH = Math.ceil((ascent + descent + 2 * PAD) / 8) * 8;
    // 距离场一格 2px：够细，又让挂载时的计算量少四倍
    const F = 2;
    const FW = RW / F;
    const FH = RH / F;
    const N = FW * FH;
    const drawText = (c: CanvasRenderingContext2D, k: number) => {
      c.save();
      c.scale(k, k);
      c.translate(-RX, -RY);
      c.font = fontAt(size);
      c.fillStyle = '#000';
      for (const r of lay.runs) c.fillText(r.s, x0 + r.x, baseline);
      c.restore();
    };
    // 低分辨率的字形覆盖率，用来算“墨沿笔画走到每一格的时间”
    const [, g1] = canvas(FW, FH);
    drawText(g1, 1 / F);
    const covData = g1.getImageData(0, 0, FW, FH).data;
    const cov = Float32Array.from({ length: N }, (_, i) => covData[i * 4 + 3]! / 255);

    // 单元多于 6 个时相邻的合并，墨滴最多 6 颗
    const groups: Run[][] = [];
    const per = Math.ceil(lay.runs.length / 6);
    lay.runs.forEach((r, i) => (i % per ? groups[groups.length - 1]!.push(r) : groups.push([r])));
    const rnd = seeded(7);
    const drops = groups.map((g, i) => {
      const gx0 = x0 + g[0]!.x;
      const gx1 = x0 + g[g.length - 1]!.x + g[g.length - 1]!.w;
      // 落点：这一组笔画的重心，再挪到最近的笔画上（单位：格）
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let y = 0; y < FH; y++) {
        for (let x = Math.max(0, Math.floor((gx0 - RX) / F)); x < Math.min(FW, Math.ceil((gx1 - RX) / F)); x++) {
          const a = cov[y * FW + x]!;
          sx += x * a;
          sy += y * a;
          sw += a;
        }
      }
      let cx = sw ? sx / sw : ((gx0 + gx1) / 2 - RX) / F;
      let cy = sw ? sy / sw : (baseline - size * 0.36 - RY) / F;
      let best = Infinity;
      for (let i = 0; i < N; i++) {
        if (cov[i]! < 0.6) continue;
        const d = ((i % FW) - cx) ** 2 + (Math.floor(i / FW) - cy) ** 2;
        if (d < best) {
          best = d;
          sx = i % FW;
          sy = Math.floor(i / FW);
        }
      }
      if (best < Infinity) {
        cx = sx;
        cy = sy;
      }
      const at = 0.5 + i * (groups.length > 4 ? 0.4 : 0.55);
      const ry = size * (0.52 + rnd() * 0.14);
      const rx = Math.max(ry, (gx1 - gx0) * 0.55);
      return {
        x: (cx + 0.5) * F + RX,
        y: (cy + 0.5) * F + RY,
        rx,
        ry,
        // 墨晕的中心不完全在落点上，大小、方向也各不一样，免得排成一排一模一样的圆
        ox: (rnd() - 0.5) * size * 0.14,
        oy: (rnd() - 0.5) * size * 0.1,
        tilt: (rnd() - 0.5) * 0.8,
        at,
        start: at + 0.85, // 开始收拢、流进笔画
        // 六层半透明的墨晕，越往外越大、越淡、边缘越不规则
        washes: [0.2, 0.16, 0.14, 0.12, 0.1, 0.085].map((a, j) => ({ a, r: 0.34 + j * 0.15, prof: profile(rnd, 72, 0.05 + j * 0.02, 0.04 + j * 0.015, 0.03 + j * 0.05) })),
        // 浓墨的芯：几团错开的深色叠在一起
        cores: Array.from({ length: 3 }, () => ({ dx: (rnd() - 0.5) * 0.22, dy: (rnd() - 0.5) * 0.22, r: 0.26 + rnd() * 0.12, prof: profile(rnd, 40, 0.12, 0.08, 0) })),
        // 墨里的颗粒
        specks: Array.from({ length: 22 }, () => ({ a: rnd() * TAU, d: Math.sqrt(rnd()) * 0.75, r: 0.35 + rnd() * 0.9, o: 0.1 + rnd() * 0.25 })),
        // 边缘顺着纸纤维渗出去的细丝
        fibers: Array.from({ length: 160 }, () => ({ a: rnd() * TAU, len: 2 + rnd() * rnd() * 13, bend: (rnd() - 0.5) * 4 })),
        // 溅出去的小墨点
        sats: Array.from({ length: 3 + Math.floor(rnd() * 4) }, () => ({ a: rnd() * TAU, d: 0.55 + rnd() * 0.75, r: 0.6 + rnd() * 1.4, e: 1 + rnd() * 1.2 })),
      };
    });

    // ---------- 墨沿笔画走到每一格的时间：多源 Dijkstra ----------
    // 笔画里走得快（代价 10），墨晕里能慢慢渗过去（30），干纸上几乎不走（160）；距离按 px × 10 计
    const cost = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = ((i % FW) + 0.5) * F + RX;
      const y = (Math.floor(i / FW) + 0.5) * F + RY;
      const inWash = drops.some((d) => ((x - d.x) / d.rx) ** 2 + ((y - d.y) / d.ry) ** 2 < 0.9);
      cost[i] = cov[i]! > 0.4 ? 10 : inWash ? 30 : 160;
    }
    const t0 = drops[0]!.start;
    const dist = new Float32Array(N).fill(Infinity);
    const offset = new Float32Array(N);
    const q = heap();
    drops.forEach((d) => {
      const off = (d.start - t0) * SPEED * 10;
      const fx = Math.floor((d.x - RX) / F);
      const fy = Math.floor((d.y - RY) / F);
      for (let y = -3; y <= 3; y++) {
        for (let x = -3; x <= 3; x++) {
          const gx = fx + x;
          const gy = fy + y;
          if (gx < 0 || gy < 0 || gx >= FW || gy >= FH || x * x + y * y > 9) continue;
          const i = gy * FW + gx;
          const v = off + Math.hypot(x, y) * F * cost[i]!;
          if (v < dist[i]!) {
            dist[i] = v;
            offset[i] = off;
            q.push(v, i);
          }
        }
      }
    });
    const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]] as const;
    const done = new Uint8Array(N);
    while (q.size) {
      const i = q.pop();
      if (done[i]) continue;
      done[i] = 1;
      const x = i % FW;
      const y = (i - x) / FW;
      for (const [dx, dy, len] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
        const j = ny * FW + nx;
        if (done[j]) continue;
        const v = dist[i]! + ((cost[i]! + cost[j]!) / 2) * len * F;
        if (v < dist[j]!) {
          dist[j] = v;
          offset[j] = offset[i]!;
          q.push(v, j);
        }
      }
    }
    // 每格：到达时间（加一点纤维状的抖动，墨的前沿就不是一条光滑的线）、走过的路程、干湿、笔画方向、墨色
    const nFront = noise(31);
    const nTone = noise(11);
    const arrive = new Float32Array(N);
    const travel = new Float32Array(N);
    for (let i = 0; i < N; i++) travel[i] = Number.isFinite(dist[i]!) ? (dist[i]! - offset[i]!) / 10 : 0;
    const dry = new Float32Array(N);
    const dirX = new Float32Array(N);
    const dirY = new Float32Array(N);
    const shade = new Float32Array(N);
    let arriveMax = 0;
    const cells: number[] = [];
    const tr = (x: number, y: number) => travel[clamp(y, 0, FH - 1) * FW + clamp(x, 0, FW - 1)]!;
    const cv = (x: number, y: number) => (x < 0 || y < 0 || x >= FW || y >= FH ? 0 : cov[y * FW + x]!);
    for (let i = 0; i < N; i++) {
      const x = i % FW;
      const y = (i - x) / FW;
      const X = x * F;
      const Y = y * F;
      // 先只存前沿的抖动，到达时间等定下流速以后再算
      arrive[i] = (nFront(X * 0.22, Y * 0.22) - 0.5) * 0.14 + (nFront(X * 0.7 + 50, Y * 0.7) - 0.5) * 0.05;
      // 越远越干：颜色变淡，出现顺着笔画方向的飞白
      dry[i] = smooth(25, 120, travel[i]!);
      const gx = tr(x + 1, y) - tr(x - 1, y);
      const gy = tr(x, y + 1) - tr(x, y - 1);
      const gl = Math.hypot(gx, gy) || 1;
      dirX[i] = gx / gl;
      dirY[i] = gy / gl;
      // 离笔画边缘越近，墨积得越深（湿墨干了以后的边线）
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += cv(x + dx, y + dy);
      const edge = clamp(1 - sum / 9) * (1 - dry[i]!);
      shade[i] = clamp(mix(INK[0], 86, dry[i]! * 0.55) + (nTone(X * 0.08, Y * 0.08) - 0.5) * 16 - edge * 14, 8, 120);
      // 只处理有字的格子（向外多扩一格，免得高分辨率的边缘被裁掉）
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = cv(x + dx, y + dy) > 0;
      if (near && Number.isFinite(dist[i]!)) cells.push(i);
    }
    // 流速随字数、笔画长短自适应：绝大多数笔画在 ARRIVE_BY 之前写完，给落款、盖印和停留留出时间；
    // 个别离落点很远的笔画（比如孤立的标点）再平滑地压进截止时间，不会拖慢整行
    const from = (i: number) => t0 + offset[i]! / (SPEED * 10); // 这一格的墨来自哪一滴、那滴何时开始流
    const need = cells.map((i) => travel[i]! / (SPEED * Math.max(0.4, ARRIVE_BY - 0.25 - from(i)))).sort((a, b) => a - b);
    const speedUp = Math.max(1, need[Math.floor(need.length * 0.92)] ?? 1);
    const knee = ARRIVE_BY - 0.6;
    for (const i of cells) {
      const a = from(i) + travel[i]! / (SPEED * speedUp) + arrive[i]!;
      arrive[i] = a < knee ? a : knee + 0.6 * (1 - Math.exp(-(a - knee) / 0.6));
      arriveMax = Math.max(arriveMax, arrive[i]!);
    }

    // ---------- 字的墨色质感（2 倍分辨率，挂载时算一次） ----------
    const [glyph, g2] = canvas(RW * K, RH * K);
    drawText(g2, K);
    const img = g2.getImageData(0, 0, RW * K, RH * K);
    const px = img.data;
    const nEdge = noise(53);
    const nBristle = noise(97);
    const S = K * F;
    for (let y = 0; y < RH * K; y++) {
      for (let x = 0; x < RW * K; x++) {
        const p = (y * RW * K + x) * 4;
        const a = px[p + 3]! / 255;
        if (a === 0) continue;
        const ci = Math.floor(y / S) * FW + Math.floor(x / S);
        const d = dry[ci]!;
        // 飞白：垂直于笔画方向取一维噪声，得到顺着笔画的一道道细丝
        const across = (x * -dirY[ci]! + y * dirX[ci]!) / K;
        const streak = smooth(0.54, 0.8, nBristle(across * 1.3, 0.5 + travel[ci]! * 0.02)) * d;
        const rough = nEdge(x * 0.55, y * 0.55) - 0.5 + (nEdge(x * 0.18 + 40, y * 0.18) - 0.5) * 0.6;
        const alpha = smooth(0.25, 0.75, a + rough * (0.35 + d * 0.3)) * (1 - 0.9 * streak) * (0.9 + 0.1 * (1 - d));
        const sh = shade[ci]!;
        px[p] = sh;
        px[p + 1] = sh * 0.94;
        px[p + 2] = sh * 0.88;
        px[p + 3] = alpha * 255;
      }
    }
    g2.putImageData(img, 0, 0);

    // 每帧用的遮罩：一格一个像素，RGB 是墨色，只改 alpha
    const [maskC, mk] = canvas(FW, FH);
    const mask = mk.createImageData(FW, FH);
    for (const i of cells) {
      mask.data[i * 4] = INK[0];
      mask.data[i * 4 + 1] = INK[1];
      mask.data[i * 4 + 2] = INK[2];
    }
    const [half, hc] = canvas(FW / 2, FH / 2);
    const [tmp, tc] = canvas(RW * K, RH * K);
    let maskFull = false;

    // ---------- 落款和印章 ----------
    const SW = 30;
    const SH = 50;
    const [sealC, sc] = canvas(SW * K, SH * K);
    sc.scale(K, K);
    sc.fillStyle = '#b8322b';
    sc.beginPath();
    sc.roundRect(0.5, 0.5, SW - 1, SH - 1, 2.5);
    sc.fill();
    sc.globalCompositeOperation = 'destination-out';
    sc.fillStyle = '#000';
    sc.font = `900 19px ${SEAL_FONT}`;
    sc.textAlign = 'center';
    sc.textBaseline = 'middle';
    sc.fillText('墨', SW / 2, 14);
    sc.fillText('戏', SW / 2, 36);
    // 印泥不匀：边缘的缺口、面上的小白点
    const srnd = seeded(5);
    for (let i = 0; i < 160; i++) {
      const edgeBite = i < 50;
      const t = srnd();
      const side = Math.floor(srnd() * 4);
      const ex = edgeBite ? (side === 0 ? 0.5 : side === 1 ? SW - 0.5 : t * SW) : srnd() * SW;
      const ey = edgeBite ? (side < 2 ? t * SH : side === 2 ? 0.5 : SH - 0.5) : srnd() * SH;
      sc.globalAlpha = edgeBite ? 0.9 : 0.15 + srnd() * 0.5;
      sc.beginPath();
      sc.arc(ex, ey, edgeBite ? 0.5 + srnd() * 1.1 : 0.2 + srnd() * 0.6, 0, TAU);
      sc.fill();
    }
    const right = x0 + lay.width;
    const bottom = baseline + descent;
    const signText = en ? 'autumn, 2026' : '丙午秋';
    const signSize = en ? 13 : 14;
    const [signC, sg] = canvas(160 * K, 60 * K);
    sg.scale(K, K);
    sg.fillStyle = 'rgb(58,54,50)';
    if (en) {
      sg.font = `italic 500 ${signSize}px ${EN_FONT}`;
      sg.textAlign = 'right';
      sg.fillText(signText, 158, 20);
    } else {
      sg.font = `600 ${signSize}px ${ZH_FONT}`;
      sg.textAlign = 'center';
      [...signText].forEach((ch, i) => sg.fillText(ch, 80, 15 + i * 17));
    }
    // 中文竖排落款在标题右下，印章在落款下面；英文落款横排，印章在右边
    const sign = en ? { x: right - 160 - 38, y: bottom + 16 } : { x: right - 10 - 80, y: bottom + 12 };
    const seal = en ? { x: right - SW, y: bottom + 8 } : { x: right - 10 - SW / 2, y: bottom + 12 + 58 };
    const signLines = en ? 1 : [...signText].length;
    const signAt = Math.max(arriveMax, drops[drops.length - 1]!.start + 1) + 0.15;
    const sealAt = signAt + 0.75;
    const press = track(0, [[sealAt, 1, spring({ duration: 0.35, bounce: 0.35 })]]);
    const inkIn = track(0, [[sealAt, 1, spring({ duration: 0.6 })]]);

    // ---------- 每帧 ----------
    const wetAt = (t: number) => mix(0.2, 0.07, smooth(arriveMax - 0.4, arriveMax + 2.2, t));

    const drawDrop = (c: CanvasRenderingContext2D, d: (typeof drops)[number], t: number) => {
      const fall = (t - (d.at - FALL)) / FALL;
      if (fall < 0) return;
      // 下落：从镜头前落向纸面，越来越小、越来越实；纸上的影子慢慢收拢到落点
      if (fall < 1) {
        const e = easeIn(fall);
        const s = mix(2.6, 1, e);
        c.fillStyle = `rgba(60,58,56,${0.18 * e})`;
        c.beginPath();
        c.ellipse(d.x + 10 * (1 - e), d.y + 6 * (1 - e), 5 * s * 0.9, 4 * s * 0.9, 0, 0, TAU);
        c.fill();
        const x = d.x - 16 * (1 - e);
        const y = d.y - 34 * (1 - e);
        const g = c.createRadialGradient(x - 1.2 * s, y - 1.5 * s, 0, x, y, 4.6 * s);
        g.addColorStop(0, `rgba(120,118,116,${0.5 + 0.5 * e})`);
        g.addColorStop(0.35, `rgba(20,19,18,${0.55 + 0.45 * e})`);
        g.addColorStop(1, `rgba(20,19,18,${0.4 + 0.6 * e})`);
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(x, y, 4.2 * s, 4.6 * s, -0.4, 0, TAU);
        c.fill();
        return;
      }
      const tau = t - d.at;
      // 收拢：墨流进笔画以后，里面几层往回缩、浓墨的芯变小，外圈只是变淡
      const gather = smooth(d.start, d.start + 1.3, t);
      const creep = 1 + 0.03 * Math.max(0, tau - 1.5); // 墨干之前还会一点点往外渗
      const n = d.washes.length;
      c.save();
      c.translate(d.x + d.ox, d.y + d.oy);
      c.rotate(d.tilt);
      c.scale(d.rx / d.ry, 1); // 宽的单元（英文单词）晕成椭圆
      const R = d.ry;
      d.washes.forEach((w, j) => {
        const grow = 1 - Math.exp(-tau / (0.25 + j * 0.09));
        const pull = 1 - gather * Math.max(0, 0.5 - j * 0.09);
        const r = R * w.r * (0.12 + 0.88 * grow) * creep * pull;
        // 每层中间略浓、边缘略淡，叠起来不会出现一圈圈生硬的台阶
        const a = w.a * (1 - gather * (0.72 - j * 0.06));
        const g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.12);
        g.addColorStop(0, `rgba(44,46,50,${a})`);
        g.addColorStop(0.75, `rgba(44,46,50,${a * 0.8})`);
        g.addColorStop(1, `rgba(44,46,50,${a * 0.4})`);
        c.fillStyle = g;
        c.beginPath();
        blob(c, 0, 0, r, r, w.prof);
        c.fill();
        // 最外两层留下略深的水痕
        if (j >= n - 2) {
          c.strokeStyle = `rgba(48,50,56,${0.07 * (1 - gather * 0.4)})`;
          c.lineWidth = 0.8;
          c.stroke();
        }
      });
      // 毛边：从最外层边缘顺着纤维渗出去
      const outer = d.washes[n - 1]!;
      const ro = outer.r * (0.12 + 0.88 * (1 - Math.exp(-tau / (0.25 + (n - 1) * 0.09)))) * creep;
      c.beginPath();
      for (const f of d.fibers) {
        const k = outer.prof[Math.floor((f.a / TAU) * 72) % 72]! * ro * 0.96;
        const ca = Math.cos(f.a);
        const sa = Math.sin(f.a);
        const len = f.len * Math.min(1, tau / 0.8) * creep;
        const bx = ca * R * k;
        const by = sa * R * k;
        c.moveTo(bx, by);
        c.quadraticCurveTo(bx + (ca * len) / 2 - sa * f.bend, by + (sa * len) / 2 + ca * f.bend, bx + ca * len, by + sa * len);
      }
      c.strokeStyle = `rgba(52,56,62,${0.11 * (1 - gather * 0.4)})`;
      c.lineWidth = 0.45;
      c.lineCap = 'round';
      c.stroke();
      // 颗粒和浓墨的芯
      const spread = 1 - Math.exp(-tau / 0.4);
      for (const p of d.specks) {
        c.fillStyle = `rgba(20,20,20,${p.o * (1 - gather * 0.6)})`;
        c.beginPath();
        c.arc(Math.cos(p.a) * R * p.d * spread * creep, Math.sin(p.a) * R * p.d * spread * creep, p.r, 0, TAU);
        c.fill();
      }
      const rc = (0.35 + 0.65 * (1 - Math.exp(-tau / 0.2))) * (1 - 0.82 * gather);
      for (const k of d.cores) {
        const r = R * k.r * rc;
        if (r < 0.5) continue;
        const kx = R * k.dx * rc;
        const ky = R * k.dy * rc;
        const g = c.createRadialGradient(kx, ky, 0, kx, ky, r * 1.15);
        g.addColorStop(0, `rgba(16,15,14,${0.62 * (1 - gather * 0.5)})`);
        g.addColorStop(0.6, `rgba(18,17,16,${0.45 * (1 - gather * 0.5)})`);
        g.addColorStop(1, 'rgba(18,17,16,0)');
        c.fillStyle = g;
        c.beginPath();
        blob(c, kx, ky, r * 1.15, r * 1.15, k.prof);
        c.fill();
      }
      c.restore();
      // 落下瞬间溅起的一圈和飞出去的小墨点
      if (tau < 0.22) {
        const k = tau / 0.22;
        c.strokeStyle = `rgba(30,30,30,${0.3 * (1 - k)})`;
        c.lineWidth = 1.4 * (1 - k) + 0.3;
        c.beginPath();
        c.ellipse(d.x, d.y, 5 + 20 * Math.sqrt(k), 4 + 16 * Math.sqrt(k), d.tilt, 0, TAU);
        c.stroke();
      }
      for (const s of d.sats) {
        const at = s.d * 0.08;
        if (tau < at) continue;
        // 小墨点顺着飞出去的方向拉长一点，四周也洇开一圈
        const r = s.r * (1 + 0.7 * (1 - Math.exp(-(tau - at) / 0.4))) * 2.4;
        c.save();
        c.translate(d.x + Math.cos(s.a) * d.rx * s.d * 1.1, d.y + Math.sin(s.a) * d.ry * s.d * 1.1);
        c.rotate(s.a);
        c.scale(s.e, 1);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, 'rgba(22,21,20,.85)');
        g.addColorStop(0.32, 'rgba(26,26,26,.6)');
        g.addColorStop(0.45, 'rgba(66,70,76,.14)');
        g.addColorStop(1, 'rgba(66,70,76,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, r, 0, TAU);
        c.fill();
        c.restore();
      }
    };

    const render = (t: number) => {
      ic.setTransform(K, 0, 0, K, 0, 0);
      ic.clearRect(0, 0, W, H);
      ic.globalAlpha = 1;
      for (const d of drops) drawDrop(ic, d, t);

      // 字：按“墨走到这一格的时间”显现
      if (t > t0 - 0.2) {
        const full = t > arriveMax + 0.2;
        // 全部显现以后遮罩不再变化，不用每帧重算
        if (!(full && maskFull)) {
          for (const i of cells) mask.data[i * 4 + 3] = full ? 255 : clamp((t - arrive[i]!) / 0.2) * 255;
          mk.putImageData(mask, 0, 0);
          hc.clearRect(0, 0, half.width, half.height);
          hc.drawImage(maskC, 0, 0, half.width, half.height);
          tc.globalCompositeOperation = 'copy';
          tc.drawImage(glyph, 0, 0);
          tc.globalCompositeOperation = 'destination-in';
          tc.drawImage(maskC, 0, 0, RW * K, RH * K);
          maskFull = full;
        }
        // 湿的时候笔画四周洇开一圈：遮罩缩小再放大，就是一层很柔的晕
        const wet = wetAt(t);
        ic.globalAlpha = wet;
        ic.drawImage(half, RX - 2, RY - 1, RW + 4, RH + 3);
        ic.globalAlpha = 1;
        ic.drawImage(tmp, RX, RY, RW, RH);
      }

      // 落款：一个字一个字从上往下写出来
      if (t > signAt) {
        const lineH = en ? 30 : 17;
        for (let i = 0; i < signLines; i++) {
          const p = clamp((t - signAt - i * 0.14) / 0.22);
          if (p <= 0) continue;
          ic.save();
          ic.beginPath();
          if (en) ic.rect(sign.x, sign.y, 160 * easeInOut(p), 60);
          else ic.rect(sign.x, sign.y + i * lineH, 160, lineH * easeInOut(p));
          ic.clip();
          ic.globalAlpha = 0.5 + 0.5 * p;
          ic.drawImage(signC, sign.x, sign.y, 160, 60);
          ic.restore();
        }
      }
      // 印章：按下去时先放大一点再落定，印泥由浅到实
      const pr = press(t);
      if (pr > 0.001) {
        const s = 1 + 0.16 * (1 - pr);
        ic.save();
        ic.translate(seal.x + SW / 2, seal.y + SH / 2);
        ic.scale(s, s);
        ic.rotate(-0.02);
        ic.globalAlpha = clamp(pr * 1.5) * mix(0.55, 0.92, clamp(inkIn(t)));
        ic.drawImage(sealC, -SW / 2, -SH / 2, SW, SH);
        ic.restore();
      }

      // 整幅纸很慢地推近一点；最后一张新宣纸从右边盖过来
      scene.style.transform = `scale(${1 + 0.02 * smooth(0, SHEET + 0.9, t)})`;
      const sp = easeInOut(clamp((t - SHEET) / 0.95));
      sheet.style.transform = `translateX(${(1 - sp) * (W + 40)}px)`;
      sheet.style.visibility = sp > 0 ? 'visible' : 'hidden';
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: sealAt + 1.2 });
  },
};
