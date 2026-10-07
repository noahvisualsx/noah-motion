import { easeOut, type Easing } from '../easing.ts';
import { resolve, prefersReducedMotion, type Targets } from './util.ts';

export interface CountOptions {
  from?: number;
  /** 秒。默认 1.1 */
  duration?: number;
  ease?: Easing;
  /** 数字怎么显示，默认取整 */
  format?: (n: number) => string;
}

/** 数字从 from 滚到 to。返回的 Promise 在滚完时结束 */
export function countUp(el: Element, to: number, options: CountOptions = {}): Promise<void> {
  const { from = 0, duration = 1.1, ease = easeOut, format = (n) => String(Math.round(n)) } = options;
  if (prefersReducedMotion() || duration <= 0) {
    el.textContent = format(to);
    return Promise.resolve();
  }
  return new Promise((done) => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / (duration * 1000));
      el.textContent = format(p < 1 ? from + (to - from) * ease(p) : to);
      if (p < 1) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
}

/**
 * 页面上的数字滚进屏幕时才开始滚。目标值写在 data-count 属性里，元素里原本的文字就是最终显示，
 * 所以没有 JS 或开了“减少动态效果”时看到的仍然是正确数字。
 */
export function countOnView(targets: Targets = '[data-count]', options: CountOptions = {}) {
  if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') return () => {};
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const to = Number((e.target as HTMLElement).dataset.count);
      if (Number.isFinite(to)) countUp(e.target, to, options);
    }
  });
  resolve(targets).forEach((el) => io.observe(el));
  return () => io.disconnect();
}
