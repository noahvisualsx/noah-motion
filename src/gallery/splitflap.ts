// 翻页站牌：两行翻页牌（split-flap），每一格由上下两片组成。换词时各格按列依次开始，
// 先随机翻过几个字，再停在新字上，最后一片落下时带一点弹簧回弹。三组词轮流出现，首尾相接。
import { spring } from '../spring.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, seeded, type SceneDef } from './util.ts';

const D = 12;
const COLS = 12;
const ROWS = 2;
const CW = 44;
const CH = 66;
const GAP = 4;
const FLIP = 0.075; // 翻一片用的秒数
const SETTLE = 0.35; // 最后一片落下后的回弹时间
const CHANGES = [0.4, 4.4, 8.4]; // 换到第 0、1、2 组词的时刻；开头显示的是第 2 组，循环才接得上
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PHRASES = {
  zh: [
    ['每个人都有', '自己的闪光点'],
    ['把时间', '写成函数'],
    ['下一站', '灵感'],
  ],
  en: [
    ['EVERY FRAME', 'IS COMPUTED'],
    ['TIME IS A', 'FUNCTION'],
    ['NEXT STOP', 'INSPIRATION'],
  ],
};

/** 一组词排成 2 行 × 12 格，每行居中 */
function layout(lines: string[]) {
  return Array.from({ length: ROWS }, (_, r) => {
    const chars = [...(lines[r] ?? '')].slice(0, COLS);
    const pad = Math.floor((COLS - chars.length) / 2);
    return Array.from({ length: COLS }, (_, c) => chars[c - pad] ?? ' ');
  });
}

