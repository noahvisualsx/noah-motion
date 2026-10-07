/**
 * 时间轴：把一个 render(t) 函数变成可播放、暂停、拖动、循环的动画。
 *
 * render(t) 应该只根据 t 设置画面（不保存上一帧的状态），这样：
 *   - 拖到任意时间都能立刻得到正确画面；
 *   - 用 noah-motion 的 render 命令逐帧导出视频时，每一帧和网页上看到的完全一致。
 */

export interface TimelineOptions {
  /** 总时长（秒） */
  duration: number;
  /** 根据时间画出一帧 */
  render: (t: number) => void;
  /** 播完从头再来。默认 false */
  loop?: boolean;
  /** 创建后立刻播放。默认 true */
  autoplay?: boolean;
  /** 播放速度倍率。默认 1 */
  speed?: number;
  /** 传入画面所在的元素：滚出屏幕时自动暂停，回来接着播，省电 */
  target?: Element;
  /**
   * 用户开了“减少动态效果”时停在哪一秒。默认停在最后一帧；
   * 传 false 表示照常播放（只有动画本身就是内容、不播就看不懂时才这样做）。
   */
  reducedMotion?: number | false;
  /** 播放结束（非循环）时调用 */
  onEnd?: () => void;
}

export interface Timeline {
  play(): void;
  pause(): void;
  /** 跳到第 t 秒并立即画出来 */
  seek(t: number): void;
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  /** 停止并解除所有监听 */
  destroy(): void;
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function timeline(options: TimelineOptions): Timeline {
  const { duration, render, loop = false, speed = 1, target, onEnd } = options;
  let time = 0;
  let playing = false;
  let visible = true;
  let raf = 0;
  let last = 0;

  const draw = () => render(time);

  const frame = (now: number) => {
    raf = 0;
    if (!playing || !visible) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0; // 切回标签页时不会一下子跳很远
    last = now;
    time += dt * speed;
    if (time >= duration) {
      if (loop) time %= duration;
      else {
        time = duration;
        playing = false;
        draw();
        onEnd?.();
        return;
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (!raf && playing && visible) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  let observer: IntersectionObserver | undefined;
  if (target && typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      kick();
    });
    observer.observe(target);
  }

  const api: Timeline = {
    play() {
      if (time >= duration && !loop) time = 0;
      playing = true;
      kick();
    },
    pause() {
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    seek(t) {
      time = loop ? ((t % duration) + duration) % duration : Math.min(Math.max(t, 0), duration);
      draw();
    },
    get time() {
      return time;
    },
    get duration() {
      return duration;
    },
    get playing() {
      return playing;
    },
    destroy() {
      api.pause();
      observer?.disconnect();
    },
  };

  const still = options.reducedMotion ?? duration;
  if (still !== false && prefersReducedMotion()) {
    api.seek(still);
  } else {
    draw();
    if (options.autoplay ?? true) api.play();
  }
  return api;
}
