import type { Spring } from '../spring.ts';
import { springTiming, prefersReducedMotion, lively } from './util.ts';

export interface MorphOptions {
  spring?: Spring;
  /** 内容换场时的模糊程度（像素），0 表示不模糊。默认 4 */
  blur?: number;
  /** 要做文字换场的子元素，默认是元素本身的所有子节点 */
  content?: Element;
}

/**
 * 尺寸变形：改元素内容（比如按钮文字从“复制”变成“已复制”）时，宽高用弹簧过渡，内容模糊换场。
 * 用法：morph(button, () => { label.textContent = '已复制'; button.classList.add('done'); })
 */
export function morph(el: HTMLElement, mutate: () => void, options: MorphOptions = {}) {
  const w0 = el.offsetWidth;
  const h0 = el.offsetHeight;
  mutate();
  if (prefersReducedMotion()) return;

  const { spring = lively, blur = 4, content } = options;
  const { easing, duration } = springTiming(spring);
  const w1 = el.offsetWidth;
  const h1 = el.offsetHeight;
  if (w0 !== w1 || h0 !== h1) {
    el.animate([{ width: `${w0}px`, height: `${h0}px` }, { width: `${w1}px`, height: `${h1}px` }], { duration, easing });
  }
  const swap = content ?? el;
  const frames: Keyframe[] = [
    { opacity: 0, transform: 'translateY(5px)', filter: blur ? `blur(${blur}px)` : 'none' },
    { opacity: 1, transform: 'none', filter: 'none' },
  ];
  const kids = content ? [content] : (Array.from(swap.children) as HTMLElement[]);
  (kids.length ? kids : [swap]).forEach((k) => k.animate(frames, { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }));
}
