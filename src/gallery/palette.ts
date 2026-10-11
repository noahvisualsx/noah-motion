// 取色板：一张黄昏沙丘（或传入的图片），放大镜取色器在画面上扫过、一处处落下；
// 每落一次，一粒颜色从取色点沿弧线飞出，落进右边的色板、展开成色条，色值一位位滚出来。
// 五色取齐后按明暗重新排序，再用这五种颜色把画面重新“印”一遍（套色），显示各色占比；
// 最后色条缩回颜色粒、飞回各自的取色点，画面复原，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { easeInOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, seeded, TAU, type SceneDef } from './util.ts';

const D = 12.5;
// 画面卡片
const IX = 36;
const IY = 40;
const IW = 340;
const IH = 320;
const IR = 18;
// 色板
const PX = 408;
const PW = 196;
const SY = 82;
const SH = 50;
const SG = 7;
const N = 5;
// 取色用的小图：一个像素对应舞台上 CELL px，四周留 PAD 圈空白，放大镜到边上也不会取出界
const CELL = 4;
const SW = IW / CELL;
const SHh = IH / CELL;
const PAD = 8;
const LR = 38; // 放大镜半径
const ZOOM = 8; // 放大镜里一个像素格的大小

const PICK = [1.8, 2.75, 3.7, 4.65, 5.6];
const SORT = 6.95;
const WIPE = 7.7;
const UNWIPE = 10.0;
const RET = 10.45;
const BG = '#f1eee8';
const INK = '#1b1a19';
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif';
const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';
const HEX = '0123456789ABCDEF';

type RGB = [number, number, number];
type Pick = { x: number; y: number; c: RGB; hex: string; share: number };

const toHex = (c: RGB) => c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
/** 加权的 RGB 距离，比直接欧氏距离更接近人眼感受 */
const dist = (a: RGB, b: RGB) => Math.sqrt(2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2);
const luma = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}