export const splitflap: SceneDef = {
  title: '翻页站牌',
  category: '文字',
  description: '两行翻页牌换词时按列依次翻动，先随机翻过几个字再停到新字上，最后一片落下时带一点回弹。',
  tags: ['spring', 'stagger', '3D'],
  tone: 'dark',
  en: {
    title: 'Split-flap board',
    description: 'A two-row split-flap board changes words column by column, riffling through a few random letters before landing, with a small bounce on the last flap.',
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const phrases = PHRASES[en ? 'en' : 'zh'].map((p) => [...p]);
    // text 用 / 分行、用 | 分组：'第一行/第二行|下一组第一行/第二行'，最多三组，不够三组时轮流重复
    if (options.text) {
      const groups = options.text.split('|').map((g) => g.split(/\s*[/\n]\s*/).slice(0, ROWS));
      groups.slice(0, 3).forEach((g, i) => (phrases[i] = g));
      for (let i = groups.length; i < 3 && groups.length > 1; i++) phrases[i] = groups[i % groups.length]!;
    }
    const grids = phrases.map(layout);
    const pool = en ? [...LATIN] : [...new Set(phrases.flat().join('').replace(/\s/g, ''))];

    const stage = createStage(host, 'dark', 'nm-flap');
    const boardW = COLS * CW + (COLS - 1) * GAP;
    const boardH = ROWS * CH + (ROWS - 1) * 10;
    injectCSS(
      'nm-flap',
      `.nm-flap{background:radial-gradient(90% 80% at 50% 40%,#1a1a1d,#08080a)}
.nm-flap .label{position:absolute;left:${(640 - boardW) / 2}px;top:${200 - boardH / 2 - 34}px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.2em;color:#ffb340}
.nm-flap .label i{width:7px;height:7px;border-radius:50%;background:#ffb340;box-shadow:0 0 8px #ffb340}
.nm-flap .cell{position:absolute;width:${CW}px;height:${CH}px;perspective:320px}
.nm-flap .half{position:absolute;left:0;right:0;height:${CH / 2}px;overflow:hidden}
.nm-flap .top{top:0;border-radius:6px 6px 0 0;background:linear-gradient(180deg,#2a2a2d,#1f1f22)}
.nm-flap .bot{top:${CH / 2}px;border-radius:0 0 6px 6px;background:linear-gradient(180deg,#1b1b1e,#151517)}
.nm-flap .half span{position:absolute;left:0;right:0;top:0;height:${CH}px;line-height:${CH}px;text-align:center;font-size:${en ? 40 : 34}px;font-weight:700;color:#f2f2f2}
.nm-flap .bot span{top:-${CH / 2}px}
.nm-flap .flap{z-index:2;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.nm-flap .ft{transform-origin:50% 100%}
.nm-flap .fb{transform-origin:50% 0}
.nm-flap .seam{position:absolute;left:0;right:0;top:${CH / 2 - 0.5}px;height:1px;background:rgba(0,0,0,.75);z-index:3}`,
    );
    const label = el('div', 'label', stage);
    el('i', '', label);
    el('span', '', label, en ? 'NOW SHOWING' : '翻页站牌 · SPLIT-FLAP');

    const land = spring({ duration: SETTLE, bounce: 0.45 });

    type Change = { start: number; seq: string[] };
    type Half = { h: HTMLElement; s: HTMLElement };
    // 每格四层：静止的上半、下半，以及翻动中的上片、下片
    const cells = [] as { changes: Change[]; top: Half; bot: Half; ft: Half; fb: Half }[];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const node = el('div', 'cell', stage);
        node.style.left = `${(640 - boardW) / 2 + c * (CW + GAP)}px`;
        node.style.top = `${200 - boardH / 2 + 12 + r * (CH + 10)}px`;
        const half = (cls: string) => {
          const h = el('div', `half ${cls}`, node);
          return { h, s: el('span', '', h) };
        };
        const ts = half('top');
        const bs = half('bot');
        const ft = half('top flap ft');
        const fb = half('bot flap fb');
        el('i', 'seam', node);

        // 每次换词：从上一组的字翻到这一组的字；字没变的格子不翻
        const changes = CHANGES.map((at, j) => {
          const from = grids[(j + grids.length - 1) % grids.length]![r]![c]!;
          const to = grids[j]![r]![c]!;
          const rnd = seeded(1000 + j * 97 + r * 13 + c);
          const n = from === to ? 0 : 3 + Math.floor(rnd() * 6);
          const seq = [from];
          for (let k = 1; k < n; k++) seq.push(pool[Math.floor(rnd() * pool.length)] ?? ' ');
          if (n) seq.push(to);
          return { start: at + c * 0.045 + r * 0.1, seq };
        });
        cells.push({ changes, top: ts, bot: bs, ft, fb });
      }
    }

    const setText = (span: Element, ch: string) => {
      if (span.textContent !== ch) span.textContent = ch;
    };

    const render = (t: number) => {
      for (const cell of cells) {
        // 最近一次已经开始的换词；还没开始时显示最后一组（上一轮留下的）
        let ch: Change | undefined;
        for (const x of cell.changes) if (t >= x.start) ch = x;
        const last = cell.changes[cell.changes.length - 1]!;
        const seq = ch?.seq ?? [last.seq[last.seq.length - 1]!];
        const n = seq.length - 1;
        const local = ch ? t - ch.start : Infinity;
        const k = Math.floor(local / FLIP);
        const lastFlipMid = (n - 0.5) * FLIP;

        let cur = seq[n]!;
        let next = cur;
        let topAngle: number | null = null;
        let botAngle: number | null = null;
        if (n > 0 && k < n) {
          cur = seq[k]!;
          next = seq[k + 1]!;
          const ph = local / FLIP - k;
          if (ph < 0.5) topAngle = -180 * ph;
          else if (k < n - 1) botAngle = 180 * (1 - ph);
          else botAngle = 90 * (1 - land(local - lastFlipMid));
        } else if (n > 0 && local - lastFlipMid < SETTLE) {
          // 最后一片已经落下，还在回弹
          cur = seq[n - 1]!;
          next = seq[n]!;
          botAngle = 90 * (1 - land(local - lastFlipMid));
        }

        setText(cell.top.s, next); // 上半：新字（翻动时被翻起的旧字上片盖住）
        setText(cell.bot.s, topAngle === null && botAngle === null ? next : cur); // 下半：旧字（被落下的新字下片盖住）
        cell.ft.h.style.display = topAngle === null ? 'none' : '';
        cell.fb.h.style.display = botAngle === null ? 'none' : '';
        if (topAngle !== null) {
          setText(cell.ft.s, cur);
          cell.ft.h.style.transform = `rotateX(${topAngle}deg)`;
          cell.ft.h.style.filter = `brightness(${1 - (-topAngle / 90) * 0.45})`;
        }
        if (botAngle !== null) {
          setText(cell.fb.s, next);
          cell.fb.h.style.transform = `rotateX(${botAngle}deg)`;
          cell.fb.h.style.filter = `brightness(${0.6 + 0.4 * (1 - Math.min(1, Math.abs(botAngle) / 90))})`;
        }
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.6 });
  },
};
