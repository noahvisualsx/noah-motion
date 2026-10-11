// 相机对焦：手机相机的取景界面。窗边桌上摆着花瓶、咖啡杯和一本书，取景器刚打开时整片失焦，
// 自动对焦先被明亮的窗外抢走（来回“找焦”）；点两下 1× 换到 28、35 mm，再点一下花瓶：对焦框落下、
// 缩小、变黄，焦点从窗外拉到花瓶，背景散成光斑，ISO 和快门跟着测光变化。按下快门一闪，照片缩进左下角的相册缩略图。
// 画面是三层：静态的背景、静态的前景（各自按离焦量加 CSS 模糊）、每帧重画的光斑 / 浮尘 / 热气。
import { spring } from '../spring.ts';
import { track, clamp, mix, mixColor } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, seeded, smooth, TAU, W, H, type SceneDef } from './util.ts';

const D = 7.6;
const B = 48; // 静态画布四周的出血：模糊和手抖时边缘不露底
const OX = 392; // 变焦中心，也是主体所在的位置
const OY = 185;
const A = 5.2; // 离焦一个“深度单位”时的模糊半径（px）
const CAP = 4.42; // 快门时刻
const FLY = 4.48; // 照片开始缩进缩略图
const THUMB = { x: 36, y: 344, s: 40 };
const VIEW = { top: 32, bottom: 306 }; // 顶栏和底栏之间的取景区
const PILL = { x: 303, y: 284 }; // 1× 变焦按钮
const CROP = { l: 170, r: 70 }; // 缩略图是方的：从照片里裁出主体附近的一块
const TABLE = 204; // 桌子后沿
const VASE = { x: 376, y: 218 };
const CUP = { x: 458, y: 246 };
// 杯子下面垫着的书：后左、后右、前右、前左
type P2 = [number, number];
const BOOK: [P2, P2, P2, P2] = [[412, 235], [502, 231], [510, 253], [416, 258]];
const ISO = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400];
const SHUTTER = [60, 80, 100, 125, 160, 200, 250, 320, 400, 500];
// 对焦距离（屈光度，1/米）：主体 0.62 m，背景墙 2.4 m
const DIOPTER_NEAR = 1 / 0.62;
const DIOPTER_FAR = 1 / 2.4;

/** 取最接近的档位（按对数距离） */
const nearest = (list: number[], v: number) => list.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a));

/** 画一个边缘柔和的形状：形状本身画在画布外，只留下它的模糊投影（shadowBlur 各浏览器都支持） */
function soft(c: CanvasRenderingContext2D, k: number, blur: number, color: string, shape: (c: CanvasRenderingContext2D) => void) {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur * k;
  c.shadowOffsetX = 4000 * k;
  c.translate(-4000, 0);
  c.beginPath();
  shape(c);
  c.fillStyle = '#000';
  c.fill();
  c.restore();
}

/** 静态画布：比舞台大一圈出血，绘图坐标仍是舞台坐标 */
function layer(k: number, parent?: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((W + 2 * B) * k);
  canvas.height = Math.round((H + 2 * B) * k);
  Object.assign(canvas.style, { left: `${-B}px`, top: `${-B}px`, width: `${W + 2 * B}px`, height: `${H + 2 * B}px`, transformOrigin: `${OX + B}px ${OY + B}px` });
  parent?.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(k, 0, 0, k, B * k, B * k);
  return { canvas, ctx, k };
}

// ---------- 背景：墙、窗、窗外、窗帘、桌面 ----------

// 窗外两棵树的叶团 [x, y, 半径]
const CLUSTERS: [number, number, number][] = [
  [60, 92, 48], [112, 126, 40], [44, 156, 44], [134, 170, 34], [92, 42, 38], [150, 76, 30],
  [244, 138, 34], [286, 114, 36], [268, 172, 30], [214, 176, 26], [26, -14, 44], [96, -26, 34], [148, 2, 26],
];

function drawRoom(c: CanvasRenderingContext2D, k: number) {
  const rnd = seeded(11);
  const wall = c.createLinearGradient(-B, 0, W + B, 0);
  wall.addColorStop(0, '#d8cab5');
  wall.addColorStop(0.45, '#c8b8a0');
  wall.addColorStop(1, '#85735e');
  c.fillStyle = wall;
  c.fillRect(-B, -B, W + 2 * B, H + 2 * B);
  const bounce = c.createRadialGradient(170, 110, 30, 170, 110, 440);
  bounce.addColorStop(0, 'rgba(255,240,218,.45)');
  bounce.addColorStop(1, 'rgba(255,240,218,0)');
  c.fillStyle = bounce;
  c.fillRect(-B, -B, W + 2 * B, H + 2 * B);

  // 窗外：天空、远处的楼、两棵树
  const x0 = 34;
  const x1 = 296;
  const y0 = -118;
  const y1 = 178;
  c.save();
  c.beginPath();
  c.rect(x0, y0, x1 - x0, y1 - y0);
  c.clip();
  const sky = c.createLinearGradient(0, y0, 0, y1);
  sky.addColorStop(0, '#9fc3df');
  sky.addColorStop(0.5, '#d6e4ea');
  sky.addColorStop(1, '#f6e7cf');
  c.fillStyle = sky;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // 楼：受光的立面和一格格窗
  c.fillStyle = '#e8d8c1';
  c.fillRect(178, 6, 140, 180);
  c.fillStyle = '#d9c6ad';
  c.fillRect(178, 6, 140, 6);
  for (let wy = 22; wy < 178; wy += 21) {
    for (let wx = 188; wx < 300; wx += 17) {
      c.fillStyle = rnd() < 0.3 ? '#f7efe2' : '#b8a993';
      c.fillRect(wx, wy, 8, 12);
    }
  }
  // 树：每一团叶子先画暗部、再画亮部，亮部偏向左上（太阳在那边）
  const tones: [string, number, number, number, number][] = [
    ['#4f6a49', 0.18, 0.22, 1, 9],
    ['#738f5a', 0, 0, 0.86, 9],
    ['#9db574', -0.2, -0.26, 0.58, 7],
    ['#cad596', -0.3, -0.38, 0.3, 5],
  ];
  for (const [cx, cy, r] of CLUSTERS) {
    for (const [color, dx, dy, sc, n] of tones) {
      c.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU;
        const d = rnd() * r * sc * 0.55;
        c.beginPath();
        c.arc(cx + dx * r + Math.cos(a) * d, cy + dy * r + Math.sin(a) * d, r * sc * (0.3 + rnd() * 0.22), 0, TAU);
        c.fill();
      }
    }
    // 叶子的颗粒感
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU;
      const d = rnd() * r;
      c.fillStyle = rnd() < 0.5 ? 'rgba(40,60,36,.25)' : 'rgba(230,236,180,.3)';
      c.beginPath();
      c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rnd() * 1.6, 0, TAU);
      c.fill();
    }
  }
  // 空气透视和太阳的光晕
  const haze = c.createLinearGradient(0, 72, 0, y1);
  haze.addColorStop(0, 'rgba(255,246,230,0)');
  haze.addColorStop(1, 'rgba(255,246,230,.35)');
  c.fillStyle = haze;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  const sun = c.createRadialGradient(40, -48, 0, 40, -48, 260);
  sun.addColorStop(0, 'rgba(255,252,240,.95)');
  sun.addColorStop(0.35, 'rgba(255,246,222,.45)');
  sun.addColorStop(1, 'rgba(255,246,222,0)');
  c.fillStyle = sun;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  // 玻璃上的一道反光
  c.fillStyle = 'rgba(255,255,255,.07)';
  c.beginPath();
  c.moveTo(200, y0);
  c.lineTo(250, y0);
  c.lineTo(120, y1);
  c.lineTo(70, y1);
  c.fill();
  c.restore();

  // 窗框：外框 + 十字窗棂，内沿被窗外的光照亮
  const panes: [number, number, number, number][] = [
    [x0, y0, 160.5 - x0, 33.5 - y0],
    [169.5, y0, x1 - 169.5, 33.5 - y0],
    [x0, 42.5, 160.5 - x0, y1 - 42.5],
    [169.5, 42.5, x1 - 169.5, y1 - 42.5],
  ];
  c.beginPath();
  c.rect(x0 - 14, y0 - 14, x1 - x0 + 28, y1 - y0 + 16);
  for (const [px, py, pw, ph] of panes) c.rect(px, py, pw, ph);
  const frame = c.createLinearGradient(x0, 0, x1, 0);
  frame.addColorStop(0, '#ece4d7');
  frame.addColorStop(1, '#dcd1c1');
  c.fillStyle = frame;
  c.fill('evenodd');
  c.lineWidth = 1;
  for (const [px, py, pw, ph] of panes) {
    c.strokeStyle = 'rgba(255,252,244,.75)';
    c.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
    c.strokeStyle = 'rgba(90,70,50,.22)';
    c.strokeRect(px - 2, py - 2, pw + 4, ph + 4);
  }
  c.strokeStyle = 'rgba(80,62,44,.25)';
  c.strokeRect(x0 - 14.5, y0 - 14.5, x1 - x0 + 29, y1 - y0 + 17);
  // 窗台
  soft(c, k, 8, 'rgba(70,52,34,.35)', (c) => c.rect(22, 194, 290, 8));
  c.fillStyle = '#efe7da';
  c.fillRect(18, 176, 298, 9);
  c.fillStyle = '#d3c6b3';
  c.fillRect(18, 185, 298, 9);

  // 窗帘：半透明的亚麻，竖向的褶子，挡在窗户左边
  c.save();
  c.beginPath();
  c.moveTo(-B, -B);
  c.lineTo(66, -B);
  for (let y = -B; y <= TABLE; y += 8) c.lineTo(66 + 7 * Math.sin(y * 0.035) + 4 * Math.sin(y * 0.11), y);
  c.lineTo(-B, TABLE);
  c.closePath();
  c.clip();
  c.fillStyle = 'rgba(250,246,238,.62)';
  c.fillRect(-B, -B, 130, TABLE + B);
  for (let i = 0; i < 9; i++) {
    const fx = -B + i * 14 + rnd() * 6;
    const fold = c.createLinearGradient(fx, 0, fx + 16, 0);
    fold.addColorStop(0, 'rgba(255,255,255,0)');
    fold.addColorStop(0.5, i % 2 ? 'rgba(255,255,255,.4)' : 'rgba(150,130,105,.14)');
    fold.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = fold;
    c.fillRect(fx, -B, 16, TABLE + B);
  }
  c.restore();

  // 斜射进来的光束（很淡）
  c.save();
  c.globalCompositeOperation = 'screen';
  const beam = c.createLinearGradient(120, 0, 420, 300);
  beam.addColorStop(0, 'rgba(255,236,204,.16)');
  beam.addColorStop(1, 'rgba(255,236,204,0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(70, -B);
  c.lineTo(296, -B);
  c.lineTo(640, 302);
  c.lineTo(330, 302);
  c.fill();
  c.restore();
}