/** 程序化生成的黄昏沙丘：天空渐变、落日、四层沙丘按坡向分出受光面和背光面 */
function dunes(grain = true) {
  const [c, g] = canvas(IW * 2, IH * 2);
  g.scale(2, 2);
  const sky = g.createLinearGradient(0, 0, 0, 230);
  sky.addColorStop(0, '#22346a');
  sky.addColorStop(0.36, '#6f568c');
  sky.addColorStop(0.62, '#df8a88');
  sky.addColorStop(0.82, '#f7b07c');
  sky.addColorStop(1, '#ffd8a2');
  g.fillStyle = sky;
  g.fillRect(0, 0, IW, IH);
  const rnd = seeded(12);
  for (let i = 0; i < 46; i++) {
    const y = rnd() * 110;
    g.fillStyle = `rgba(255,255,255,${(1 - y / 110) * (0.3 + rnd() * 0.5)})`;
    g.beginPath();
    g.arc(rnd() * IW, y, 0.4 + rnd() * 0.7, 0, TAU);
    g.fill();
  }
  const glow = g.createRadialGradient(112, 182, 0, 112, 182, 150);
  glow.addColorStop(0, 'rgba(255,224,170,.85)');
  glow.addColorStop(0.25, 'rgba(255,200,150,.35)');
  glow.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, IW, IH);
  g.fillStyle = '#fff4dc';
  g.beginPath();
  g.arc(112, 182, 19, 0, TAU);
  g.fill();
  // 四排沙丘由远到近：每座沙丘左边是平缓的迎光坡，右边是陡的背光坡，背光坡上一块楔形阴影
  const rows = [
    { y: 206, h: [16, 28], n: 4, lit: ['#f1b394', '#d98e86'], shade: '#a5708d' },
    { y: 236, h: [22, 38], n: 3, lit: ['#f7b26d', '#e1895c'], shade: '#a3555f' },
    { y: 274, h: [28, 50], n: 3, lit: ['#ee8b47', '#cd6236'], shade: '#7a3242' },
    { y: 316, h: [26, 44], n: 2, lit: ['#cd6433', '#a7472a'], shade: '#4b1e2c' },
  ];
  for (const row of rows) {
    const span = (IW + 80) / row.n;
    // 从右往左画：左边沙丘的背光坡压在右边沙丘的坡脚上
    for (let k = row.n - 1; k >= 0; k--) {
      const w = span * (1.25 + rnd() * 0.35);
      const lx = -40 + k * span + (rnd() - 0.5) * span * 0.3 - w * 0.12;
      const rx = lx + w;
      const px = lx + w * (0.58 + rnd() * 0.12);
      const h = row.h[0]! + rnd() * (row.h[1]! - row.h[0]!);
      const py = row.y - h;
      const by = row.y + 4;
      const fill = g.createLinearGradient(0, py, 0, by + 50);
      fill.addColorStop(0, row.lit[0]!);
      fill.addColorStop(1, row.lit[1]!);
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(lx, IH);
      g.lineTo(lx, by);
      g.bezierCurveTo(lx + (px - lx) * 0.45, by - 2, px - (px - lx) * 0.25, py, px, py);
      g.bezierCurveTo(px + (rx - px) * 0.18, py + 2, rx - (rx - px) * 0.35, by, rx, by);
      g.lineTo(rx, IH);
      g.closePath();
      g.fill();
      // 背光坡整面在阴影里：从沙脊往下一条略弯的分界线，下半段被反光提亮一点
      const shade = g.createLinearGradient(0, py, 0, by + 30);
      shade.addColorStop(0, row.shade);
      shade.addColorStop(1, row.shade + 'cc');
      g.fillStyle = shade;
      g.beginPath();
      g.moveTo(px, py);
      g.bezierCurveTo(px + (rx - px) * 0.18, py + 2, rx - (rx - px) * 0.35, by, rx, by);
      g.lineTo(rx, IH);
      g.lineTo(px + (rx - px) * 0.16, IH);
      g.bezierCurveTo(px + (rx - px) * 0.12, by, px + (rx - px) * 0.02, py + h * 0.5, px, py);
      g.fill();
      // 迎光坡的轮廓上一道细细的逆光
      const rim = g.createLinearGradient(lx, 0, px, 0);
      rim.addColorStop(0, 'rgba(255,236,205,0)');
      rim.addColorStop(1, 'rgba(255,240,215,.75)');
      g.strokeStyle = rim;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(lx, by);
      g.bezierCurveTo(lx + (px - lx) * 0.45, by - 2, px - (px - lx) * 0.25, py, px, py);
      g.stroke();
    }
  }
  for (let i = 0; grain && i < 9000; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(40,10,20,.07)';
    g.fillRect(rnd() * IW, rnd() * IH, 0.7, 0.7);
  }
  return c;
}

