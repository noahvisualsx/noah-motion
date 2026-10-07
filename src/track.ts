/**
 * 轨道：一个数值随时间变化的完整剧本。
 *
 * 写法：track(初始值, [[时间, 目标值], [时间, 目标值, 自己的弹簧], …], 默认弹簧)
 *
 * 每次改目标都会从“那一刻”起动一条新弹簧，所有弹簧叠加：
 *   value(t) = 初始值 + Σ (第 i 个目标 − 上一个目标) × 弹簧ᵢ(t − 时间ᵢ)
 * 所以前一段还没停稳、下一段就开始时，运动自然衔接；整条轨道仍是 t 的纯函数。
 */
import { spring as makeSpring, type Spring } from './spring.ts';

export type Key = readonly [time: number, value: number] | readonly [time: number, value: number, motion: Spring];

export interface Track {
  (t: number): number;
  /** t 时刻的速度（单位 / 秒） */
  velocity(t: number): number;
  /** 最后一段弹簧停稳的时间 */
  readonly end: number;
}

const DEFAULT = makeSpring({ duration: 0.55, bounce: 0.12 });

export function track(initial: number, keys: readonly Key[], motion: Spring = DEFAULT): Track {
  const sorted = [...keys].sort((a, b) => a[0] - b[0]);
  const segments: { at: number; delta: number; s: Spring }[] = [];
  let previous = initial;
  for (const key of sorted) {
    const [at, value] = key;
    segments.push({ at, delta: value - previous, s: key[2] ?? motion });
    previous = value;
  }

  const fn = ((t: number) => {
    let v = initial;
    for (const seg of segments) if (t > seg.at) v += seg.delta * seg.s(t - seg.at);
    return v;
  }) as Track;

  Object.defineProperties(fn, {
    velocity: {
      value: (t: number) => {
        let v = 0;
        for (const seg of segments) if (t > seg.at) v += seg.delta * seg.s.velocity(t - seg.at);
        return v;
      },
    },
    end: { value: segments.reduce((m, seg) => Math.max(m, seg.at + seg.s.settle), 0) },
  });
  return fn;
}

// ---------- 小工具 ----------

export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));

/** 线性插值 */
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** 把 [inMin, inMax] 映射到 [outMin, outMax]，默认夹在范围内 */
export const remap = (x: number, inMin: number, inMax: number, outMin = 0, outMax = 1, clamped = true) => {
  const p = (x - inMin) / (inMax - inMin);
  return mix(outMin, outMax, clamped ? clamp(p) : p);
};

/** 两个十六进制颜色按 p 混合，返回 rgb()。在 sRGB 里直接插值，够用且便宜 */
export function mixColor(a: string, b: string, p: number) {
  const ca = hex(a);
  const cb = hex(b);
  const c = ca.map((v, i) => Math.round(mix(v, cb[i] ?? v, clamp(p))));
  return `rgb(${c.join(', ')})`;
}

function hex(h: string) {
  const s = h.replace('#', '');
  const full = s.length === 3 ? [...s].map((ch) => ch + ch).join('') : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