/** 物体影子的形状：沿光线方向把轮廓“压”到桌面上（光从左后方来，影子往右前方倒） */
function castShadow(c: CanvasRenderingContext2D, bx: number, by: number, profile: [number, number][], len: number) {
  const dx = 1;
  const dy = 0.3;
  const px = -0.3 * 0.5;
  const py = 1 * 0.5;
  const left = profile.map(([hw, h]) => [bx + dx * h * len - px * hw, by + dy * h * len - py * hw] as const);
  const right = profile.map(([hw, h]) => [bx + dx * h * len + px * hw, by + dy * h * len + py * hw] as const).reverse();
  [...left, ...right].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

const VASE_PROFILE: [number, number][] = [[20, 0], [33, 22], [34, 34], [28, 52], [14, 70], [8, 84], [7, 96], [10, 104]];
const CUP_PROFILE: [number, number][] = [[19, 0], [21, 16], [22, 30]];
// 桉树枝上的叶子（背景和前景都要用：叶子本身画在前景，叶影落在桌上）
const LEAVES = (() => {
  const rnd = seeded(5);
  const stems: [number, number, number, number, number, number, number, number, number][] = [
    // P0, P1, P2, P3, 叶子对数
    [377, 118, 372, 88, 352, 68, 330, 54, 5],
    [379, 118, 388, 92, 404, 76, 426, 68, 4],
    [376, 118, 368, 104, 356, 96, 344, 94, 2],
  ];
  const out: { x: number; y: number; rx: number; ry: number; rot: number; tone: number }[] = [];
  const bez = (a: number, b: number, c: number, d: number, u: number) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d;
  for (const s of stems) {
    const n = s[8];
    for (let i = 0; i < n; i++) {
      const u = 0.3 + (0.7 * i) / Math.max(1, n - 1);
      const x = bez(s[0], s[2], s[4], s[6], u);
      const y = bez(s[1], s[3], s[5], s[7], u);
      const tx = bez(s[0], s[2], s[4], s[6], u + 0.01) - x;
      const ty = bez(s[1], s[3], s[5], s[7], u + 0.01) - y;
      const a = Math.atan2(ty, tx);
      const size = 1 - u * 0.35;
      for (const side of [-1, 1]) {
        const r = (8.5 + rnd() * 2.5) * size;
        out.push({ x: x + Math.cos(a + (side * Math.PI) / 2) * r * 0.85, y: y + Math.sin(a + (side * Math.PI) / 2) * r * 0.85, rx: r, ry: r * (0.72 + rnd() * 0.2), rot: a + side * (0.9 + rnd() * 0.5), tone: rnd() });
      }
    }
  }
  return { stems, leaves: out };
})();

function drawTable(c: CanvasRenderingContext2D, k: number) {
  const rnd = seeded(23);
  c.save();
  c.beginPath();
  c.rect(-B, TABLE, W + 2 * B, H + B - TABLE);
  c.clip();
  const wood = c.createLinearGradient(0, TABLE, 0, H + B);
  wood.addColorStop(0, '#c09670');
  wood.addColorStop(0.3, '#a47a55');
  wood.addColorStop(1, '#674329');
  c.fillStyle = wood;
  c.fillRect(-B, TABLE, W + 2 * B, H + B);
  // 木纹和木板缝：都朝远处的灭点汇聚
  const vx = 360;
  const vy = -560;
  const toNear = (x: number) => vx + (x - vx) * ((H + B - vy) / (TABLE - vy));
  for (let i = 0; i < 150; i++) {
    const x = -260 + i * 7 + rnd() * 5;
    const seam = i % 13 === 0;
    c.strokeStyle = seam ? 'rgba(60,34,18,.4)' : `rgba(${rnd() < 0.2 ? '230,190,140' : '70,40,20'},${0.04 + rnd() * 0.1})`;
    c.lineWidth = seam ? 1.2 : 0.4 + rnd() * 0.9;
    c.beginPath();
    c.moveTo(x, TABLE);
    const nx = toNear(x);
    c.quadraticCurveTo((x + nx) / 2 + (rnd() - 0.5) * 14, (TABLE + H + B) / 2, nx, H + B);
    c.stroke();
  }
  // 窗户投在桌上的光斑：十字窗棂的影子，物体挡住的地方没有光
  const patch = document.createElement('canvas');
  patch.width = c.canvas.width;
  patch.height = c.canvas.height;
  const p = patch.getContext('2d')!;
  p.setTransform(k, 0, 0, k, B * k, B * k);
  soft(p, k, 7, 'rgba(255,214,158,.62)', (p) => {
    p.moveTo(96, TABLE);
    p.lineTo(372, TABLE);
    p.lineTo(690, H + B);
    p.lineTo(330, H + B);
    p.closePath();
  });
  p.globalCompositeOperation = 'destination-out';
  soft(p, k, 3, 'rgba(0,0,0,.85)', (p) => {
    p.moveTo(224, TABLE);
    p.lineTo(236, TABLE);
    p.lineTo(500, H + B);
    p.lineTo(484, H + B);
    p.closePath();
    p.moveTo(96, 268);
    p.lineTo(560, 268);
    p.lineTo(560, 277);
    p.lineTo(96, 277);
    p.closePath();
  });
  soft(p, k, 4, 'rgba(0,0,0,.92)', (p) => castShadow(p, VASE.x, VASE.y, VASE_PROFILE, 1.15));
  soft(p, k, 3, 'rgba(0,0,0,.92)', (p) => castShadow(p, CUP.x, CUP.y, CUP_PROFILE, 1.15));
  soft(p, k, 2, 'rgba(0,0,0,.8)', (p) => BOOK.forEach(([x, y], i) => (i ? p.lineTo(x + 9, y + 4) : p.moveTo(x + 9, y + 4))));
  // 叶子的影子：一串斑驳的小椭圆
  soft(p, k, 3, 'rgba(0,0,0,.55)', (p) => {
    for (const l of LEAVES.leaves) {
      const h = VASE.y - l.y;
      const sx = l.x + h * 1.15;
      const sy = VASE.y + 6 + h * 0.3 * 1.15;
      p.moveTo(sx + l.rx * 0.9, sy);
      p.ellipse(sx, sy, l.rx * 0.9, l.ry * 0.45, 0.2, 0, TAU);
    }
  });
  c.globalCompositeOperation = 'screen';
  c.drawImage(patch, -B, -B, W + 2 * B, H + 2 * B);
  c.globalCompositeOperation = 'source-over';
  // 桌子和墙的交界、物体底部的接触阴影
  const edge = c.createLinearGradient(0, TABLE, 0, TABLE + 7);
  edge.addColorStop(0, 'rgba(50,30,16,.5)');
  edge.addColorStop(1, 'rgba(50,30,16,0)');
  c.fillStyle = edge;
  c.fillRect(-B, TABLE, W + 2 * B, 7);
  soft(c, k, 5, 'rgba(40,24,12,.5)', (c) => c.ellipse(VASE.x + 3, VASE.y + 1, 25, 4.5, 0, 0, TAU));
  soft(c, k, 5, 'rgba(40,24,12,.45)', (c) => BOOK.forEach(([x, y], i) => (i ? c.lineTo(x + 3, y + 8) : c.moveTo(x + 3, y + 8))));
  c.restore();
}

// ---------- 前景：花瓶、桉树枝、书、咖啡杯 ----------

function drawStill(c: CanvasRenderingContext2D, k: number) {
  const rnd = seeded(41);
  const { x: vx, y: vy } = VASE;
  // 花瓶轮廓（左右对称）
  const vase = new Path2D();
  vase.moveTo(vx - 20, vy);
  vase.bezierCurveTo(vx - 27, vy - 3, vx - 36, vy - 17, vx - 35, vy - 32);
  vase.bezierCurveTo(vx - 34, vy - 48, vx - 24, vy - 60, vx - 14, vy - 68);
  vase.bezierCurveTo(vx - 9, vy - 72, vx - 7.5, vy - 76, vx - 7.5, vy - 84);
  vase.lineTo(vx - 7, vy - 96);
  vase.bezierCurveTo(vx - 7, vy - 100, vx - 10.5, vy - 101, vx - 10.5, vy - 104);
  vase.lineTo(vx + 10.5, vy - 104);
  vase.bezierCurveTo(vx + 10.5, vy - 101, vx + 7, vy - 100, vx + 7, vy - 96);
  vase.lineTo(vx + 7.5, vy - 84);
  vase.bezierCurveTo(vx + 7.5, vy - 76, vx + 9, vy - 72, vx + 14, vy - 68);
  vase.bezierCurveTo(vx + 24, vy - 60, vx + 34, vy - 48, vx + 35, vy - 32);
  vase.bezierCurveTo(vx + 36, vy - 17, vx + 27, vy - 3, vx + 20, vy);
  vase.quadraticCurveTo(vx, vy + 3.5, vx - 20, vy);
  const body = c.createLinearGradient(vx - 36, 0, vx + 36, 0);
  body.addColorStop(0, '#fbf6ec');
  body.addColorStop(0.1, '#ece3d3');
  body.addColorStop(0.4, '#dbd1c0');
  body.addColorStop(0.75, '#c3b7a4');
  body.addColorStop(1, '#a39580');
  c.fillStyle = body;
  c.fill(vase);
  c.save();
  c.clip(vase);
  // 底部反射的桌面暖光、上半部更白一点
  const warm = c.createLinearGradient(0, vy - 40, 0, vy);
  warm.addColorStop(0, 'rgba(214,170,120,0)');
  warm.addColorStop(1, 'rgba(214,170,120,.28)');
  c.fillStyle = warm;
  c.fillRect(vx - 40, vy - 110, 80, 115);
  // 左侧的轮廓光
  const rim = c.createLinearGradient(vx - 36, 0, vx - 18, 0);
  rim.addColorStop(0, 'rgba(255,253,246,.85)');
  rim.addColorStop(1, 'rgba(255,253,246,0)');
  c.strokeStyle = rim;
  c.lineWidth = 3.6;
  c.stroke(vase);
  // 柔和的高光
  soft(c, k, 6, 'rgba(255,255,255,.55)', (c) => c.ellipse(vx - 17, vy - 38, 4, 13, -0.15, 0, TAU));
  // 釉面上的铁斑
  for (let i = 0; i < 22; i++) {
    c.fillStyle = `rgba(120,92,66,${0.1 + rnd() * 0.16})`;
    c.beginPath();
    c.arc(vx - 32 + rnd() * 64, vy - 100 + rnd() * 98, 0.35 + rnd() * 0.55, 0, TAU);
    c.fill();
  }
  // 底足露胎
  c.fillStyle = 'rgba(160,122,88,.55)';
  c.fillRect(vx - 40, vy - 3.5, 80, 8);
  c.restore();
  // 瓶口
  c.fillStyle = '#5a4e42';
  c.beginPath();
  c.ellipse(vx, vy - 104, 8, 1.9, 0, 0, TAU);
  c.fill();

  // 枝条和叶子
  c.lineCap = 'round';
  for (const s of LEAVES.stems) {
    c.strokeStyle = '#7a6250';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(s[0], s[1]);
    c.bezierCurveTo(s[2], s[3], s[4], s[5], s[6], s[7]);
    c.stroke();
  }
  for (const l of LEAVES.leaves) {
    c.save();
    c.translate(l.x, l.y);
    c.rotate(l.rot);
    // 靠窗的一侧被透光照亮，偏暖偏亮
    const lit = clamp((360 - l.x) / 50) * 0.5 + l.tone * 0.5;
    const g = c.createLinearGradient(-l.rx, -l.ry, l.rx, l.ry);
    g.addColorStop(0, lit > 0.5 ? '#dfe2c0' : '#c3cfbf');
    g.addColorStop(1, lit > 0.5 ? '#93a88f' : '#6f8676');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, l.rx, l.ry, 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(52,70,56,.3)';
    c.lineWidth = 0.5;
    c.stroke();
    c.strokeStyle = 'rgba(240,244,228,.45)';
    c.beginPath();
    c.moveTo(-l.rx * 0.8, 0);
    c.quadraticCurveTo(0, -l.ry * 0.15, l.rx * 0.8, 0);
    c.stroke();
    c.restore();
  }
  // 瓶口前沿压住枝条
  c.strokeStyle = '#eee6d8';
  c.lineWidth = 1.6;
  c.beginPath();
  c.ellipse(vx, vy - 104, 9.6, 2.4, 0, 0.1, Math.PI - 0.1);
  c.stroke();

  // 书：平放在桌上，灰蓝色布面，前面露出书口，夹着一根丝带；咖啡杯压在书上
  const [b0, b1, b2, b3] = BOOK;
  const T = 8;
  const quad = (pts: readonly (readonly [number, number])[]) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  };
  c.fillStyle = '#56667a';
  quad([b0, b3, [b3[0], b3[1] + T], [b0[0], b0[1] + T]]);
  c.fill();
  c.fillStyle = '#ece4d3';
  quad([b3, b2, [b2[0], b2[1] + T], [b3[0], b3[1] + T]]);
  c.fill();
  c.strokeStyle = 'rgba(150,128,96,.45)';
  c.lineWidth = 0.4;
  for (let i = 1.5; i < T; i += 1.3) {
    c.beginPath();
    c.moveTo(b3[0] + 1, b3[1] + i);
    c.lineTo(b2[0] - 1, b2[1] + i);
    c.stroke();
  }
  const cover = c.createLinearGradient(b0[0], b0[1], b2[0], b2[1]);
  cover.addColorStop(0, '#a3b1bf');
  cover.addColorStop(1, '#6a7b8e');
  c.fillStyle = cover;
  quad(BOOK);
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(255,255,255,.07)';
  c.lineWidth = 0.5;
  for (let i = 0; i < 130; i += 2.2) {
    c.beginPath();
    c.moveTo(b0[0] - 20 + i, b0[1] - 10);
    c.lineTo(b0[0] - 34 + i, b3[1] + 10);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,.4)';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(b0[0], b0[1] + 0.5);
  c.lineTo(b1[0], b1[1] + 0.5);
  c.stroke();
  c.fillStyle = '#9c3a2a';
  c.beginPath();
  c.moveTo(b3[0] + 30, b3[1] - 0.6);
  c.quadraticCurveTo(b3[0] + 34, b3[1] + T + 6, b3[0] + 27, b3[1] + T + 14);
  c.lineTo(b3[0] + 30.5, b3[1] + T + 14.5);
  c.quadraticCurveTo(b3[0] + 37, b3[1] + T + 6, b3[0] + 33.5, b3[1] - 0.8);
  c.fill();
  soft(c, k, 4, 'rgba(40,24,12,.4)', (c) => c.ellipse(CUP.x + 2, CUP.y + 1, 21, 3.6, 0, 0, TAU));

  // 咖啡杯：赭红色釉，杯口一圈露出浅色胎，里面是映着窗光的咖啡
  const { x: cx, y: cy } = CUP;
  const top0 = cy - 30;
  // 把手
  c.strokeStyle = '#8b3f29';
  c.lineWidth = 4;
  c.beginPath();
  c.ellipse(cx + 22, cy - 15, 7, 8.5, 0, -1.3, 1.3);
  c.stroke();
  const cup = new Path2D();
  cup.moveTo(cx - 22, top0);
  cup.bezierCurveTo(cx - 22, cy - 12, cx - 21, cy - 4, cx - 19, cy - 1);
  cup.quadraticCurveTo(cx, cy + 4, cx + 19, cy - 1);
  cup.bezierCurveTo(cx + 21, cy - 4, cx + 22, cy - 12, cx + 22, top0);
  cup.ellipse(cx, top0, 22, 5.5, 0, 0, Math.PI);
  const glaze = c.createLinearGradient(cx - 22, 0, cx + 22, 0);
  glaze.addColorStop(0, '#e09670');
  glaze.addColorStop(0.25, '#c06844');
  glaze.addColorStop(0.7, '#9a4630');
  glaze.addColorStop(1, '#6e3020');
  c.fillStyle = glaze;
  c.fill(cup);
  c.save();
  c.clip(cup);
  soft(c, k, 4, 'rgba(255,236,220,.5)', (c) => c.ellipse(cx - 13, cy - 16, 2.5, 9, 0, 0, TAU));
  c.fillStyle = 'rgba(70,30,18,.25)';
  c.fillRect(cx - 24, cy - 5, 48, 10);
  c.restore();
  // 杯口和咖啡
  c.fillStyle = '#e8c2a2';
  c.beginPath();
  c.ellipse(cx, top0, 22, 5.5, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#6a2c1c';
  c.beginPath();
  c.ellipse(cx, top0 + 0.3, 20, 4.6, 0, 0, TAU);
  c.fill();
  const coffee = c.createLinearGradient(cx - 18, 0, cx + 18, 0);
  coffee.addColorStop(0, '#6e4528');
  coffee.addColorStop(1, '#2e1a0e');
  c.fillStyle = coffee;
  c.beginPath();
  c.ellipse(cx, top0 + 1.6, 18.5, 3.6, 0, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(255,246,228,.75)';
  c.beginPath();
  c.ellipse(cx - 7, top0 + 1, 5, 0.9, -0.05, 0, TAU);
  c.fill();
}

/** 相册里上一张照片：海边的日落 */
function drawOldPhoto(c: CanvasRenderingContext2D) {
  const sky = c.createLinearGradient(0, 0, 0, 26);
  sky.addColorStop(0, '#6d6aa8');
  sky.addColorStop(0.6, '#e98f78');
  sky.addColorStop(1, '#f7c58f');
  c.fillStyle = sky;
  c.fillRect(0, 0, 40, 26);
  c.fillStyle = '#fff1cf';
  c.beginPath();
  c.arc(24, 24, 5, 0, TAU);
  c.fill();
  const sea = c.createLinearGradient(0, 26, 0, 40);
  sea.addColorStop(0, '#4b4f86');
  sea.addColorStop(1, '#262a52');
  c.fillStyle = sea;
  c.fillRect(0, 26, 40, 14);
  c.fillStyle = 'rgba(255,214,160,.7)';
  for (let i = 0; i < 5; i++) c.fillRect(20 - i * 0.6, 28 + i * 2.4, 8 + i * 1.2, 0.8);
}

// ---------- 每帧重画的一层：窗外的光斑、光束里的浮尘、咖啡的热气 ----------

interface Xf {
  tx: number;
  ty: number;
  s: number;
  rot: number;
}
const toScreen = (f: Xf, x: number, y: number) => {
  const dx = (x - OX) * f.s;
  const dy = (y - OY) * f.s;
  const cos = Math.cos(f.rot);
  const sin = Math.sin(f.rot);
  return [OX + f.tx + dx * cos - dy * sin, OY + f.ty + dx * sin + dy * cos] as const;
};
const lerpXf = (a: Xf, b: Xf, p: number): Xf => ({ tx: mix(a.tx, b.tx, p), ty: mix(a.ty, b.ty, p), s: mix(a.s, b.s, p), rot: mix(a.rot, b.rot, p) });

export const camera: SceneDef = {
  title: '相机对焦',
  category: '界面',
  description: '手机相机的取景界面：点一下花瓶，对焦框落下、缩小、变黄，焦点从窗外拉到花瓶，背景散成光斑；按下快门一闪，照片缩进左下角的相册。',
  tags: ['track', 'spring', '景深模糊', 'canvas'],
  tone: 'dark',
  en: {
    title: 'Focus pull',
    description: 'A phone camera viewfinder: tap the vase and the focus box drops, shrinks and turns yellow as focus pulls from the window to the vase and the background melts into bokeh. The shutter flashes and the photo shrinks into the album thumbnail.',
    tags: ['track', 'spring', 'depth of field', 'canvas'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'dark', 'nm-cam');
    injectCSS(
      'nm-cam',
      `.nm-cam{background:#000}
.nm-cam .vf,.nm-cam .photo{position:absolute;left:0;top:0;width:640px;height:400px;overflow:hidden;background:#2a241e}
.nm-cam .vf canvas,.nm-cam .photo canvas{position:absolute}
.nm-cam .photo{transform-origin:0 0;background:none}
.nm-cam .flash,.nm-cam .black,.nm-cam .vig{position:absolute;inset:0;pointer-events:none}
.nm-cam .vig{background:radial-gradient(120% 90% at 55% 45%,rgba(0,0,0,0) 55%,rgba(20,12,4,.32))}
.nm-cam .pshadow{position:absolute;left:0;top:0;box-shadow:0 10px 28px rgba(0,0,0,.45),0 0 0 .5px rgba(255,255,255,.25)}
.nm-cam .flash{background:#fff;top:32px;bottom:94px}
.nm-cam .black{background:#000}
.nm-cam .top{position:absolute;left:0;right:0;top:0;height:32px;background:rgba(0,0,0,.45);color:#fff;font-size:11px;font-variant-numeric:tabular-nums}
.nm-cam .cells{position:absolute;left:0;right:0;top:0;height:32px;display:flex;justify-content:center;align-items:center;gap:16px}
.nm-cam .cell{display:flex;align-items:baseline;gap:4px;white-space:nowrap}
.nm-cam .cell i{font-style:normal;font-size:8px;font-weight:600;letter-spacing:.08em;color:rgba(255,255,255,.5)}
.nm-cam .cell b{font-weight:600;display:inline-block;text-align:left}
.nm-cam .raw{position:absolute;left:44px;top:9px;padding:0 4px;height:14px;line-height:13px;border:1px solid rgba(255,255,255,.85);border-radius:4px;font-size:8.5px;font-weight:700;letter-spacing:.04em}
.nm-cam .mp{position:absolute;right:44px;top:9px;padding:0 4px;height:14px;line-height:14px;border-radius:4px;background:rgba(255,255,255,.16);font-size:8.5px;font-weight:700;letter-spacing:.04em;color:rgba(255,255,255,.85)}
.nm-cam .batt{position:absolute;right:16px;top:11px;width:20px;height:10px;border:1px solid rgba(255,255,255,.6);border-radius:3px;padding:1px}
.nm-cam .batt::before{content:"";display:block;width:72%;height:100%;border-radius:1px;background:#fff}
.nm-cam .batt::after{content:"";position:absolute;right:-3px;top:2.5px;width:1.5px;height:3px;border-radius:0 1px 1px 0;background:rgba(255,255,255,.6)}
.nm-cam .bar{position:absolute;left:0;right:0;top:306px;bottom:0;background:rgba(0,0,0,.6)}
.nm-cam .modes{position:absolute;left:0;right:0;top:309px;height:22px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;font-size:10.5px;font-weight:500;letter-spacing:.05em;color:rgba(255,255,255,.78);white-space:nowrap}
.nm-cam .modes span{display:flex;gap:18px}
.nm-cam .modes span:first-child{justify-content:flex-end;padding-right:18px}
.nm-cam .modes span:last-child{padding-left:18px}
.nm-cam .modes b{color:#ffd60a;font-weight:600}
.nm-cam .shutter{position:absolute;left:294px;top:338px;width:52px;height:52px;border-radius:50%;border:3.5px solid #fff}
.nm-cam .shutter i{position:absolute;inset:3px;border-radius:50%;background:#fff}
.nm-cam .old,.nm-cam .ring{position:absolute;left:${THUMB.x}px;top:${THUMB.y}px;width:${THUMB.s}px;height:${THUMB.s}px;border-radius:8px}
.nm-cam .old{overflow:hidden}
.nm-cam .ring{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.85)}
.nm-cam .flip{position:absolute;left:566px;top:346px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.14)}
.nm-cam .flip svg{position:absolute;inset:0}
.nm-cam .zoom{position:absolute;left:0;top:0}
.nm-cam .pill{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:rgba(0,0,0,.38);color:#fff;font-size:9.5px;font-weight:600;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.nm-cam .pill.on{color:#ffd60a;font-size:10.5px}
.nm-cam .mm{position:absolute;left:0;top:0;width:80px;margin-left:-40px;text-align:center;font-size:9.5px;font-weight:700;letter-spacing:.08em;color:#ffd60a;text-shadow:0 1px 4px rgba(0,0,0,.5)}
.nm-cam .lock{position:absolute;left:50%;top:41px;padding:3px 8px;border-radius:5px;background:#ffd60a;color:#1d1d1f;font-size:10px;font-weight:700;letter-spacing:.04em;white-space:nowrap;transform-origin:50% 0}
.nm-cam svg.hud{position:absolute;left:0;top:0;width:640px;height:400px;overflow:visible}
.nm-cam svg.hud text{font-size:8px;font-weight:600;fill:rgba(255,255,255,.75);font-variant-numeric:tabular-nums}`,
    );

    // ---------- 取景器的三层 ----------
    const vf = el('div', 'vf', stage);
    const bg = layer(2, vf);
    const fx = document.createElement('canvas');
    fx.width = W * 2;
    fx.height = H * 2;
    Object.assign(fx.style, { left: '0', top: '0', width: `${W}px`, height: `${H}px` });
    vf.append(fx);
    const fxc = fx.getContext('2d')!;
    const fg = layer(2.5, vf);
    el('div', 'vig', vf);

    // 光斑的贴图：中间平、边缘略亮再迅速变暗，像镜头里真实的散景
    const disc = document.createElement('canvas');
    disc.width = disc.height = 64;
    const dc = disc.getContext('2d')!;
    const dg = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
    dg.addColorStop(0, 'rgba(255,244,222,.55)');
    dg.addColorStop(0.72, 'rgba(255,244,222,.62)');
    dg.addColorStop(0.9, 'rgba(255,248,232,.9)');
    dg.addColorStop(0.97, 'rgba(255,248,232,.35)');
    dg.addColorStop(1, 'rgba(255,248,232,0)');
    dc.fillStyle = dg;
    dc.fillRect(0, 0, 64, 64);
    const rnd = seeded(97);
    // 窗外树叶间的太阳反光（背景深度）
    const glints = Array.from({ length: 30 }, (_, i) => {
      const [cx, cy, r] = CLUSTERS[i % CLUSTERS.length]!;
      const a = rnd() * TAU;
      const d = r * (0.55 + rnd() * 0.45);
      return { x: cx + Math.cos(a) * d, y: Math.min(172, cy + Math.sin(a) * d), r: 0.9 + rnd() * 1.1, a: 0.55 + rnd() * 0.45, f: 1.5 + rnd() * 3, ph: rnd() * TAU };
    });
    // 光束里的浮尘（介于主体和背景之间）
    const motes = Array.from({ length: 18 }, () => ({ x: 170 + rnd() * 260, y: 12 + rnd() * 170, ph: rnd() * TAU, sp: 0.2 + rnd() * 0.3, a: 0.25 + rnd() * 0.35 }));

    // ---------- 拍下的照片（静态快照）和相册缩略图 ----------
    const photo = el('div', 'photo', stage);
    const pbg = layer(1, photo);
    const pfx = document.createElement('canvas');
    pfx.width = W;
    pfx.height = H;
    Object.assign(pfx.style, { left: '0', top: '0', width: `${W}px`, height: `${H}px` });
    photo.append(pfx);
    const pfg = layer(1, photo);

    // ---------- 界面 ----------
    const grid = svg('svg', { class: 'hud', viewBox: '0 0 640 400' }, stage);
    for (const x of [W / 3, (2 * W) / 3]) svg('line', { x1: x, y1: 32, x2: x, y2: 306, stroke: 'rgba(255,255,255,.22)', 'stroke-width': 0.6 }, grid);
    for (const y of [32 + 274 / 3, 32 + (2 * 274) / 3]) svg('line', { x1: 0, y1: y, x2: W, y2: y, stroke: 'rgba(255,255,255,.22)', 'stroke-width': 0.6 }, grid);

    const top = el('div', 'top', stage);
    const flashIcon = svg('svg', { width: 18, height: 18, viewBox: '0 0 18 18', style: 'position:absolute;left:16px;top:7px' }, top);
    svg('circle', { cx: 9, cy: 9, r: 8, fill: 'none', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 1 }, flashIcon);
    svg('path', { d: 'M9.8 3.8 6 9.6h3l-.8 4.6 3.8-5.8H9z', fill: '#fff' }, flashIcon);
    svg('path', { d: 'M4 4l10 10', stroke: '#fff', 'stroke-width': 1.2 }, flashIcon);
    el('div', 'raw', top, 'RAW');
    el('div', 'mp', top, '48MP');
    el('div', 'batt', top);
    const cells = el('div', 'cells', top);
    const cell = (label: string, width: number) => {
      const c = el('span', 'cell', cells);
      el('i', '', c, label);
      const b = el('b', '', c);
      b.style.minWidth = `${width}px`;
      return { c, b };
    };
    const isoCell = cell('ISO', 20);
    const sCell = cell(en ? 'S' : '快门', 30);
    const fCell = cell('ƒ', 22);
    const mmCell = cell(en ? 'FOCAL' : '焦段', 34);
    const evCell = cell('EV', 22);
    fCell.b.textContent = '1.78';
    evCell.b.textContent = '±0.0';
    const topCells = [isoCell.c, sCell.c, fCell.c, mmCell.c, evCell.c];

    el('div', 'bar', stage);
    // 拍摄模式：当前的“照片”始终居中，两边的模式各自靠向它
    const modes = el('div', 'modes', stage);
    const names = en ? ['TIME-LAPSE', 'SLO-MO', 'VIDEO', 'PHOTO', 'PORTRAIT', 'PANO'] : ['延时摄影', '慢动作', '视频', '照片', '人像', '全景'];
    const ml = el('span', '', modes);
    el('b', '', modes, names[3]);
    const mr = el('span', '', modes);
    names.forEach((m, i) => i !== 3 && (el('em', '', i < 3 ? ml : mr, m).style.fontStyle = 'normal'));
    const shutter = el('div', 'shutter', stage);
    const shutterIn = el('i', '', shutter);
    const old = el('div', 'old', stage);
    const oc = document.createElement('canvas');
    oc.width = oc.height = 80;
    Object.assign(oc.style, { width: '40px', height: '40px', display: 'block' });
    old.append(oc);
    const occ = oc.getContext('2d')!;
    occ.scale(2, 2);
    drawOldPhoto(occ);
    const flip = el('div', 'flip', stage);
    const flipIcon = svg('svg', { viewBox: '0 0 36 36' }, flip);
    svg('path', { d: 'M11 16.5a7 7 0 0 1 12.4-3.6M25 19.5a7 7 0 0 1-12.4 3.6', fill: 'none', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, flipIcon);
    svg('path', { d: 'M24.6 9.4v4.2h-4.2M11.4 26.6v-4.2h4.2', fill: 'none', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, flipIcon);

    // 变焦按钮：.5  1×  2  5，1× 连点两下切到 28 mm、35 mm
    const zoomBox = el('div', 'zoom', stage);
    const pills = ['.5', '1×', '2', '5'].map((label, i) => {
      const p = el('div', i === 1 ? 'pill on' : 'pill', zoomBox, label);
      p.style.left = `${320 + (i - 1.5) * 34}px`;
      p.style.top = `${PILL.y}px`;
      return p;
    });
    const activePill = pills[1]!;
    const mmLabel = el('div', 'mm', zoomBox);
    mmLabel.style.left = `${PILL.x}px`;
    mmLabel.style.top = `${PILL.y - 26}px`;

    const pshadow = el('div', 'pshadow', stage);
    stage.append(photo); // 照片要飞到底栏上面
    const flash = el('div', 'flash', stage);
    const ring = el('div', 'ring', stage);
    const hud = svg('svg', { class: 'hud', viewBox: '0 0 640 400' }, stage);
    // 刚打开时中间的大对焦框
    const afBox = svg('g', {}, hud);
    const box = (g: SVGGElement, s: number) => {
      const h = s / 2;
      const t = 5;
      svg('rect', { x: -h, y: -h, width: s, height: s, fill: 'none', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }, g);
      svg('path', { d: `M0 ${-h}v${t}M0 ${h}v${-t}M${-h} 0h${t}M${h} 0h${-t}`, fill: 'none', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }, g);
    };
    box(afBox, 132);
    afBox.setAttribute('stroke', 'rgba(255,255,255,.85)');
    // 点按的位置：花瓶瓶身，在 35 mm 下的屏幕坐标
    const Z35 = 35 / 24;
    const TAP = { x: OX + (VASE.x - OX) * Z35, y: OY + (VASE.y - 34 - OY) * Z35 };
    const focusG = svg('g', {}, hud);
    const focusBox = svg('g', {}, focusG);
    box(focusBox, 76);
    const sunG = svg('g', {}, focusG);
    svg('circle', { r: 3.4, fill: 'none', 'stroke-width': 1.2 }, sunG);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      svg('line', { x1: Math.cos(a) * 5.4, y1: Math.sin(a) * 5.4, x2: Math.cos(a) * 7.4, y2: Math.sin(a) * 7.4, 'stroke-width': 1.1, 'stroke-linecap': 'round' }, sunG);
    }
    const sunLine = svg('path', { d: 'M0 -38v28M0 10v28', 'stroke-width': 0.8, opacity: 0.6 }, sunG);
    sunG.setAttribute('stroke', '#ffd60a');
    sunLine.setAttribute('stroke', '#ffd60a');
    // 手指点按的反馈
    const touch = svg('g', {}, hud);
    const touchDot = svg('circle', { r: 17, fill: 'rgba(255,255,255,.3)' }, touch);
    const touchRing = svg('circle', { r: 17, fill: 'none', stroke: 'rgba(255,255,255,.7)', 'stroke-width': 1.2 }, touch);
    // 右侧的对焦距离刻度：∞ 到 0.5 m，按屈光度均匀分布
    const scale = svg('g', { transform: 'translate(604 0)' }, hud);
    const dy = (d: number) => 76 + (d / 2) * 172;
    svg('line', { x1: 0, y1: dy(0), x2: 0, y2: dy(2), stroke: 'rgba(255,255,255,.4)', 'stroke-width': 0.8 }, scale);
    for (let d = 0; d <= 2.001; d += 0.125) svg('line', { x1: -3, y1: dy(d), x2: 0, y2: dy(d), stroke: 'rgba(255,255,255,.4)', 'stroke-width': 0.7 }, scale);
    for (const [d, label] of [[0, '∞'], [1 / 3, '3'], [1, '1'], [2, '0.5 m']] as const) {
      svg('line', { x1: -6, y1: dy(d), x2: 0, y2: dy(d), stroke: 'rgba(255,255,255,.75)', 'stroke-width': 0.9 }, scale);
      const tx = svg('text', { x: 5, y: dy(d) + 3 }, scale);
      tx.textContent = label;
    }
    const marker = svg('g', {}, scale);
    svg('path', { d: 'M-12 0l-5 -3.5v7z', fill: '#ffd60a' }, marker);
    svg('line', { x1: -11, y1: 0, x2: 0, y2: 0, stroke: '#ffd60a', 'stroke-width': 1.2 }, marker);
    const distText = svg('text', { x: -54, y: 3, style: 'fill:#ffd60a;font-size:9px' }, marker);

    const lock = el('div', 'lock', stage, en ? 'AE/AF LOCK' : 'AE/AF 锁定');
    const black = el('div', 'black', stage);

    // ---------- 静态内容（传了图片时取景器里拍的是那张图） ----------
    let imageMode = false;
    const paint = (img?: HTMLImageElement) => {
      for (const l of [bg, fg]) {
        l.ctx.save();
        l.ctx.setTransform(1, 0, 0, 1, 0, 0);
        l.ctx.clearRect(0, 0, l.canvas.width, l.canvas.height);
        l.ctx.restore();
      }
      if (img) {
        const s = Math.max((W + 2 * B) / img.naturalWidth, (H + 2 * B) / img.naturalHeight);
        bg.ctx.drawImage(img, W / 2 - (img.naturalWidth * s) / 2, H / 2 - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      } else {
        drawRoom(bg.ctx, bg.k);
        drawTable(bg.ctx, bg.k);
        // 前景也画一份桌面，越往后越透明：桌面靠近主体的部分跟着主体清晰，靠墙的部分跟着背景模糊
        drawTable(fg.ctx, fg.k);
        fg.ctx.save();
        fg.ctx.globalCompositeOperation = 'destination-in';
        const ramp = fg.ctx.createLinearGradient(0, TABLE, 0, VASE.y + 2);
        ramp.addColorStop(0, 'rgba(0,0,0,0)');
        ramp.addColorStop(1, '#000');
        fg.ctx.fillStyle = ramp;
        fg.ctx.fillRect(-B, -B, W + 2 * B, H + 2 * B);
        fg.ctx.restore();
        drawStill(fg.ctx, fg.k);
      }
      for (const [src, dst] of [[bg, pbg], [fg, pfg]] as const) {
        dst.ctx.save();
        dst.ctx.setTransform(1, 0, 0, 1, 0, 0);
        dst.ctx.clearRect(0, 0, dst.canvas.width, dst.canvas.height);
        dst.ctx.drawImage(src.canvas, 0, 0, dst.canvas.width, dst.canvas.height);
        dst.ctx.restore();
      }
    };
    paint();

    // ---------- 剧本 ----------
    const zs = spring({ duration: 0.55, bounce: 0.12 });
    const zoom = track(1, [[1.62, 28 / 24, zs], [2.12, Z35, zs]]);
    // 对焦位置：0 = 花瓶，1 = 窗外。开场先“找焦”：冲过头、拉回来、再停稳在窗外；点按后拉到花瓶
    const focus = track(0.3, [
      [0.32, 1.45, spring({ duration: 0.5 })],
      [0.78, 0.88, spring({ duration: 0.36 })],
      [1.08, 1, spring({ duration: 0.45 })],
      [2.72, 0, spring({ duration: 1.0, bounce: 0.12 })],
    ]);
    // 曝光：刚打开时过曝，测光后压下来；点在逆光的花瓶上又提亮一点
    const expo = track(1.35, [[0.25, 1, spring({ duration: 1.1 })], [3.3, 1.06, spring({ duration: 0.6 })]]);
    const iso = track(400, [[0.3, 64, spring({ duration: 1.1 })], [3.3, 125, spring({ duration: 0.6 })]]);
    const shut = track(Math.log2(60), [[0.3, Math.log2(500), spring({ duration: 1.1 })], [3.3, Math.log2(250), spring({ duration: 0.6 })]]);
    const quick = spring({ duration: 0.25 });
    const boxScale = track(1.75, [[2.65, 1, spring({ duration: 0.45, bounce: 0.3 })], [3.28, 0.9, spring({ duration: 0.12 })], [3.38, 1, spring({ duration: 0.4, bounce: 0.5 })]]);
    const boxO = track(0, [[2.65, 1, quick], [5.6, 0.55, spring({ duration: 0.6 })]]);
    const yellow = track(0, [[3.28, 1, quick]]);
    const sunO = track(0, [[3.34, 1, quick]]);
    const afO = track(0, [[0.28, 1, quick], [1.35, 0, spring({ duration: 0.4 })]]);
    const afS = track(1.18, [[0.28, 1, spring({ duration: 0.4, bounce: 0.3 })]]);
    const scaleO = track(0, [[0.3, 1, quick], [1.5, 0, spring({ duration: 0.5 })], [2.68, 1, quick], [4.0, 0, spring({ duration: 0.5 })]]);
    const lockIn = track(0, [[3.75, 1, spring({ duration: 0.4, bounce: 0.35 })]]);
    const press = track(1, [[4.3, 0.84, spring({ duration: 0.12 })], [4.44, 1, spring({ duration: 0.4, bounce: 0.45 })]]);
    const fly = spring({ duration: 0.75, bounce: 0.14 });
    const bump = track(1, [[5.02, 1.16, spring({ duration: 0.12 })], [5.12, 1, spring({ duration: 0.45, bounce: 0.45 })]]);
    const taps = [
      { at: 1.55, ...PILL },
      { at: 2.05, ...PILL },
      { at: 2.62, x: TAP.x, y: TAP.y },
      { at: 4.28, x: 320, y: 364 },
    ];
    const mmShow = (t: number) => Math.max(0, ...[1.6, 2.1].map((at) => (t > at ? clamp((t - at) / 0.1) * (1 - smooth(0.55, 0.8, t - at)) : 0)));
    const uiIn = [0, 1, 2, 3, 4, 5, 6].map((i) => track(0, [[0.12 + i * 0.05, 1, spring({ duration: 0.5, bounce: 0.2 })]]));

    /** 取景器某一深度的变换：变焦 + 对焦呼吸 + 手持的轻微晃动（近处的东西晃得更多） */
    const xfAt = (t: number, depth: number): Xf => {
      const z = zoom(t);
      const breathe = 1 + 0.018 * (1 - clamp(focus(t)));
      const hx = (1.4 * Math.sin(1.3 * t + 0.4) + 0.7 * Math.sin(2.9 * t + 1.1)) * z;
      const hy = (1.0 * Math.sin(1.1 * t + 2) + 0.5 * Math.sin(3.4 * t)) * z;
      const par = 1 - depth * 0.8;
      return { tx: hx + 1.3 * Math.sin(0.9 * t + 1.7) * par, ty: hy + 0.7 * Math.sin(1.6 * t + 0.3) * par, s: z * breathe, rot: 0.003 * Math.sin(0.7 * t + 0.5) };
    };
    const css = (f: Xf) => `translate(${f.tx.toFixed(2)}px,${f.ty.toFixed(2)}px) rotate(${f.rot.toFixed(5)}rad) scale(${f.s.toFixed(4)})`;
    const opening = (t: number) => 9 * (1 - smooth(0.05, 1.0, t));
    const blurAt = (t: number, depth: number) => A * Math.abs(depth - focus(t)) + opening(t);

    const drawFx = (c: CanvasRenderingContext2D, t: number) => {
      c.clearRect(0, 0, W, H);
      if (imageMode) return;
      const fbg = xfAt(t, 1);
      const ffg = xfAt(t, 0);
      const e = expo(t);
      c.globalCompositeOperation = 'lighter';
      // 树叶间的反光：清晰时是小亮点，失焦后散成边缘略亮的圆形光斑
      const bb = blurAt(t, 1);
      for (const g of glints) {
        const r = (g.r + bb * 2.4) * fbg.s;
        const tw = 0.65 + 0.35 * Math.sin(t * g.f + g.ph);
        c.globalAlpha = clamp(g.a * tw * Math.min(1, ((g.r + 0.8) * fbg.s) / r) ** 0.4 * e);
        const [x, y] = toScreen(fbg, g.x, g.y);
        c.drawImage(disc, x - r, y - r, r * 2, r * 2);
      }
      // 光束里的浮尘
      const fm = lerpXf(ffg, fbg, 0.4);
      const mb = blurAt(t, 0.4);
      for (const m of motes) {
        const r = (0.7 + mb * 1.4) * fm.s;
        const [x, y] = toScreen(fm, m.x + 8 * Math.sin(t * m.sp + m.ph), m.y + 6 * Math.sin(t * m.sp * 0.7 + m.ph * 2) - 3 * t * m.sp);
        c.globalAlpha = clamp(m.a * (0.5 + 0.5 * Math.sin(t * 2.4 + m.ph * 3)) * Math.min(1, 1.6 / (r / fm.s)) * e);
        c.drawImage(disc, x - r, y - r, r * 2, r * 2);
      }
      // 咖啡的热气：三缕，越往上越宽越淡
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      const fb = blurAt(t, 0);
      const [bx, by] = toScreen(ffg, CUP.x, CUP.y - 31);
      for (let w = 0; w < 3; w++) {
        for (const [lw, al] of [[9 + fb * 2.2, 0.12], [3 + fb * 1.5, 0.24]] as const) {
          c.beginPath();
          for (let j = 0; j <= 14; j++) {
            const v = j / 14;
            const sway = Math.sin(v * 5 - t * (1.7 + w * 0.3) + w * 2.1) * (2 + 10 * v) + (w - 1) * 6 * v + 4 * Math.sin(t * 0.6 + w) * v;
            const x = bx + (w - 1) * 5 + sway * ffg.s;
            const y = by - v * 74 * ffg.s;
            if (j) c.lineTo(x, y);
            else c.moveTo(x, y);
          }
          const g = c.createLinearGradient(0, by, 0, by - 74 * ffg.s);
          g.addColorStop(0, 'rgba(255,250,242,0)');
          g.addColorStop(0.18, `rgba(255,250,242,${al / (1 + fb * 0.25)})`);
          g.addColorStop(1, 'rgba(255,250,242,0)');
          c.strokeStyle = g;
          c.lineWidth = lw * ffg.s;
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.stroke();
        }
      }
      c.globalAlpha = 1;
    };

    // 快门那一刻的画面定格成照片
    const pfxc = pfx.getContext('2d')!;
    const freeze = () => {
      const t = CAP;
      for (const [l, depth] of [[pbg, 1], [pfg, 0]] as const) {
        l.canvas.style.transform = css(xfAt(t, depth));
        l.canvas.style.filter = `blur(${blurAt(t, imageMode ? 0 : depth).toFixed(2)}px) brightness(${expo(t).toFixed(3)})`;
      }
      pfxc.setTransform(1, 0, 0, 1, 0, 0);
      drawFx(pfxc, t);
      pfx.style.filter = `brightness(${expo(t).toFixed(3)})`;
    };
    freeze();

    const text = (node: HTMLElement | SVGElement, s: string) => {
      if (node.textContent !== s) node.textContent = s;
    };

    const render = (t: number) => {
      // 取景器
      const e = expo(t);
      for (const [l, depth] of [[bg, 1], [fg, 0]] as const) {
        l.canvas.style.transform = css(xfAt(t, depth));
        l.canvas.style.filter = `blur(${blurAt(t, imageMode ? 0 : depth).toFixed(2)}px) brightness(${e.toFixed(3)})`;
      }
      fxc.setTransform(2, 0, 0, 2, 0, 0);
      drawFx(fxc, t);
      fx.style.filter = `brightness(${e.toFixed(3)})`;

      // 顶栏参数
      text(isoCell.b, String(nearest(ISO, iso(t))));
      text(sCell.b, `1/${nearest(SHUTTER, 2 ** shut(t))}`);
      const z = zoom(t);
      text(mmCell.b, `${Math.round(24 * z)} mm`);
      text(activePill, z < 1.04 ? '1×' : `${(Math.round(z * 10) / 10).toFixed(1)}×`);
      text(mmLabel, `${Math.round(24 * z) >= 33 ? 35 : 28} MM`);
      mmLabel.style.opacity = String(mmShow(t));

      // 界面进场
      const ins = uiIn.map((u) => clamp(u(t)));
      topCells.forEach((c, i) => {
        const k = ins[Math.min(i, 4)]!;
        c.style.opacity = String(k);
        c.style.transform = `translateY(${(1 - k) * -6}px)`;
      });
      const kb = ins[5]!;
      for (const n of [modes, zoomBox]) {
        n.style.opacity = String(kb);
        n.style.transform = `translateY(${(1 - kb) * 8}px)`;
      }
      grid.style.opacity = String(ins[6]!);
      const ps = press(t);
      shutterIn.style.transform = `scale(${ps})`;

      // 开场的大对焦框
      afBox.setAttribute('opacity', String(clamp(afO(t)) * (0.75 + 0.25 * Math.cos(t * 14))));
      afBox.setAttribute('transform', `translate(320 168) scale(${afS(t)})`);

      // 点按花瓶后的对焦框：落下、缩小、变黄
      const bo = clamp(boxO(t));
      const yl = clamp(yellow(t));
      focusG.setAttribute('opacity', String(bo));
      focusBox.setAttribute('stroke', mixColor('#ffffff', '#ffd60a', yl));
      focusBox.setAttribute('transform', `translate(${TAP.x} ${TAP.y}) scale(${boxScale(t)})`);
      sunG.setAttribute('transform', `translate(${TAP.x + 52} ${TAP.y})`);
      sunG.setAttribute('opacity', String(clamp(sunO(t))));

      // 手指
      const tap = taps.filter((p) => t >= p.at && t < p.at + 0.5).pop();
      if (tap) {
        const a = (t - tap.at) / 0.5;
        touch.setAttribute('opacity', String(1 - smooth(0.4, 1, a)));
        touch.setAttribute('transform', `translate(${tap.x} ${tap.y})`);
        touchDot.setAttribute('r', String(12 + 6 * smooth(0, 0.3, a)));
        touchRing.setAttribute('r', String(14 + 16 * a));
        touchRing.setAttribute('opacity', String(1 - a));
      } else touch.setAttribute('opacity', '0');

      // 对焦距离刻度
      const fd = focus(t);
      const dio = mix(DIOPTER_NEAR, DIOPTER_FAR, fd);
      scale.setAttribute('opacity', String(clamp(scaleO(t)) * 0.95));
      marker.setAttribute('transform', `translate(0 ${dy(clamp(dio, 0, 2))})`);
      text(distText, dio < 0.12 ? '∞' : `${(1 / dio).toFixed(2)} m`);

      // AE/AF 锁定
      const li = lockIn(t);
      lock.style.opacity = String(clamp(li * 2));
      lock.style.transform = `translateX(-50%) scale(${0.6 + 0.4 * li})`;

      // 快门：闪一下，照片定格，缩进左下角
      flash.style.opacity = String(0.85 * smooth(CAP - 0.03, CAP, t) * Math.exp(-Math.max(0, t - CAP) / 0.09));
      const shot = t >= CAP - 0.01;
      photo.style.visibility = shot ? 'visible' : 'hidden';
      pshadow.style.visibility = shot ? 'visible' : 'hidden';
      const b = bump(t);
      const cx = THUMB.x + THUMB.s / 2;
      const cy = THUMB.y + THUMB.s / 2;
      if (shot) {
        // 可见区域从“两条栏之间的取景区”收成左下角的方形缩略图
        const p = fly(t - FLY);
        const L = CROP.l * p;
        const R = CROP.r * p;
        const T = VIEW.top * (1 - p);
        const Bt = (H - VIEW.bottom) * (1 - p);
        const s = mix(VIEW.bottom - VIEW.top, THUMB.s, p) / (H - T - Bt);
        const X = mix(0, THUMB.x, p);
        const Y = mix(VIEW.top, THUMB.y, p);
        photo.style.transform = `translate(${cx}px,${cy}px) scale(${b}) translate(${-cx}px,${-cy}px) translate(${(X - L * s).toFixed(2)}px,${(Y - T * s).toFixed(2)}px) scale(${s.toFixed(4)})`;
        photo.style.clipPath = `inset(${T.toFixed(2)}px ${R.toFixed(2)}px ${Bt.toFixed(2)}px ${L.toFixed(2)}px round ${(mix(0, 8, clamp(p)) / s).toFixed(2)}px)`;
        // 飞行中的照片下面垫一层阴影，落进缩略图时收掉
        Object.assign(pshadow.style, {
          width: `${(W - L - R) * s}px`,
          height: `${(H - T - Bt) * s}px`,
          borderRadius: `${mix(0, 8, clamp(p))}px`,
          transform: `translate(${X}px,${Y}px)`,
          opacity: String(smooth(FLY, FLY + 0.1, t) * (1 - smooth(4.85, 5.0, t))),
        });
      }
      ring.style.transform = `scale(${b})`;
      ring.style.opacity = String(1 - smooth(FLY, FLY + 0.06, t) + smooth(4.9, 5.0, t));

      // 首尾：黑场淡入、淡出（像打开和关上相机）
      black.style.opacity = String(Math.max(1 - smooth(0.02, 0.5, t), smooth(6.85, 7.5, t)));
    };

    if (options.image) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageMode = true;
        paint(img);
        freeze();
        tl.seek(tl.time);
      };
      img.src = options.image;
    }

    const tl = timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 5.6 });
    return tl;
  },
};
