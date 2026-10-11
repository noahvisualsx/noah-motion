// 翻页站牌：每一格都按真实的翻页机构来画。上半片带着旧字的上半截绕中间的铰链向前翻下，
// 露出后面新字的上半截；翻过一半时转到背面，背面正好印着新字的下半截，落下来盖住旧字的下半截。
// 翻片是真的 3D 旋转（整块牌共用一个透视中心），转动时正面渐暗、背面迎光一亮，下半格被落下的翻片投上阴影。
// 换词时按列错峰开始，先快速翻过几张（英文按字母表顺序，中文随机），最后一张用弹簧落下、碰到底轻轻弹一下。
// 三组词轮流，开头显示的是最后一组，首尾相接。整块牌挂在两根吊杆上，右上角两格小翻牌显示第几组。
import { spring } from '../spring.ts';
import { clamp } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, injectCSS, seeded, smooth, type SceneDef } from './util.ts';

const D = 12;
const COLS = 12;
const ROWS = 2;
const CW = 44;
const CH = 78;
const GAP = 4;
const ROW_GAP = 14;
const FR = 0.068; // 快速翻过一张用的秒数
// 英文翻牌的字鼓顺序：从当前字往后一张张翻到目标字
const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-&/';
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

const BOARD_W = COLS * CW + (COLS - 1) * GAP;
const BOARD_H = ROWS * CH + (ROWS - 1) * ROW_GAP;
const PAD = 18; // 外壳内边距
const HEAD = 34; // 外壳顶上标题栏的高度
const CASE_W = BOARD_W + PAD * 2;
const CASE_H = BOARD_H + PAD * 2 + HEAD;
const CASE_X = (640 - CASE_W) / 2;
const CASE_Y = (400 - CASE_H) / 2;
const EYE = 300; // 透视距离：每格自己一个视点，翻片转到眼前时近端明显变宽

const isCJK = (ch: string) => /[⺀-鿿豈-﫿　-〿＀-￯]/.test(ch);

/** 一组词排成 2 行 × 12 格，每行居中 */
function layout(lines: string[]) {
  return Array.from({ length: ROWS }, (_, r) => {
    const chars = [...(lines[r] ?? '')].slice(0, COLS);
    const pad = Math.floor((COLS - chars.length) / 2);
    return Array.from({ length: COLS }, (_, c) => chars[c - pad] ?? ' ');
  });
}

/** 一次换字要翻过的序列（含起止）：英文沿字鼓顺序往后翻，中文从词库里随机抽几张 */
function sequence(from: string, to: string, pool: string[], rnd: () => number, drum = DRUM) {
  if (from === to) return [from];
  const seq = [from];
  const L = drum.length;
  const ti = drum.indexOf(to.toUpperCase());
  if (ti >= 0 && !isCJK(from)) {
    const oi = drum.indexOf(from.toUpperCase());
    const dist = oi < 0 ? L : (ti - oi + L) % L;
    // 翻到空白时直接翻一张，不然要一路翻过字鼓末尾的一串符号，像乱码
    const n = Math.min(dist, to === ' ' ? 1 : 3 + Math.floor(rnd() * 6));
    for (let k = n - 1; k >= 1; k--) seq.push(drum[(ti - k + L) % L]!);
  } else {
    const n = to === ' ' ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
    for (let k = 1; k < n; k++) {
      let ch = pool[Math.floor(rnd() * pool.length)] ?? ' ';
      if (ch === seq[seq.length - 1] || ch === to) ch = pool[(pool.indexOf(ch) + 1) % pool.length] ?? ' ';
      seq.push(ch);
    }
  }
  seq.push(to);
  return seq;
}

