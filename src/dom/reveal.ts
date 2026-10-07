import type { Spring } from '../spring.ts';
import { resolve, springTiming, prefersReducedMotion, gentle, type Targets } from './util.ts';

export interface RevealOptions {
  /** 从下方多少像素升上来。默认 24 */
  y?: number;
  /** 起始模糊（像素）。默认 0 */
  blur?: number;
  /** 起始缩放。默认 1 */
  scale?: number;
  /** 同一批进入屏幕的元素依次错开的秒数。默认 0.06 */
  stagger?: number;
  spring?: Spring;
  /** 提前多少触发，同 IntersectionObserver 的 rootMargin。默认 '0px 0px -8% 0px' */
  rootMargin?: string;
}

/**
 * 滚动进场：元素进入屏幕时淡入并弹上来。调用时立刻把元素藏起来，所以尽量在页面加载时就调用。
 * 返回一个函数，调用它会停止监听并让还没出现的元素直接显示。
 */
export function reveal(targets: Targets, options: RevealOptions = {}) {
  const els = resolve(targets);
  if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') return () => {};

  const { y = 24, blur = 0, scale = 1, stagger = 0.06, spring = gentle, rootMargin = '0px 0px -8% 0px' } = options;
  const { easing, duration } = springTiming(spring);
  const hidden = `translateY(${y}px) scale(${scale})`;

  for (const el of els) {
    el.style.opacity = '0';
    el.style.transform = hidden;
    if (blur) el.style.filter = `blur(${blur}px)`;
  }

  const show = (el: HTMLElement, delay: number) => {
    el.style.opacity = '';
    el.style.transform = '';
    el.style.filter = '';
    el.animate(
      [
        { opacity: 0, transform: hidden, filter: blur ? `blur(${blur}px)` : 'none' },
        { opacity: 1, transform: 'none', filter: 'none' },
      ],
      { duration, easing, delay: delay * 1000, fill: 'backwards' },
    );
  };

  const io = new IntersectionObserver(
    (entries) => {
      const entering = entries.filter((e) => e.isIntersecting);
      entering.forEach((e, i) => {
        io.unobserve(e.target);
        show(e.target as HTMLElement, i * stagger);
      });
    },
    { rootMargin },
  );
  els.forEach((el) => io.observe(el));

  return () => {
    io.disconnect();
    for (const el of els) {
      el.style.opacity = '';
      el.style.transform = '';
      el.style.filter = '';
    }
  };
}
