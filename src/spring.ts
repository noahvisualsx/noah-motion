/**
 * 闭式弹簧。
 *
 * 不逐帧模拟，而是直接解二阶阻尼振动方程：给定时间 t，立刻算出位置和速度。
 * 好处是动画成了时间的纯函数——可以跳到任意一帧、倒放、拖动，逐帧导出视频时每一帧都完全一致。
 *
 * 弹簧从 0 走到 1（“进度”），用的时候再映射到真实数值：from + (to - from) * s(t)。
 */

export interface SpringOptions {
  /** 大致完成一次摆动的时长（秒）。和 bounce 搭配使用，比劲度系数直观。默认 0.5 */
  duration?: number;
  /** 回弹程度：0 = 刚好停住不过冲；0.3 ≈ 明显回弹；负数 = 更“黏”、慢慢停住。范围 -1 < bounce < 1。默认 0 */
  bounce?: number;
  /** 也可以直接给物理参数（会覆盖 duration / bounce） */
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** 起始速度，单位是“每秒走多少进度”。动画被中途打断、接着往新目标走时用它保持连贯 */
  velocity?: number;
}

export interface Spring {
  /** t 秒时的进度（0 → 1，回弹时会短暂超过 1） */
  (t: number): number;
  /** t 秒时的速度（进度 / 秒） */
  velocity(t: number): number;
  /** 进度和终点相差不到 0.1% 并且之后不再超出的时间（秒） */
  readonly settle: number;
  /** 阻尼比 ζ：< 1 回弹，= 1 临界，> 1 过阻尼 */
  readonly dampingRatio: number;
  /** 无阻尼角频率 ω₀（弧度 / 秒） */
  readonly omega: number;
  /**
   * 转成 CSS 的 linear() 缓动，配合 settle 作为时长，能直接用于 transition 和 Web Animations。
   * samples 越多越精确，默认按每 16ms 一个点。
   */
  toCSS(samples?: number): { easing: string; duration: number };
}

const SETTLE_EPSILON = 0.001;

export function spring(options: SpringOptions = {}): Spring {
  let omega: number;
  let zeta: number;

  if (options.stiffness !== undefined || options.damping !== undefined || options.mass !== undefined) {
    const k = options.stiffness ?? 170;
    const c = options.damping ?? 26;
    const m = options.mass ?? 1;
    omega = Math.sqrt(k / m);
    zeta = c / (2 * Math.sqrt(k * m));
  } else {
    const duration = Math.max(options.duration ?? 0.5, 0.01);
    const bounce = Math.min(Math.max(options.bounce ?? 0, -0.99), 0.99);
    omega = (2 * Math.PI) / duration;
    zeta = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
  }

  const v0 = options.velocity ?? 0;
  let position: (t: number) => number;
  let speed: (t: number) => number;
  let settle: number;

  if (Math.abs(zeta - 1) < 1e-6) {
    // 临界阻尼：x = 1 + (C1 + C2·t)·e^(−ωt)，由 x(0)=0、x'(0)=v0 得 C1 = −1、C2 = v0 − ω
    const c1 = -1;
    const c2 = v0 + omega * c1;
    position = (t) => 1 + (c1 + c2 * t) * Math.exp(-omega * t);
    speed = (t) => (c2 - omega * (c1 + c2 * t)) * Math.exp(-omega * t);
    settle = findSettle(position, Math.max(6 / omega, 0.05));
  } else if (zeta < 1) {
    // 欠阻尼（会回弹）：x = 1 + e^(−ζωt)·(C1·cos ω_d t + C2·sin ω_d t)
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const c1 = -1;
    const c2 = (v0 + zeta * omega * c1) / wd;
    position = (t) => 1 + Math.exp(-zeta * omega * t) * (c1 * Math.cos(wd * t) + c2 * Math.sin(wd * t));
    speed = (t) => {
      const e = Math.exp(-zeta * omega * t);
      const cos = Math.cos(wd * t);
      const sin = Math.sin(wd * t);
      return e * ((c2 * wd - zeta * omega * c1) * cos - (c1 * wd + zeta * omega * c2) * sin);
    };
    const amplitude = Math.hypot(c1, c2);
    settle = Math.log(amplitude / SETTLE_EPSILON) / (zeta * omega);
  } else {
    // 过阻尼（慢慢停住）：x = 1 + C1·e^(r1·t) + C2·e^(r2·t)
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega * (zeta - root);
    const r2 = -omega * (zeta + root);
    const c2 = (v0 + r1) / (r2 - r1);
    const c1 = -1 - c2;
    position = (t) => 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
    speed = (t) => c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t);
    settle = findSettle(position, Math.log((Math.abs(c1) + Math.abs(c2)) / SETTLE_EPSILON) / -r1);
  }

  const s = ((t: number) => (t <= 0 ? 0 : t === Infinity ? 1 : position(t))) as Spring;
  Object.defineProperties(s, {
    velocity: { value: (t: number) => (t <= 0 ? v0 : speed(t)) },
    settle: { value: Math.max(settle, 0.01) },
    dampingRatio: { value: zeta },
    omega: { value: omega },
    toCSS: {
      value: (samples?: number) => {
        const duration = s.settle;
        const n = Math.max(2, Math.round(samples ?? duration / 0.016));
        const points: string[] = [];
        for (let i = 0; i <= n; i++) points.push(round(s((duration * i) / n)));
        points[points.length - 1] = '1';
        return { easing: `linear(${points.join(', ')})`, duration: Math.round(duration * 1000) };
      },
    },
  });
  return s;
}

/** 临界 / 过阻尼没有震荡包络，用二分法找“最后一次离终点超过 ε”的时刻 */
function findSettle(position: (t: number) => number, guess: number) {
  let hi = Math.max(guess, 0.01);
  while (Math.abs(position(hi) - 1) > SETTLE_EPSILON && hi < 60) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(position(mid) - 1) > SETTLE_EPSILON) lo = mid;
    else hi = mid;
  }
  return hi;
}

const round = (x: number) => String(Math.round(x * 10000) / 10000);
