// 排行赛跑：六个标签的热度逐月增长，柱子按当前数值实时排序，名次变化时柱子带着弹簧换位；
// 坐标轴跟着最大值缩放，右下角是月份。最后柱子收回、名次复位，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mix, type Key } from '../track.ts';
import { easeInOut, easeOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, type SceneDef } from './util.ts';

const D = 12;
const NAMES = {
  zh: ['自拍', '抓拍', '换装', '胶片感', '视频', '古风'],
  en: ['Selfie', 'Candid', 'Outfit swap', 'Film look', 'Video', 'Classical'],
};
const COLORS = ['#ff375f', '#ff9f0a', '#30d158', '#64d2ff', '#5e5ce6', '#bf5af2'];
// 每个月各标签的热度
const V = [
  [120, 90, 60, 40, 30, 20],
  [180, 170, 110, 60, 80, 30],
  [230, 260, 190, 90, 150, 60],
  [280, 320, 300, 140, 260, 120],
  [330, 360, 420, 190, 380, 210],
  [380, 400, 520, 240, 560, 330],
];
const MONTHS = { zh: ['2026.05', '2026.06', '2026.07', '2026.08', '2026.09', '2026.10'], en: ['May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'] };
const P = [1.1, 2.6, 4.1, 5.6, 7.1, 8.6]; // 到达每个月数值的时刻
const STEP = 1.5;
const GROW = [0.3, 1.1];
const SHRINK = [10.2, 11.0];
const ROW_H = 42;
const TOP = 96;
const BAR_X = 150;
const BAR_MAX = 400;

/** t 时刻第 i 个标签的数值 */
function valueAt(t: number, i: number) {
  if (t < GROW[0]!) return 0;
  if (t < GROW[1]!) return V[0]![i]! * easeOut((t - GROW[0]!) / (GROW[1]! - GROW[0]!));
  if (t >= SHRINK[1]!) return 0;
  if (t >= SHRINK[0]!) return V[5]![i]! * (1 - easeInOut((t - SHRINK[0]!) / (SHRINK[1]! - SHRINK[0]!)));
  for (let k = 0; k < P.length - 1; k++) {
    if (t < P[k + 1]!) return mix(V[k]![i]!, V[k + 1]![i]!, easeInOut(clamp((t - P[k]!) / STEP)));
  }
  return V[5]![i]!;
}

/** 按数值从大到小的名次；并列时按原来的顺序 */
function ranksAt(t: number, fallback: number[]) {
  const vals = V[0]!.map((_, i) => valueAt(t, i));
  const order = vals.map((_, i) => i).sort((a, b) => vals[b]! - vals[a]! || fallback[a]! - fallback[b]!);
  const rank: number[] = [];
  order.forEach((idx, r) => (rank[idx] = r));
  return rank;
}

export const barrace: SceneDef = {
  title: '排行赛跑',
  category: '数据',
  description: '六个标签的热度逐月增长，柱子按数值实时排序，名次一变就带着弹簧换位，坐标轴跟着最大值缩放。',
  tags: ['track', 'spring', '实时排序'],
  tone: 'light',
  en: {
    title: 'Bar chart race',
    description: 'Six tags grow month by month. Bars re-sort by value as they go and spring into their new places when the ranking changes, while the axis rescales to the leader.',
    tags: ['track', 'spring', 'live sorting'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const names = NAMES[en ? 'en' : 'zh'];
    const months = MONTHS[en ? 'en' : 'zh'];
    const stage = createStage(host, 'light', 'nm-race');
    injectCSS(
      'nm-race',
      `.nm-race{background:linear-gradient(180deg,#fff,#f2f3f6)}
.nm-race .h{position:absolute;left:40px;top:30px;font-size:20px;font-weight:700;letter-spacing:-.01em}
.nm-race .s{position:absolute;left:40px;top:58px;font-size:12px;color:#86868b}
.nm-race .grid{position:absolute;top:${TOP - 8}px;height:${ROW_H * 6 + 4}px;width:1px;background:rgba(0,0,0,.06)}
.nm-race .row{position:absolute;left:0;right:0;height:${ROW_H}px}
.nm-race .row .n{position:absolute;left:30px;width:${BAR_X - 42}px;top:0;line-height:30px;text-align:right;font-size:14px;font-weight:600}
.nm-race .row .b{position:absolute;left:${BAR_X}px;top:2px;height:26px;border-radius:7px;transform-origin:0 50%}
.nm-race .row .v{position:absolute;top:0;line-height:30px;font-size:13px;font-weight:600;color:#6e6e73;font-variant-numeric:tabular-nums}
.nm-race .month{position:absolute;right:40px;bottom:30px;font-size:40px;font-weight:800;letter-spacing:-.03em;color:rgba(29,29,31,.16);font-variant-numeric:tabular-nums}`,
    );
    el('div', 'h', stage, options.text ?? (en ? 'Prompt popularity by tag' : '各类提示词热度'));
    el('div', 's', stage, en ? 'Monthly heat score' : '每月热度分');
    const grids = [0, 1, 2, 3].map(() => el('div', 'grid', stage));
    const rows = names.map((name, i) => {
      const row = el('div', 'row', stage);
      el('div', 'n', row, name);
      const bar = el('div', 'b', row);
      bar.style.background = COLORS[i]!;
      const v = el('div', 'v', row);
      return { row, bar, v };
    });
    const month = el('div', 'month', stage);

    // 名次：每 0.05 秒算一次排序，名次一变就加一个弹簧关键帧；柱子收回后名次复位到第一个月的顺序
    const initial = ranksAt(GROW[1]!, [0, 1, 2, 3, 4, 5]);
    const keys: Key[][] = initial.map(() => []);
    let prev = initial;
    for (let t = GROW[1]!; t < SHRINK[0]!; t += 0.05) {
      const r = ranksAt(t, prev);
      r.forEach((v, i) => v !== prev[i] && keys[i]!.push([t, v]));
      prev = r;
    }
    initial.forEach((v, i) => v !== prev[i] && keys[i]!.push([SHRINK[1]! + 0.05, v]));
    const swap = spring({ duration: 0.55, bounce: 0.25 });
    const ranks = initial.map((r0, i) => track(r0, keys[i]!, swap));

    const render = (t: number) => {
      const vals = rows.map((_, i) => valueAt(t, i));
      // 坐标轴：最大值占 BAR_MAX 宽，至少按 150 算，避免开头柱子太长
      const scale = BAR_MAX / Math.max(150, Math.max(...vals) * 1.05);
      const step = Math.max(150, Math.max(...vals) * 1.05) / 4;
      grids.forEach((g, k) => (g.style.left = `${BAR_X + (k + 1) * step * scale}px`));
      const visible = clamp(Math.min((t - GROW[0]!) / 0.3, (SHRINK[1]! - t) / 0.3));
      rows.forEach(({ row, bar, v }, i) => {
        row.style.transform = `translateY(${TOP + ranks[i]!(t) * ROW_H}px)`;
        row.style.opacity = String(0.25 + 0.75 * visible);
        const w = vals[i]! * scale;
        bar.style.width = `${Math.max(0, w)}px`;
        v.style.left = `${BAR_X + w + 8}px`;
        v.textContent = Math.round(vals[i]!).toLocaleString('en-US');
        v.style.opacity = String(visible);
      });
      // 月份：取最近经过的那个月
      let m = 0;
      P.forEach((p, k) => t >= p - STEP / 2 && (m = k));
      month.textContent = months[m]!;
      month.style.opacity = String(visible);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 9 });
  },
};
