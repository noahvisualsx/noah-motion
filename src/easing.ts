/**
 * 缓动曲线：输入 0~1 的时间进度，输出 0~1 的数值进度。
 */
export type Easing = (p: number) => number;

/**
 * 三次贝塞尔缓动，和 CSS 的 cubic-bezier(x1, y1, x2, y2) 同一种曲线。
 * 先用牛顿法从 x 反求参数 u，收敛慢时退回二分法，再用 u 算 y。
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const x = (u: number) => ((ax * u + bx) * u + cx) * u;
  const y = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;

  const solve = (target: number) => {
    let u = target;
    for (let i = 0; i < 8; i++) {
      const err = x(u) - target;
      if (Math.abs(err) < 1e-7) return u;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = target;
    for (let i = 0; i < 40; i++) {
      const v = x(u);
      if (Math.abs(v - target) < 1e-7) break;
      if (v < target) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };

  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : y(solve(p)));
}

export const linear: Easing = (p) => p;
/** 快出慢停，最常用的“进场”曲线 */
export const easeOut = cubicBezier(0.22, 1, 0.36, 1);
/** 慢起慢停 */
export const easeInOut = cubicBezier(0.65, 0, 0.35, 1);
/** 慢起快走，适合“离场” */
export const easeIn = cubicBezier(0.55, 0, 1, 0.45);

/** 分成 n 级跳变，像逐帧动画或“一步步算出来”的感觉 */
export const steps =
  (n: number): Easing =>
  (p) =>
    p >= 1 ? 1 : Math.floor(Math.max(p, 0) * n) / n;