export const splitflap: SceneDef = {
  title: '翻页站牌',
  category: '文字',
  description: '像机场的翻页牌：上半片带着旧字翻下来，背面就是新字的下半截；3D 翻转带明暗和投影，按列错峰，先快速翻过几张再用弹簧落定、轻轻回弹。',
  tags: ['spring', 'stagger', '3D 翻转', '确定性随机'],
  tone: 'dark',
  en: {
    title: 'Split-flap board',
    description:
      'An airport-style split-flap board: the top flap falls carrying the old letter, and its back is the bottom half of the new one. Real 3D flaps with shading and cast shadows ripple column by column, riffle through the drum and settle on a spring with a small bounce.',
    tags: ['spring', 'stagger', '3D flip', 'deterministic noise'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    let phrases = PHRASES[en ? 'en' : 'zh'].map((p) => [...p]);
    // text 用 / 分行、用 | 分组：'第一行/第二行|下一组第一行/第二行'，最多三组，轮流出现。
    // 只有一组时，牌面在空白和这组字之间来回翻
    const single = !!options.text && !options.text.includes('|');
    if (options.text) {
      const groups = options.text.split('|').slice(0, 3).map((g) => g.split(/\s*[/\n]\s*/).slice(0, ROWS));
      phrases = single ? [groups[0]!, ['']] : groups;
    }
    const grids = phrases.map(layout);
    // 每组出现的时刻：一轮里平均分开；开头显示的是最后一组，循环才接得上
    const changes = single ? [0.4, 9.6] : phrases.map((_, j) => 0.4 + (j * D) / phrases.length);
    // 中文随机翻过的字从这几组词里取（中英混排时，英文字母走字鼓顺序，不进这个池子）
    const cjkPool = [...new Set(phrases.flat().join('').replace(/\s/g, ''))].filter(isCJK);
    const pool = cjkPool.length > 3 ? cjkPool : [...'光影时间函数弹簧灵感'];

    const stage = createStage(host, 'dark', 'nm-flap');
    injectCSS(
      'nm-flap',
      `.nm-flap{background:
  radial-gradient(70px 46px at 9% 3%,rgba(255,206,150,.13),transparent 70%),
  radial-gradient(90px 50px at 35% 0%,rgba(255,214,170,.08),transparent 70%),
  radial-gradient(60px 40px at 74% 2%,rgba(190,206,255,.08),transparent 70%),
  radial-gradient(80px 46px at 95% 6%,rgba(255,206,150,.1),transparent 70%),
  radial-gradient(120% 90% at 50% 0%,#26262b 0%,#141416 55%,#0a0a0b 100%)}
.nm-flap .rod{position:absolute;top:-4px;width:4px;height:${CASE_Y + 8}px;border-radius:2px;background:linear-gradient(90deg,#1a1a1d,#4a4a50 45%,#232326)}
.nm-flap .rod::after{content:"";position:absolute;left:-5px;bottom:2px;width:14px;height:8px;border-radius:2px 2px 0 0;background:linear-gradient(180deg,#36363b,#202023)}
.nm-flap .case{position:absolute;left:${CASE_X}px;top:${CASE_Y}px;width:${CASE_W}px;height:${CASE_H}px;border-radius:16px;
  background:linear-gradient(180deg,#19191c,#111113 40%,#0e0e10);
  box-shadow:0 40px 70px -20px rgba(0,0,0,.75),0 12px 24px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.07),inset 0 0 0 1px rgba(255,255,255,.035)}
.nm-flap .screw{position:absolute;width:5px;height:5px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#4a4a50,#1c1c1f 70%);box-shadow:0 1px 0 rgba(255,255,255,.05)}
.nm-flap .head{position:absolute;left:${PAD}px;right:${PAD}px;top:12px;height:20px;display:flex;align-items:center;justify-content:space-between;
  font-size:11px;font-weight:700;letter-spacing:.2em;color:#ffb340}
.nm-flap .head b{display:flex;align-items:center;gap:8px;font-weight:700}
.nm-flap .head b i{width:6px;height:6px;border-radius:50%;background:#ffb340;box-shadow:0 0 8px #ffb340}
.nm-flap .head .set{display:flex;align-items:center;gap:7px;color:#6e6e73;letter-spacing:.16em}
.nm-flap .head .slot{position:relative;display:block;width:37px;height:26px}
.nm-flap .rule{position:absolute;left:${PAD}px;right:${PAD}px;top:${HEAD + 4}px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.07) 20%,rgba(255,255,255,.07) 80%,transparent)}
.nm-flap .cell{position:absolute}
.nm-flap .cell::before{content:"";position:absolute;inset:-2px;border-radius:7px;background:#060607;box-shadow:inset 0 1px 2px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.04)}
.nm-flap .half,.nm-flap .face{position:absolute;left:0;right:0;overflow:hidden}
.nm-flap .t{top:0;border-radius:5px 5px 1.5px 1.5px;background:linear-gradient(180deg,#303034,#26262a);box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.nm-flap .b{border-radius:1.5px 1.5px 5px 5px;background:linear-gradient(180deg,#222225,#1b1b1e 70%,#171719);box-shadow:inset 0 -1px 0 rgba(0,0,0,.6)}
.nm-flap .half.b{bottom:0}
.nm-flap .half span,.nm-flap .face span{position:absolute;left:0;right:0;top:0;text-align:center;font-weight:700;color:#efece4;white-space:pre;text-shadow:0 1px 0 rgba(0,0,0,.45)}
.nm-flap .b span{transform:translateY(-50%)}
.nm-flap .leaf{position:absolute;left:0;right:0;top:0;transform-origin:50% 100%;transform-style:preserve-3d;will-change:transform}
.nm-flap .face{inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.nm-flap .face.b{transform:rotateX(180deg)}
.nm-flap .ov{position:absolute;inset:0;opacity:0;pointer-events:none}
.nm-flap .dark{background:#000}
.nm-flap .glint{background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.04))}
.nm-flap .st{background:linear-gradient(0deg,rgba(0,0,0,.7),rgba(0,0,0,.15) 70%,rgba(0,0,0,0))}
.nm-flap .sb{background:linear-gradient(180deg,rgba(0,0,0,.75),rgba(0,0,0,.3) 60%,rgba(0,0,0,.1))}
.nm-flap .hinge{position:absolute;left:-1px;right:-1px;height:2px;background:#050506;box-shadow:0 1px 0 rgba(255,255,255,.035)}
.nm-flap .hinge::before,.nm-flap .hinge::after{content:"";position:absolute;top:-2px;width:2px;height:6px;border-radius:1px;background:#3a3a3f}
.nm-flap .hinge::before{left:0}
.nm-flap .hinge::after{right:0}`,
    );

    // 吊杆：站牌从天花板上挂下来
    for (const x of [CASE_X + 96, CASE_X + CASE_W - 100]) el('i', 'rod', stage).style.left = `${x}px`;
    const box = el('div', 'case', stage);
    const head = el('div', 'head', box);
    const title = el('b', '', head);
    const led = el('i', '', title);
    el('em', '', title, en ? 'NOW SHOWING' : '翻页站牌 · SPLIT-FLAP').style.fontStyle = 'normal';
    // 右上角：第几组，也是两格小翻牌
    const set = el('div', 'set', head);
    if (single) set.style.display = 'none';
    if (!en) el('span', '', set, '第');
    else el('span', '', set, 'SET');
    const slot = el('div', 'slot', set);
    if (!en) el('span', '', set, '组');
    el('div', 'rule', box);
    // 外壳四角的螺丝
    for (const [x, y] of [[7, 7], [CASE_W - 12, 7], [7, CASE_H - 12], [CASE_W - 12, CASE_H - 12]] as const) {
      const sc = el('i', 'screw', box);
      sc.style.left = `${x}px`;
      sc.style.top = `${y}px`;
    }

    // ---------- 一格翻页牌 ----------
    // 四层：静止的上半格（新字）、下半格（旧字），翻片（正面旧字上半截、背面新字下半截），再加三块明暗遮罩
    type Cell = ReturnType<typeof makeCell>;
    const makeCell = (parent: HTMLElement, x: number, y: number, w: number, h: number, ox: number, oy: number) => {
      const node = el('div', 'cell', parent);
      Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, perspective: `${EYE}px`, perspectiveOrigin: `${ox}px ${oy}px` });
      const half = (cls: string, p: HTMLElement) => {
        const n = el('div', cls, p);
        n.style.height = `${h / 2}px`;
        const s = el('span', '', n);
        Object.assign(s.style, { height: `${h}px`, lineHeight: `${h}px` });
        return { n, s };
      };
      const top = half('half t', node);
      const bot = half('half b', node);
      const st = el('i', 'ov st', top.n);
      const sb = el('i', 'ov sb', bot.n);
      const leaf = el('div', 'leaf', node);
      leaf.style.height = `${h / 2}px`;
      const front = half('face t', leaf);
      const back = half('face b', leaf);
      const fdark = el('i', 'ov dark', front.n);
      const bdark = el('i', 'ov dark', back.n);
      const glint = el('i', 'ov glint', back.n);
      el('i', 'hinge', node).style.top = `${h / 2 - 1}px`;
      return { top: top.s, bot: bot.s, front: front.s, back: back.s, leaf, st, sb, fdark, bdark, glint, size: w };
    };

    const setText = (span: HTMLElement, ch: string, size: number) => {
      if (span.textContent === ch) return;
      span.textContent = ch;
      // 字号按格宽算：中文字几乎占满一格，字母大一点、稍微往下压，视觉上居中
      const cjk = isCJK(ch);
      span.style.fontSize = `${Math.round(size * (cjk ? 0.8 : 0.9))}px`;
      span.style.marginTop = cjk ? '0px' : `${(size * 0.05).toFixed(1)}px`;
    };

    // 落定的最后一张：弹簧带一点初速度，冲过头的部分折回来，就是翻片撞到底又弹起一点
    const land = spring({ duration: 0.4, bounce: 0.42, velocity: 2.5 });
    let firstHit = 0;
    while (firstHit < 1 && land(firstHit) < 1) firstHit += 0.002;

    /** 一格在 t 时刻的样子。plan 是这一格每次换字的开始时间和要翻过的序列 */
    type Plan = { start: number; seq: string[] }[];
    const paint = (cell: Cell, plan: Plan, t: number) => {
      // 最近一次已经开始的换字；还没开始时显示上一轮留下的最后一组
      let ch: Plan[number] | undefined;
      for (const x of plan) if (t >= x.start) ch = x;
      const last = plan[plan.length - 1]!;
      const seq = ch?.seq ?? [last.seq[last.seq.length - 1]!];
      const n = seq.length - 1;
      const local = ch ? t - ch.start : Infinity;
      const riffle = (n - 1) * FR;

      let k = n; // 正在翻第 k 张（seq[k] → seq[k+1]）；k = n 表示已经停稳
      let angle = 0;
      let landed = false;
      if (n > 0 && local < riffle) {
        k = Math.floor(local / FR);
        const u = local / FR - k;
        angle = 180 * Math.pow(u, 1.6); // 翻片靠重力落下，越落越快
      } else if (n > 0 && local - riffle < land.settle) {
        k = n - 1;
        const tau = local - riffle;
        angle = 180 * (1 - Math.abs(1 - land(tau)));
        landed = tau >= firstHit;
      }
      const size = cell.size;
      if (k >= n) {
        setText(cell.top, seq[n]!, size);
        setText(cell.bot, seq[n]!, size);
        cell.leaf.style.visibility = 'hidden';
        cell.st.style.opacity = '0';
        cell.sb.style.opacity = '0';
        return;
      }
      const cur = seq[k]!;
      const next = seq[k + 1]!;
      setText(cell.top, next, size); // 上半格：新字，翻片落下时露出来
      setText(cell.bot, landed ? next : cur, size); // 下半格：旧字，等翻片盖上
      setText(cell.front, cur, size);
      setText(cell.back, next, size);
      cell.leaf.style.visibility = 'visible';
      cell.leaf.style.transform = `rotateX(${(-angle).toFixed(2)}deg)`;
      // 明暗：正面转向下方时越来越暗；背面刚翻过来时朝上迎光，亮一下再回到正常
      const a1 = clamp(angle / 90);
      const a2 = clamp((angle - 90) / 90);
      cell.fdark.style.opacity = (0.5 * Math.pow(a1, 1.3)).toFixed(3);
      cell.bdark.style.opacity = (0.35 * Math.pow(1 - a2, 2)).toFixed(3);
      cell.glint.style.opacity = (angle > 90 ? Math.sin(Math.PI * Math.min(1, a2 * 1.6)) * 0.9 : 0).toFixed(3);
      // 投影：刚露出来的新字上半截还在翻片的阴影里；翻片落近时，下半格越来越暗
      cell.st.style.opacity = (0.8 * Math.pow(1 - a1, 1.4) * (angle < 90 ? 1 : 0)).toFixed(3);
      cell.sb.style.opacity = (0.85 * smooth(40, 170, angle) * (landed ? 0 : 1)).toFixed(3);
    };

    // ---------- 主牌面 ----------
    const bx = PAD;
    const by = HEAD + PAD;
    const cells: { cell: Cell; plan: Plan }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = bx + c * (CW + GAP);
        const y = by + r * (CH + ROW_GAP);
        // 视点在格子中心，再往整块牌的中心偏一点：左边的格子微微看到翻片的右侧，上排看到一点底面
        const cell = makeCell(box, x, y, CW, CH, CW / 2 + 0.1 * (bx + BOARD_W / 2 - x - CW / 2), CH / 2 + 0.1 * (by + BOARD_H / 2 - y - CH / 2));
        // 每次换字：从上一组的字翻到这一组的字；字没变的格子不翻
        const plan = changes.map((at, j) => {
          const from = grids[(j + grids.length - 1) % grids.length]![r]![c]!;
          const to = grids[j]![r]![c]!;
          const rnd = seeded(1000 + j * 97 + r * 13 + c);
          // 按列从左往右错峰，下排比上排晚一点，再带一点随机，像机械各自的快慢
          return { start: at + c * 0.048 + r * 0.12 + rnd() * 0.06, seq: sequence(from, to, pool, rnd) };
        });
        cells.push({ cell, plan });
      }
    }

    // 右上角的小翻牌：第几组
    const ccells: { cell: Cell; plan: Plan }[] = [];
    if (!single) {
      const w = 17;
      const h = 26;
      [0, 1].forEach((i) => {
        const cell = makeCell(slot, i * (w + 3), 0, w, h, w / 2 + (0.5 - i) * (w + 3), h / 2);
        const digit = (j: number) => String(j + 1).padStart(2, '0')[i]!;
        const plan = changes.map((at, j) => {
          const from = digit((j + changes.length - 1) % changes.length);
          const to = digit(j);
          return { start: at + 0.25 + i * 0.05, seq: sequence(from, to, pool, seeded(7 + j), '0123456789') };
        });
        ccells.push({ cell, plan });
      });
    }

    const render = (t: number) => {
      for (const { cell, plan } of cells) paint(cell, plan, t);
      for (const { cell, plan } of ccells) paint(cell, plan, t);
      // 指示灯：换词时快闪，平时慢慢呼吸
      let busy = 0;
      for (const at of changes) busy = Math.max(busy, smooth(at - 0.1, at, t) * (1 - smooth(at + 1.4, at + 1.8, t)));
      const breathe = 0.65 + 0.35 * Math.cos((Math.PI * 2 * t) / 3);
      const blink = Math.cos(t * Math.PI * 2 * 5) > 0 ? 1 : 0.35;
      led.style.opacity = String(busy > 0.5 ? blink : breathe);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.6 });
  },
};
