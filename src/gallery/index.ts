/**
 * noah-motion/gallery：用 noah-motion 做的原创动画场景，一行代码挂到页面上。
 *
 *   import { scenes } from 'noah-motion/gallery';
 *   const tl = scenes.aurora.mount(document.querySelector('#box'), { text: 'hello' });
 *   tl.pause(); tl.seek(2);
 *
 * 容器需要有确定的宽高，推荐 aspect-ratio: 16 / 10。每个场景都是时间的纯函数，可以拖动，也可以导出视频。
 */
import { aurora } from './aurora.ts';
import { particles } from './particles.ts';
import { breathe } from './breathe.ts';
import { fold } from './fold.ts';
import { odometer } from './odometer.ts';
import { wave } from './wave.ts';
import { ripple } from './ripple.ts';
import { layouts } from './layouts.ts';
import { bauhaus } from './bauhaus.ts';
import { metaballs } from './metaballs.ts';
import { orbits } from './orbits.ts';
import { chart } from './chart.ts';
import { seal } from './seal.ts';
import { kaleido } from './kaleido.ts';
import { equalizer } from './equalizer.ts';
import { plane } from './plane.ts';
import { tiles } from './tiles.ts';
import { hangers } from './hangers.ts';
import { chat } from './chat.ts';
import { petals } from './petals.ts';
import { route } from './route.ts';
import { splitflap } from './splitflap.ts';
import { decode } from './decode.ts';
import { pill } from './pill.ts';
import { controls } from './controls.ts';
import { barrace } from './barrace.ts';
import { contrib } from './contrib.ts';
import { modular } from './modular.ts';
import { morph } from './morph.ts';
import { daylight } from './daylight.ts';
import { fireworks } from './fireworks.ts';
import type { SceneDef } from './util.ts';

// 排列顺序就是作品廊里的顺序：深浅交错、类型错开
export const scenes = {
  aurora,
  pill,
  chat,
  fireworks,
  particles,
  daylight,
  tiles,
  barrace,
  layouts,
  splitflap,
  seal,
  controls,
  odometer,
  modular,
  kaleido,
  morph,
  fold,
  decode,
  petals,
  contrib,
  ripple,
  chart,
  bauhaus,
  equalizer,
  metaballs,
  plane,
  wave,
  orbits,
  hangers,
  route,
  breathe,
} satisfies Record<string, SceneDef>;

export type SceneName = keyof typeof scenes;
export type { SceneDef, SceneOptions, Tone, Category, Lang } from './util.ts';
export { CATEGORY_EN } from './util.ts';
export { aurora, particles, layouts, odometer, fold, ripple, bauhaus, metaballs, wave, orbits, breathe, chart, seal, kaleido, equalizer, plane, tiles, hangers, chat, petals, route };
export { splitflap, decode, pill, controls, barrace, contrib, modular, morph, daylight, fireworks };
