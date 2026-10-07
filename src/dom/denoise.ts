import { resolve, prefersReducedMotion, type Targets } from './util.ts';

export interface DenoiseOptions {
  /** 去噪分几步完成。默认 7 */
  steps?: number;
  /** 秒。默认 1.25 */
  duration?: number;
  /** 起始模糊（像素）。默认 18 */
  blur?: number;
  /** 噪点强度 0~1。默认 0.95 */
  grain?: number;
}

/**
 * 生成式出现：图片像被 AI 一轮轮去噪那样，从模糊加噪点分几步变清晰。
 * 目标是图片的容器（里面有 img 或 video），会自动等图片解码完再开始。
 * 噪点是用 canvas 画的灰度随机点，叠在图片上方，用 soft-light 混合。
 */
export async function denoise(targets: Targets, options: DenoiseOptions = {}) {
  const boxes = resolve(targets);
  if (prefersReducedMotion()) return;
  const { steps = 7, duration = 1.25, blur = 18, grain = 0.95 } = options;
  const ms = duration * 1000;

  await Promise.all(
    boxes.map(async (box) => {
      const media = box.querySelector<HTMLElement>('img, video, canvas') ?? box;
      if (media instanceof HTMLImageElement && !media.complete) await media.decode().catch(() => {});

      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.style.overflow = 'hidden';
      const layer = document.createElement('div');
      layer.setAttribute('aria-hidden', 'true');
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        backgroundImage: `url(${grainTile()})`,
        backgroundSize: '128px',
        mixBlendMode: 'soft-light',
        opacity: String(grain),
      });
      box.append(layer);

      const stepped = `steps(${steps}, end)`;
      const anims = [
        media.animate(
          [{ filter: `blur(${blur}px) saturate(0.4) brightness(1.06)` }, { filter: 'blur(0px) saturate(1) brightness(1)' }],
          { duration: ms, easing: stepped },
        ),
        media.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], {
          duration: ms * 1.2,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }),
        layer.animate([{ opacity: grain }, { opacity: 0 }], { duration: ms, easing: stepped, fill: 'forwards' }),
        // 噪点每一步换个位置，看起来像每轮重新采样
        layer.animate(
          Array.from({ length: steps + 1 }, () => ({ backgroundPosition: `${rand(128)}px ${rand(128)}px` })),
          { duration: ms, easing: stepped },
        ),
      ];
      await Promise.all(anims.map((a) => a.finished.catch(() => {})));
      layer.remove();
    }),
  );
}

let tile = '';
function grainTile() {
  if (tile) return tile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return (tile = c.toDataURL());
}

const rand = (n: number) => Math.round(Math.random() * n);
