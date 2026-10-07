import type { Spring } from '../spring.ts';
import { resolve, springTiming, prefersReducedMotion, lively, type Targets } from './util.ts';

export interface FlipOptions {
  spring?: Spring;
  /** 每个元素依次错开的秒数（最多错开 12 个）。默认 0.018 */
  stagger?: number;
}

/**
 * 布局变化动画（先记位置、再改布局、最后从旧位置弹到新位置）。
 * 用法：await flip('.card', () => list.append(...sorted))
 * 排序、筛选、插入删除、换列都适用；元素换了父节点也没关系，只看它在屏幕上的位置。
 */
export async function flip(targets: Targets, mutate: () => void | Promise<void>, options: FlipOptions = {}) {
  const els = resolve(targets);
  const before = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
  await mutate();
  if (prefersReducedMotion()) return;

  const { spring = lively, stagger = 0.018 } = options;
  const { easing, duration } = springTiming(spring);
  const running: Promise<unknown>[] = [];
  let i = 0;
  for (const el of els) {
    const a = before.get(el);
    const b = el.getBoundingClientRect();
    if (!a || !b.width || !el.isConnected) continue;
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    const sx = a.width / b.width;
    const sy = a.height / b.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    const anim = el.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration, easing, delay: Math.min(i++, 12) * stagger * 1000, fill: 'backwards' },
    );
    running.push(anim.finished.catch(() => {}));
  }
  await Promise.all(running);
}
