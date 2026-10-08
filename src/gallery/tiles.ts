// 翻牌拼图：8×5 块方砖沿对角线依次 3D 翻转，背面合起来是一张完整的图；
// 停留后再沿反方向翻回来，回到彩色方砖。每块砖都有自己的弹簧，所以翻到位时会轻轻晃一下。
import { spring } from '../spring.ts';
import { track } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, seeded, type SceneDef } from './util.ts';

const D = 8;
const COLS = 8;
const ROWS = 5;
const SIZE = 80;

/** 没传图片时，用 canvas 画一张柔和的渐变抽象画 */
function generatedArt() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 640, 400);
  bg.addColorStop(0, '#ffd6e0');
  bg.addColorStop(0.5, '#c9e4ff');
  bg.addColorStop(1, '#d9f7e8');
  g.fillStyle = bg;
  g.fillRect(0, 0, 640, 400);
  const rnd = seeded(9);
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 640;
    const y = rnd() * 400;
    const r = 70 + rnd() * 150;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const hue = 190 + rnd() * 160;
    rg.addColorStop(0, `hsla(${hue}, 85%, 62%, 0.85)`);
    rg.addColorStop(1, `hsla(${hue}, 85%, 62%, 0)`);
    g.fillStyle = rg;
    g.fillRect(0, 0, 640, 400);
  }
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.font = '800 64px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('noah-motion', 320, 200);
  return c.toDataURL('image/jpeg', 0.9);
}

export const tiles: SceneDef = {
  title: '翻牌拼图',
  category: '图形',
  description: '40 块方砖沿对角线依次 3D 翻转，背面拼成一张完整的图，停留后再反方向翻回来。',
  tags: ['track × 40', '3D', 'stagger'],
  tone: 'dark',
  mount(host, options = {}) {
    const stage = createStage(host, 'dark', 'nm-tiles');
    injectCSS(
      'nm-tiles',
      `.nm-tiles{background:#0b0b0d;perspective:1200px}
.nm-tiles .tile{position:absolute;width:${SIZE}px;height:${SIZE}px;transform-style:preserve-3d}
.nm-tiles .face{position:absolute;inset:1.5px;border-radius:7px;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.nm-tiles .back{transform:rotateY(180deg);background-size:640px 400px;background-repeat:no-repeat}`,
    );
    // 传入的图片先按 16:10 居中裁成 cover，再切到每块砖背面（直接拉伸会变形）
    let image = options.image ? '' : generatedArt(); // 传了图片就不用生成默认图，背面在图片加载后再填
    const rnd = seeded(4);
    const palette = ['#1c1c1e', '#2c2c2e', '#0a84ff', '#5e5ce6', '#bf5af2', '#30d158', '#ff9f0a', '#ff375f'];
    const flip = spring({ duration: 0.8, bounce: 0.22 });
    const items = [] as { node: HTMLElement; a: ReturnType<typeof track> }[];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const node = el('div', 'tile', stage);
        node.style.left = `${c * SIZE}px`;
        node.style.top = `${r * SIZE}px`;
        const front = el('div', 'face', node);
        // 正面：大多是深色，偶尔点一块亮色
        const pick = rnd();
        front.style.background = pick > 0.78 ? palette[2 + Math.floor(rnd() * 6)]! : palette[Math.floor(rnd() * 2)]!;
        const back = el('div', 'face back', node);
        if (image) back.style.backgroundImage = `url("${image}")`;
        back.style.backgroundPosition = `${-c * SIZE - 1.5}px ${-r * SIZE - 1.5}px`;
        // 对角线波：先翻左上角，最后翻右下角；翻回时反过来
        const diag = (c + r) / (COLS + ROWS - 2);
        const a = track(0, [[0.5 + diag * 1.4, 180, flip], [5.2 + (1 - diag) * 1.4, 360, flip]]);
        items.push({ node, a });
      }
    }

    if (options.image) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 1280;
        c.height = 800;
        const g = c.getContext('2d')!;
        const k = Math.max(1280 / img.naturalWidth, 800 / img.naturalHeight);
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        g.drawImage(img, (1280 - w) / 2, (800 - h) / 2, w, h);
        image = c.toDataURL('image/jpeg', 0.88);
        stage.querySelectorAll<HTMLElement>('.back').forEach((b) => (b.style.backgroundImage = `url("${image}")`));
      };
      img.src = options.image;
    }

    const render = (t: number) => {
      for (const { node, a } of items) {
        const deg = a(t);
        // 翻到一半时稍微抬起来一点，更有立体感
        const lift = Math.sin(((deg % 180) / 180) * Math.PI) * 26;
        node.style.transform = `translateZ(${lift}px) rotateY(${deg}deg)`;
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 4.2 });
  },
};