/** 读出取色用的小图，挑出五种彼此差别最大的颜色，再按“从入口出发、就近走”的顺序排好 */
function analyze(photo: HTMLCanvasElement, clean = photo) {
  const [small, sg] = canvas(SW + PAD * 2, SHh + PAD * 2);
  sg.fillStyle = BG;
  sg.fillRect(0, 0, small.width, small.height);
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(photo, PAD, PAD, SW, SHh);
  let data: Uint8ClampedArray;
  try {
    data = sg.getImageData(0, 0, small.width, small.height).data;
  } catch {
    return null; // 跨域图片读不了像素
  }
  const px = (x: number, y: number): RGB => {
    const i = ((y + PAD) * small.width + (x + PAD)) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
  };
  // 全图像素做 k-means 聚成五类，得到画面的主色。初始中心按明暗的分位数取，面积大的颜色更容易被选中
  const all: RGB[] = [];
  for (let y = 0; y < SHh; y++) for (let x = 0; x < SW; x++) all.push(px(x, y));
  const byLuma = [...all].sort((a, b) => luma(a) - luma(b));
  let centers: RGB[] = Array.from({ length: N }, (_, j) => byLuma[Math.floor(((j + 0.5) / N) * byLuma.length)]!);
  const nearest = (c: RGB) => {
    let bj = 0;
    let bd = Infinity;
    centers.forEach((m, j) => {
      const d = dist(c, m);
      if (d < bd) {
        bd = d;
        bj = j;
      }
    });
    return bj;
  };
  for (let it = 0; it < 12; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const c of all) {
      const s = sum[nearest(c)]!;
      s[0]! += c[0];
      s[1]! += c[1];
      s[2]! += c[2];
      s[3]!++;
    }
    centers = sum.map((s, j) => (s[3] ? ([0, 1, 2].map((k) => Math.round(s[k]! / s[3]!)) as RGB) : centers[j]!));
  }
  // 每个主色在画面里（留出边距）找一个最接近的像素当取色点，并且别和已选的点挤在一起
  const cand: { x: number; y: number; c: RGB }[] = [];
  for (let y = 6; y < SHh - 6; y++) for (let x = 6; x < SW - 6; x++) cand.push({ x, y, c: px(x, y) });
  const chosen: typeof cand = [];
  for (const m of centers) {
    let best = cand[0]!;
    let bestS = Infinity;
    for (const k of cand) {
      const dp = Math.min(99, ...chosen.map((s) => Math.hypot(s.x - k.x, s.y - k.y)));
      const score = dist(m, k.c) + Math.max(0, 16 - dp) * 12;
      if (score < bestS) {
        bestS = score;
        best = k;
      }
    }
    chosen.push(best);
  }
  // 路线：从右下角入口开始，每次走向最近的下一个点
  const order: typeof chosen = [];
  let at = { x: SW * 0.8, y: SHh * 0.75 };
  const left = [...chosen];
  while (left.length) {
    left.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
    at = left.shift()!;
    order.push(at as (typeof chosen)[number]);
  }
  const picks: Pick[] = order.map((k) => ({ x: IX + (k.x + 0.5) * CELL, y: IY + (k.y + 0.5) * CELL, c: k.c, hex: toHex(k.c), share: 0 }));

  // 套色版：每个像素换成五色里最近的那个，顺便数出每种颜色的占比
  // 用不带颗粒的版本来分色：分色边界是干净的曲线而不是杂点
  const [poster, pg] = canvas(IW * 2, IH * 2);
  pg.imageSmoothingQuality = 'high';
  pg.drawImage(clean, 0, 0, IW * 2, IH * 2);
  const img = pg.getImageData(0, 0, IW * 2, IH * 2);
  const d = img.data;
  const counts = new Array<number>(N).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const c: RGB = [d[i]!, d[i + 1]!, d[i + 2]!];
    let bi = 0;
    let bd = Infinity;
    picks.forEach((p, j) => {
      const dd = dist(c, p.c);
      if (dd < bd) {
        bd = dd;
        bi = j;
      }
    });
    const p = picks[bi]!.c;
    d[i] = p[0];
    d[i + 1] = p[1];
    d[i + 2] = p[2];
    counts[bi]!++;
  }
  pg.putImageData(img, 0, 0);
  picks.forEach((p, j) => (p.share = Math.round((counts[j]! / (IW * IH * 4)) * 100)));
  return { small, data, smallW: small.width, picks, poster };
}

