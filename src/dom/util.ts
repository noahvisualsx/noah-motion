import { prefersReducedMotion } from '../timeline.ts';
import { spring, type Spring } from '../spring.ts';

export type Targets = string | Element | Iterable<Element> | ArrayLike<Element>;

export function resolve(targets: Targets, root: ParentNode = document): HTMLElement[] {
  if (typeof targets === 'string') return [...root.querySelectorAll<HTMLElement>(targets)];
  if (targets instanceof Element) return [targets as HTMLElement];
  return Array.from(targets as ArrayLike<Element>) as HTMLElement[];
}

export { prefersReducedMotion };

/** 把弹簧变成 Web Animations 的时长和缓动；同一条弹簧只算一次 */
const cache = new WeakMap<Spring, { easing: string; duration: number }>();
export function springTiming(s: Spring) {
  let t = cache.get(s);
  if (!t) cache.set(s, (t = s.toCSS()));
  return t;
}

export const gentle = spring({ duration: 0.6, bounce: 0.08 });
export const lively = spring({ duration: 0.55, bounce: 0.22 });
