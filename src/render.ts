import type { Timeline } from './timeline.ts';

export interface RenderInfo {
  duration: number;
  seek(t: number): Promise<void>;
}

declare global {
  // 给导出命令用的钩子
  var __noahMotion: RenderInfo | undefined;
}

/**
 * 让 `npx noah-motion render` 能逐帧导出这条时间轴。
 * 页面地址带 ?render 时会自动暂停播放，由导出命令一帧一帧 seek。
 */
export function exposeForRender(tl: Timeline) {
  const rendering = typeof location !== 'undefined' && new URLSearchParams(location.search).has('render');
  if (rendering) tl.pause();
  globalThis.__noahMotion = {
    duration: tl.duration,
    async seek(t) {
      tl.pause();
      tl.seek(t);
      // 等浏览器把这一帧真正画出来再截图
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    },
  };
  return rendering;
}