export const palette: SceneDef = {
  title: '取色板',
  category: '图形',
  description: '放大镜取色器在画面上扫过、一处处落下，颜色粒沿弧线飞进色板展开成色条，色值逐位滚出；取齐后按明暗排序，再用这五色把画面套色一遍。',
  tags: ['track', 'spring', 'stagger', 'canvas'],
  tone: 'light',
  en: {
    title: 'Color picker',
    description: 'A loupe sweeps the picture and drops on five spots; each color flies out along an arc, spreads into a swatch and rolls out its hex code. The swatches sort by lightness, then reprint the image in just those five colors.',
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-palette');
    stage.style.background = BG;
    const { ctx } = createCanvas(stage);
    const title = options.text ?? (en ? 'Palette' : '取色板');
    const subtitle = en ? 'Picked from the image' : '从画面中取出的颜色';

    // ---------- 轨道 ----------
    const glide = spring({ duration: 0.7, bounce: 0.06 });
    const fly = spring({ duration: 0.55, bounce: 0 });
    const spread = spring({ duration: 0.55, bounce: 0.28 });
    const roll = spring({ duration: 0.65, bounce: 0.18 });
    const fade = spring({ duration: 0.35, bounce: 0 });
    const reorder = spring({ duration: 0.6, bounce: 0.22 });

    // 图片和由它算出来的一切（取色点、排序、放大镜路线），图片换了就整体重算
    type Prepared = NonNullable<ReturnType<typeof analyze>> & {
      photo: HTMLCanvasElement;
      rank: number[];
      slot: ReturnType<typeof track>[];
      lx: ReturnType<typeof track>;
      ly: ReturnType<typeof track>;
    };
    let P: Prepared | null = null;
    let fallback: ReturnType<typeof analyze> = null; // 传入的图片读不了像素时，借用默认图的颜色
    const use = (photo: HTMLCanvasElement, clean = photo) => {
      const A = analyze(photo, clean) ?? (fallback ??= analyze(dunes(), dunes(false)));
      if (!A) return;
      const picks = A.picks;
      // 排序：按明暗从深到浅
      const rank = picks.map((p) => picks.filter((q) => luma(q.c) < luma(p.c)).length);
      const slot = picks.map((_, i) => track(i, [[SORT + rank[i]! * 0.06, rank[i]!]], reorder));
      // 放大镜：先在画面上扫一圈，再依次停到每个取色点，最后从右边离开
      const keys = (k: 'x' | 'y', way: [number, number][]) => [
        ...way.map(([at, v]) => [at, v] as const),
        ...picks.map((p, i) => [PICK[i]! - 0.55, p[k]] as const),
      ];
      const lx = track(IX + IW - 20, keys('x', [[0.25, IX + 270], [0.7, IX + 120], [1.1, IX + 175], [6.1, IX + IW + 30]]), glide);
      const ly = track(IY + IH - 30, keys('y', [[0.25, IY + 235], [0.7, IY + 215], [1.1, IY + 95], [6.1, IY + 150]]), glide);
      P = { ...A, photo, rank, slot, lx, ly };
    };
    if (options.image) {
      const load = (cors: boolean) => {
        const img = new Image();
        if (cors) img.crossOrigin = 'anonymous';
        img.onload = () => {
          const [c, g] = canvas(IW * 2, IH * 2);
          const k = Math.max((IW * 2) / img.naturalWidth, (IH * 2) / img.naturalHeight);
          g.drawImage(img, (IW * 2 - img.naturalWidth * k) / 2, (IH * 2 - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
          use(c);
          tl.seek(tl.time); // 暂停时也立刻用新图重画一帧
        };
        if (cors) img.onerror = () => load(false);
        img.src = options.image!;
      };
      load(true);
    } else use(dunes(), dunes(false));
    const loupeO = track(0, [[0.3, 1, spring({ duration: 0.5, bounce: 0.3 })], [6.25, 0, fade]]);
    // 每粒颜色：飞出（k1）、展开（k2）、排序后的位置（slot）；收尾时倒着走一遍
    const chips = PICK.map((T, i) => {
      const back = RET + (N - 1 - i) * 0.12;
      return {
        k1: track(0, [[T + 0.04, 1, fly], [back + 0.28, 0, fly]]),
        k2: track(0, [[T + 0.4, 1, spread], [back, 0, spring({ duration: 0.35, bounce: 0 })]]),
        hexAt: T + 0.62,
        back,
      };
    });
    const wipe = (t: number) => (t < UNWIPE ? easeInOut(clamp((t - WIPE) / 1.05)) : 1 - easeInOut(clamp((t - UNWIPE) / 0.8)));

    // 卡片阴影只画一次，之后每帧直接贴
    const [shadow, sh] = canvas((IW + 120) * 2, (IH + 120) * 2);
    sh.scale(2, 2);
    sh.shadowColor = 'rgba(70,45,25,.28)';
    sh.shadowBlur = 34;
    sh.shadowOffsetY = 16;
    sh.fillStyle = BG;
    rrect(sh, 60, 60, IW, IH, IR);
    sh.fill();

    function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    /** 小图上 (x, y) 处的颜色（x、y 是舞台坐标） */
    const sample = (x: number, y: number): RGB => {
      if (!P) return [128, 128, 128];
      const cx = clamp(Math.floor((x - IX) / CELL), -PAD, SW + PAD - 1) + PAD;
      const cy = clamp(Math.floor((y - IY) / CELL), -PAD, SHh + PAD - 1) + PAD;
      const i = (cy * P.smallW + cx) * 4;
      return [P.data[i] ?? 0, P.data[i + 1] ?? 0, P.data[i + 2] ?? 0];
    };

    /** 色值逐位滚动：每一位是一条竖着的字符带，弹簧把它滚到目标字符上 */
    const rollText = (s: string, x: number, y: number, t0: number, t: number, seed: number, cw: number) => {
      const rnd = seeded(seed);
      [...s].forEach((ch, j) => {
        const strip = [0, 0, 0, 0, 0].map(() => HEX[Math.floor(rnd() * 16)]!);
        strip.push(ch, HEX[Math.floor(rnd() * 16)]!);
        const p = roll(t - t0 - j * 0.055) * 5;
        const cx = x + j * cw;
        for (let k = Math.max(0, Math.floor(p) - 1); k <= Math.min(strip.length - 1, Math.floor(p) + 1); k++) {
          const dy = (k - p) * 17;
          if (Math.abs(dy) > 17) continue;
          ctx.globalAlpha = 1 - Math.abs(dy) / 17;
          ctx.fillText(strip[k]!, cx, y + dy);
        }
      });
      ctx.globalAlpha = 1;
    };

    const render = (t: number) => {
      ctx.clearRect(0, 0, 640, 400);
      // ---- 画面 ----
      ctx.drawImage(shadow, IX - 60, IY - 60, IW + 120, IH + 120);
      ctx.save();
      rrect(ctx, IX, IY, IW, IH, IR);
      ctx.clip();
      if (P) ctx.drawImage(P.photo, IX, IY, IW, IH);
      else {
        ctx.fillStyle = '#e4e0d8';
        ctx.fillRect(IX, IY, IW, IH);
      }
      // 套色：从左往右刷过去，刷子边缘有一道亮线
      const wp = wipe(t);
      if (P && wp > 0) {
        const wx = IX + IW * wp;
        ctx.save();
        ctx.beginPath();
        ctx.rect(IX, IY, wx - IX, IH);
        ctx.clip();
        ctx.drawImage(P.poster, IX, IY, IW, IH);
        ctx.restore();
        if (wp < 1) {
          const lg = ctx.createLinearGradient(wx - 18, 0, wx + 2, 0);
          lg.addColorStop(0, 'rgba(255,255,255,0)');
          lg.addColorStop(1, 'rgba(255,255,255,.75)');
          ctx.fillStyle = lg;
          ctx.fillRect(wx - 18, IY, 20, IH);
        }
      }
      ctx.restore();

      // ---- 色板标题 ----
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK;
      ctx.font = `700 16px ${SANS}`;
      ctx.fillText(title, PX, IY + 15);
      ctx.fillStyle = '#8f8a83';
      ctx.font = `400 11px ${SANS}`;
      ctx.fillText(subtitle, PX, IY + 33);
      let landed = 0;
      chips.forEach((c) => (landed += c.k2(t) > 0.5 ? 1 : 0));
      ctx.font = `500 11px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${landed}/${N}`, PX + PW, IY + 15);
      ctx.textAlign = 'left';

      // 空槽位：虚线框
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(60,45,30,.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        rrect(ctx, PX + 0.5, SY + i * (SH + SG) + 0.5, PW - 1, SH - 1, 12);
        ctx.stroke();
      }
      ctx.restore();
      if (!P) return;
      const { picks, rank, slot } = P;
      const slotOf = (i: number) => slot[i]!(t);

      // ---- 色条（先画移动中的，让它们浮在上面） ----
      const order = picks.map((_, i) => i).sort((a, b) => Math.abs(slot[a]!.velocity(t)) - Math.abs(slot[b]!.velocity(t)));
      for (const i of order) {
        const p = picks[i]!;
        const c = chips[i]!;
        const k1 = c.k1(t);
        const k2 = c.k2(t);
        if (k1 <= 0.001 && k2 <= 0.001) continue;
        const sy = SY + slotOf(i) * (SH + SG);
        // 飞行：从取色点沿一条向上拱的弧线飞到槽位左侧
        const ex = PX + 25;
        const ey = sy + SH / 2;
        const qx = (p.x + ex) / 2;
        const qy = Math.min(p.y, ey) - 46;
        const at = (k: number) => {
          const u = clamp(k);
          return [mix(mix(p.x, qx, u), mix(qx, ex, u), u), mix(mix(p.y, qy, u), mix(qy, ey, u), u)] as const;
        };
        const fill = `rgb(${p.c.join(',')})`;
        // 尾迹：同一条轨道往前取几个时刻
        if (k2 < 0.05) {
          for (let g = 3; g >= 1; g--) {
            const [gx, gy] = at(c.k1(t - g * 0.035));
            ctx.globalAlpha = 0.18 * (4 - g) * clamp(k1 * 4);
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(gx, gy, 8 - g * 1.5, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        const [cx, cy] = at(k1);
        const r = 9 * clamp(k1 * 5);
        const x = mix(cx - r, PX, k2);
        const y = mix(cy - r, sy, k2);
        const w = mix(r * 2, PW, k2);
        const h = mix(r * 2, SH, k2);
        const moving = clamp(Math.abs(slot[i]!.velocity(t)) / 9);
        ctx.save();
        ctx.shadowColor = 'rgba(60,40,20,.18)';
        ctx.shadowBlur = 8 + moving * 30;
        ctx.shadowOffsetY = 3 + moving * 10;
        ctx.fillStyle = fill;
        rrect(ctx, x, y, w, h, mix(r, 12, k2));
        ctx.fill();
        ctx.restore();
        // 色条上的文字：色值滚动出现，RGB 和占比随后淡入
        const ta = clamp((k2 - 0.75) / 0.25);
        if (ta > 0) {
          const ink = luma(p.c) > 0.55 ? '27,26,25' : '255,255,255';
          ctx.save();
          rrect(ctx, x, y, w, h, 12);
          ctx.clip();
          ctx.fillStyle = `rgba(${ink},${0.95 * ta})`;
          ctx.font = `600 15px ${MONO}`;
          const cw = ctx.measureText('0').width;
          ctx.fillText('#', x + 14, y + 24);
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 14 + cw, y + 9, cw * 6 + 2, 19);
          ctx.clip();
          rollText(p.hex, x + 14 + cw, y + 24, c.hexAt, t, 100 + i * 17, cw);
          ctx.restore();
          ctx.font = `500 9.5px ${MONO}`;
          ctx.fillStyle = `rgba(${ink},${0.62 * ta * clamp((t - c.hexAt - 0.35) / 0.4)})`;
          ctx.fillText(`RGB ${p.c.join(' ')}`, x + 14, y + 39);
          // 占比：套色开始后从 0 数上去
          const sp = clamp((t - WIPE - 0.25 - rank[i]! * 0.08) / 0.8);
          if (sp > 0) {
            ctx.textAlign = 'right';
            ctx.font = `600 13px ${MONO}`;
            ctx.fillStyle = `rgba(${ink},${0.9 * ta * clamp(sp * 3)})`;
            ctx.fillText(`${Math.round(p.share * easeInOut(sp))}%`, x + w - 14, y + 31);
            ctx.textAlign = 'left';
          }
          ctx.restore();
        }
      }

      // ---- 取色点的波纹：落下时向外扩，颜色飞回时向内收 ----
      picks.forEach((p, i) => {
        const a = (t - PICK[i]!) / 0.6;
        const b = (t - chips[i]!.back - 0.55) / 0.6;
        for (const [k, out] of [
          [a, true],
          [b, false],
        ] as const) {
          if (k < 0 || k > 1) continue;
          ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.9})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, out ? 6 + k * 26 : 30 - k * 24, 0, TAU);
          ctx.stroke();
        }
      });

      // ---- 放大镜 ----
      const lo = clamp(loupeO(t));
      if (lo > 0.001) {
        const lx = P.lx(t);
        const ly = P.ly(t);
        let press = 1;
        for (const T of PICK) if (t >= T && t < T + 0.28) press = Math.min(press, 1 - 0.12 * Math.sin(((t - T) / 0.28) * Math.PI));
        const s = (0.6 + 0.4 * loupeO(t)) * press;
        const col = sample(lx, ly);
        ctx.save();
        ctx.globalAlpha = lo;
        ctx.translate(lx, ly);
        ctx.scale(s, s);
        ctx.shadowColor = 'rgba(0,0,0,.3)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, LR + 4, 0, TAU);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        // 放大的像素格：整格对齐，移动时一格一格跳，像真的取色器
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, LR, 0, TAU);
        ctx.clip();
        const ci = Math.floor((lx - IX) / CELL);
        const cj = Math.floor((ly - IY) / CELL);
        const R = 6;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(P.small, ci - R + PAD, cj - R + PAD, R * 2 + 1, R * 2 + 1, -(R + 0.5) * ZOOM, -(R + 0.5) * ZOOM, (R * 2 + 1) * ZOOM, (R * 2 + 1) * ZOOM);
        ctx.imageSmoothingEnabled = true;
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let k = -R; k <= R + 1; k++) {
          ctx.moveTo((k - 0.5) * ZOOM, -LR);
          ctx.lineTo((k - 0.5) * ZOOM, LR);
          ctx.moveTo(-LR, (k - 0.5) * ZOOM);
          ctx.lineTo(LR, (k - 0.5) * ZOOM);
        }
        ctx.stroke();
        ctx.restore();
        // 中心格
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(-ZOOM / 2, -ZOOM / 2, ZOOM, ZOOM);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.strokeRect(-ZOOM / 2 - 1.4, -ZOOM / 2 - 1.4, ZOOM + 2.8, ZOOM + 2.8);
        // 外圈：白边里套一圈当前颜色
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgb(${col.join(',')})`;
        ctx.beginPath();
        ctx.arc(0, 0, LR + 0.5, 0, TAU);
        ctx.stroke();
        // 下方的色值小标签
        const label = `#${toHex(col)}`;
        ctx.font = `600 10px ${MONO}`;
        const tw = ctx.measureText(label).width + 26;
        ctx.fillStyle = 'rgba(24,22,20,.86)';
        rrect(ctx, -tw / 2, LR + 10, tw, 20, 10);
        ctx.fill();
        ctx.fillStyle = `rgb(${col.join(',')})`;
        ctx.beginPath();
        ctx.arc(-tw / 2 + 11, LR + 20, 4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, -tw / 2 + 19, LR + 23.5);
        ctx.restore();
      }
    };

    const tl = timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 9.2 });
    return tl;
  },
};
