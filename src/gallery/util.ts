/**
 * 作品廊场景的共用工具。
 *
 * 每个场景都画在 640×400 的逻辑舞台上，再按容器大小整体缩放（铺满并居中）：
 * 动画里的坐标可以直接写数字，任何尺寸下构图都一样，导出视频时也能按任意分辨率渲染。
 */
import type { Timeline } from '../timeline.ts';

export const W = 640;
export const H = 400;

export type Tone = 'light' | 'dark';

export interface SceneOptions {
  /** 场景里用到的文字（标题、粒子文字等），不传就用场景自己的默认值 */
  text?: string;
  /** 创建后是否立刻播放。默认 true；开了“减少动态效果”时总是先停在静止画面 */
  autoplay?: boolean;
}

export interface SceneDef {
  /** 中文名 */
  title: string;
  /** 一句话说明 */
  description: string;
  /** 用到的 noah-motion 能力 */
  tags: string[];
  tone: Tone;
  /** 把场景挂到容器里，返回它的时间轴。容器需要有确定的宽高（比如 aspect-ratio: 16 / 10） */
  mount(host: HTMLElement, options?: SceneOptions): Timeline;
}

/** 在容器里建一块会自动缩放的 640×400 舞台 */
export function createStage(host: HTMLElement, tone: Tone, className: string) {
  host.replaceChildren();
  host.classList.add('nm-host');
  const stage = document.createElement('div');
  stage.className = `nm-stage nm-${tone} ${className}`;
  host.append(stage);
  // 铺满并居中（类似 object-fit: cover）：容器比例和 16:10 不同时，取较大的缩放比例，多出来的部分平均裁到两边
  const fit = () => {
    const cw = host.clientWidth;
    const ch = host.clientHeight || (cw * H) / W;
    const k = Math.max(cw / W, ch / H);
    stage.style.transform = `translate(${(cw - W * k) / 2}px, ${(ch - H * k) / 2}px) scale(${k})`;
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(host);
  fit();
  injectCSS(
    'nm-base',
    `.nm-host{position:relative;overflow:hidden}
.nm-stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Helvetica Neue",sans-serif;
  -webkit-font-smoothing:antialiased;overflow:hidden;contain:layout paint}
.nm-light{background:#f4f4f1;color:#1d1d1f}
.nm-dark{background:#0b0b0d;color:#f5f5f7}
.nm-stage *{box-sizing:border-box}`,
  );
  return stage;
}

/** 一块铺满舞台的高清 canvas，绘图坐标仍是 640×400 */
export function createCanvas(stage: HTMLElement, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: `${W}px`, height: `${H}px` });
  stage.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

const injected = new Set<string>();
/** 每段样式只插入页面一次 */
export function injectCSS(id: string, css: string) {
  if (injected.has(id) || typeof document === 'undefined') return;
  injected.add(id);
  const style = document.createElement('style');
  style.dataset.nm = id;
  style.textContent = css;
  document.head.append(style);
}

/** 创建元素的小工具 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', parent?: HTMLElement, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

/** 确定性伪随机：同一个种子永远给出同一串数，拖到同一帧画面就一样 */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;

/** 0→1 的平滑阶梯（三次 Hermite） */
export const smooth = (e0: number, e1: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

export type { Timeline };
