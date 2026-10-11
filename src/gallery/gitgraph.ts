// 提交图：深色的 Git 客户端里，提交历史从最早的一条往上长。
// 主干上的提交点逐个亮起，feature 分支从主干长出、和主干并行提交，修复分支横穿过去，再先后合并回主干；
// 线条随一道向上推进的“生长线”画出来，曲线是竖直切线的 S 形；每条提交的信息、作者、短 hash（先乱码再定格）、时间逐条出现，
// 分支标签跟着各自的最新提交走，合并后收起。发布 v0.4.0、CI 跑完打勾，最后整张图从上往下收回，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mixColor, type Track } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, el, svg, injectCSS, seeded, type SceneDef } from './util.ts';

const D = 11;
// 窗口和表格
const WX = 24;
const WY = 22;
const WW = 592;
const WH = 356;
const TOP = 92; // 第一行顶部
const RH = 25;
const LANE_X = [158, 176, 194];
const LANES = [
  { name: 'main', color: '#5e8bff', soft: '#a9c1ff' },
  { name: 'feat/timeline', color: '#c070ff', soft: '#ddb4ff' },
  { name: 'fix/tab-jump', color: '#ffa347', soft: '#ffcf9c' },
];
const AUTHORS = [
  { i: 'N', bg: 'linear-gradient(135deg,#5e8bff,#9b6bff)' },
  { i: 'M', bg: 'linear-gradient(135deg,#ff6f91,#ffa347)' },
  { i: 'K', bg: 'linear-gradient(135deg,#2fd39a,#2aa7d8)' },
];
// 从最早到最新。parents[0] 是第一父提交，有 parents[1] 的是合并提交
const COMMITS: { lane: number; parents: number[]; zh: string; en: string; a: number; ago: [string, string] }[] = [
  { lane: 0, parents: [], zh: '初始化项目骨架', en: 'Initial project scaffold', a: 0, ago: ['3 天前', '3d ago'] },
  { lane: 0, parents: [0], zh: 'spring：闭式阻尼弹簧', en: 'spring: closed-form solver', a: 0, ago: ['3 天前', '3d ago'] },
  { lane: 1, parents: [1], zh: 'timeline：播放、暂停与拖动', en: 'timeline: play, pause, seek', a: 1, ago: ['2 天前', '2d ago'] },
  { lane: 0, parents: [1], zh: 'docs：补充 README 示例', en: 'docs: README examples', a: 2, ago: ['2 天前', '2d ago'] },
  { lane: 1, parents: [2], zh: 'timeline：循环与减少动态', en: 'timeline: loop & reduced motion', a: 1, ago: ['昨天', '1d ago'] },
  { lane: 2, parents: [3], zh: 'fix：切回标签页时间跳变', en: 'fix: time jump on tab return', a: 2, ago: ['昨天', '1d ago'] },
  { lane: 1, parents: [4], zh: 'track：叠加弹簧轨道', en: 'track: additive spring tracks', a: 1, ago: ['6 小时前', '6h ago'] },
  { lane: 0, parents: [3, 5], zh: '合并分支 fix/tab-jump', en: "Merge branch 'fix/tab-jump'", a: 0, ago: ['4 小时前', '4h ago'] },
  { lane: 1, parents: [6], zh: 'track：velocity() 与 end', en: 'track: velocity() and end', a: 1, ago: ['1 小时前', '1h ago'] },
  { lane: 0, parents: [7, 8], zh: '合并分支 feat/timeline', en: "Merge branch 'feat/timeline'", a: 0, ago: ['12 分钟前', '12m ago'] },
  { lane: 0, parents: [9], zh: '发布 v0.4.0', en: 'release: v0.4.0', a: 0, ago: ['刚刚', 'just now'] },
];
const N = COMMITS.length;
const LAST = N - 1;
const T = COMMITS.map((_, i) => 0.6 + i * 0.6); // 每条提交亮起的时间
const OUT = 9.6; // 开始收回
const rowOf = (i: number) => N - 1 - i; // 最新的在最上面
const ROWS_BOTTOM = TOP + RH * N;
const cy = (i: number) => TOP + RH * rowOf(i) + RH / 2;
const cx = (i: number) => LANE_X[COMMITS[i]!.lane]!;
const HEX = '0123456789abcdef';

export const gitgraph: SceneDef = {
  title: '提交图',
  category: '数据',
  description: 'Git 提交图从最早的提交往上长：主干逐个亮起，分支长出、并行、再合并回来，提交信息和短 hash 逐条出现，分支标签跟着最新提交走。',
  tags: ['track', 'spring', 'stagger', 'SVG mask'],
  tone: 'dark',
  en: {
    title: 'Commit graph',
    description: 'A Git history grows upward: commits light up on main, branches sprout, run in parallel and merge back, messages and short hashes arrive row by row, and branch labels ride their tips.',
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'dark', 'nm-git');
    injectCSS(
      'nm-git',
      `.nm-git{background:radial-gradient(70% 60% at 50% 30%,#141a33 0%,#0a0b10 60%,#060609 100%)}
.nm-git .glow{position:absolute;left:120px;top:-60px;width:400px;height:220px;border-radius:50%;background:radial-gradient(closest-side,rgba(110,92,255,.22),rgba(110,92,255,0));filter:blur(8px)}
.nm-git .win{position:absolute;left:${WX}px;top:0;width:${WW}px;border-radius:14px;background:#0f1015;overflow:hidden;
  box-shadow:0 40px 80px -20px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.07),inset 0 1px 0 rgba(255,255,255,.06)}
.nm-git .bar{position:absolute;left:0;right:0;top:0;height:40px;background:linear-gradient(#16171d,#121318);border-bottom:1px solid rgba(255,255,255,.06)}
.nm-git .dots{position:absolute;left:14px;top:14px;display:flex;gap:7px}
.nm-git .dots i{width:11px;height:11px;border-radius:50%;background:#2a2b31;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08)}
.nm-git .repo{position:absolute;left:78px;top:0;height:40px;display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#eceef3}
.nm-git .sel{display:flex;align-items:center;gap:5px;margin-left:6px;padding:3px 8px;border-radius:6px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font-size:11.5px;font-weight:500;color:#b9bdc7}
.nm-git .right{position:absolute;right:14px;top:0;height:40px;display:flex;align-items:center;gap:12px;font-size:11.5px;color:#8b909a;font-variant-numeric:tabular-nums}
.nm-git .right b{color:#eceef3;font-weight:600}
.nm-git .stack{display:flex}
.nm-git .stack i{width:18px;height:18px;margin-left:-5px;border-radius:50%;box-shadow:0 0 0 2px #14151a;display:grid;place-items:center;font-size:9px;font-style:normal;font-weight:700;color:#fff}
.nm-git .head{position:absolute;left:0;right:0;top:40px;height:26px;border-bottom:1px solid rgba(255,255,255,.05);font-size:9.5px;font-weight:600;letter-spacing:.08em;color:#5d626c}
.nm-git .head span{position:absolute;top:8px}
.nm-git .band{position:absolute;left:${WX}px;width:${WW}px;height:${RH}px;top:0;
  background:linear-gradient(90deg,var(--c) 0,var(--c) 2px,rgba(255,255,255,.055) 2px,rgba(255,255,255,.03) 70%,rgba(255,255,255,.015))}
.nm-git .content{position:absolute;inset:0}
.nm-git svg.g{position:absolute;inset:0;width:640px;height:400px;overflow:visible}
.nm-git .row{position:absolute;left:0;width:640px;height:${RH}px;font-size:12px;color:#e3e5ea;white-space:nowrap}
.nm-git .row > *{position:absolute;top:0;line-height:${RH}px}
.nm-git .row .msg{left:214px;max-width:194px;overflow:hidden;text-overflow:ellipsis}
.nm-git .row.merge .msg{color:#8b909a}
.nm-git .row .ci{left:418px;top:7px;line-height:0}
.nm-git .row .av{left:444px;top:4px;width:17px;height:17px;border-radius:50%;line-height:17px;text-align:center;font-size:8.5px;font-weight:700;color:#fff}
.nm-git .row .sha{left:476px;font-family:"SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#8b909a;letter-spacing:.02em}
.nm-git .row .ago{right:36px;font-size:11px;color:#626772}
.nm-git .pills{position:absolute;right:${640 - 138}px;top:0;height:18px;display:flex;gap:4px;justify-content:flex-end}
.nm-git .pill{height:18px;padding:0 7px 0 6px;border-radius:5px;display:flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;white-space:nowrap;
  background:var(--b);color:var(--s);box-shadow:inset 0 0 0 1px var(--e);transform-origin:100% 50%;overflow:hidden;position:relative}
.nm-git .pill.tag{transform-origin:50% 50%}
.nm-git .pill .shine{position:absolute;top:0;bottom:0;left:0;width:18px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)}`,
    );

    const glow = el('div', 'glow', stage);
    const win = el('div', 'win', stage);
    // 标题栏：红黄绿（这里做成低调的灰）、仓库名、当前分支、作者头像和提交数
    const bar = el('div', 'bar', win);
    const dots = el('div', 'dots', bar);
    for (let i = 0; i < 3; i++) el('i', '', dots);
    const repo = el('div', 'repo', bar);
    const repoIc = svg('svg', { width: 14, height: 14, viewBox: '0 0 16 16' }, repo);
    svg('path', { d: 'M3 2.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9.5H4.5A1.5 1.5 0 0 1 3 12V2.5zM3 12a1.5 1.5 0 0 1 1.5-1.5H13', fill: 'none', stroke: '#8b909a', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, repoIc);
    repo.append(options.text ?? 'noah-motion');
    const sel = el('div', 'sel', repo);
    branchGlyph(sel, '#b9bdc7');
    sel.append('main');
    const caret = svg('svg', { width: 8, height: 8, viewBox: '0 0 8 8' }, sel);
    svg('path', { d: 'M1.5 3 4 5.5 6.5 3', fill: 'none', stroke: '#8b909a', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, caret);
    const right = el('div', 'right', bar);
    const stack = el('div', 'stack', right);
    AUTHORS.forEach((a) => (el('i', '', stack, a.i).style.background = a.bg));
    const countBox = el('span', '', right);
    const countNum = el('b', '', countBox, '0');
    countBox.append(en ? ' commits' : ' 次提交');

    const head = el('div', 'head', win);
    const cols: [number, string, string][] = [
      [14, 'BRANCH / TAG', '分支 / 标签'],
      [124, 'GRAPH', '图谱'],
      [190, 'COMMIT MESSAGE', '提交信息'],
      [452, 'SHA', '哈希'],
    ];
    cols.forEach(([x, e, z]) => (el('span', '', head, en ? e : z).style.left = `${x}px`));
    const agoHead = el('span', '', head, en ? 'TIME' : '时间');
    agoHead.style.right = '12px';

    // 选中行的高亮条，跟着最新的提交走
    const content = el('div', 'content', stage);
    const band = el('div', 'band', content);

    // ---------- 图：边（被“生长线”遮罩）+ 交叉处的描边 + 合并时的光点 + 节点 ----------
    const uid = `nmGit${Math.floor(Math.random() * 1e6)}`;
    const g = svg('svg', { class: 'g', viewBox: '0 0 640 400' }, content);
    const defs = svg('defs', {}, g);
    const fadeGrad = svg('linearGradient', { id: `${uid}f`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }, fadeGrad);
    svg('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 1 }, fadeGrad);
    const mask = svg('mask', { id: `${uid}m`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 640, height: 400 }, defs);
    const FADE = 12;
    const maskFade = svg('rect', { x: 0, y: 0, width: 640, height: FADE, fill: `url(#${uid}f)` }, mask);
    const maskSolid = svg('rect', { x: 0, y: 0, width: 640, height: 420, fill: '#fff' }, mask);
    const halos = svg('g', { mask: `url(#${uid}m)` }, g);
    const edgesLow = svg('g', { mask: `url(#${uid}m)`, fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    const edgesHigh = svg('g', { mask: `url(#${uid}m)`, fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    const connectors = svg('g', {}, g);
    const pulses = svg('g', { mask: `url(#${uid}m)`, fill: 'none', 'stroke-linecap': 'round' }, g); // 光点也只在已经画出来的线上跑
    const nodesG = svg('g', {}, g);

    // 每条边：从父提交向上画到子提交。分叉的弯在父提交上方一行内完成，合并的弯在子提交下方一行内完成
    const S = (x0: number, y0: number, x1: number, y1: number) => `C${x0} ${(y0 + y1) / 2} ${x1} ${(y0 + y1) / 2} ${x1} ${y1}`;
    const merges: { path: SVGPathElement; len: number; at: number }[] = [];
    COMMITS.forEach((c, i) => {
      c.parents.forEach((p, k) => {
        const x0 = cx(p);
        const y0 = cy(p);
        const x1 = cx(i);
        const y1 = cy(i);
        let d: string;
        let curve = '';
        let color: string;
        if (x0 === x1) {
          d = `M${x0} ${y0}V${y1}`;
          color = LANES[c.lane]!.color;
        } else if (k === 0) {
          curve = `M${x0} ${y0}${S(x0, y0, x1, y0 - RH)}`;
          d = `${curve}V${y1}`;
          color = LANES[c.lane]!.color;
        } else {
          curve = `M${x0} ${y1 + RH}${S(x0, y1 + RH, x1, y1)}`;
          d = `M${x0} ${y0}V${y1 + RH}${S(x0, y1 + RH, x1, y1)}`;
          color = LANES[COMMITS[p]!.lane]!.color;
        }
        const lane = Math.max(c.lane, COMMITS[p]!.lane);
        const path = svg('path', { d, stroke: color }, lane === 2 ? edgesHigh : edgesLow);
        // 修复分支的弯横穿 feature 的线：下面垫一段底色描边，看起来是“跨过去”
        if (curve && lane === 2) {
          const h = svg('path', { d: curve, fill: 'none', stroke: '#0f1015', 'stroke-width': 6, 'stroke-linecap': 'round' }, halos);
          const L = h.getTotalLength() || 30;
          h.setAttribute('stroke-dasharray', `0 ${L * 0.28} ${L * 0.44} ${L}`);
        }
        if (k === 1) {
          const pulse = svg('path', { d, stroke: '#fff', 'stroke-width': 2.5 }, pulses);
          pulse.style.filter = `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`;
          merges.push({ path: pulse, len: path.getTotalLength() || 100, at: T[i]! - 0.3 });
        }
      });
    });
    // halos 要在 edgesLow 之上、edgesHigh 之下
    edgesLow.after(halos);

    const pop = spring({ duration: 0.45, bounce: 0.45 });
    const ease = spring({ duration: 0.5, bounce: 0 });
    const soft = spring({ duration: 0.5, bounce: 0.12 });

    // 生长线：每条提交亮起前一点点往上推一行，收尾时一口气退回底部
    const scan = track(400, [...T.map((at, i) => [at - 0.22, cy(i) + 2, ease] as const), [OUT, 420, spring({ duration: 1.3, bounce: 0 })]]);
    // 收回时生长线扫过某一行的时间：那一行的节点和文字跟着消失
    const outAt = COMMITS.map((_, i) => {
      for (let t = OUT; t < OUT + 2; t += 0.01) if (scan(t) > cy(i) - 6) return t;
      return OUT + 1;
    });

    const nodes = COMMITS.map((c, i) => {
      const color = LANES[c.lane]!.color;
      const grp = svg('g', {}, nodesG);
      const ring = svg('circle', { r: 6, fill: 'none', stroke: color, 'stroke-width': 1.5 }, grp);
      const body = svg('g', {}, grp);
      const merge = c.parents.length > 1;
      if (i === LAST) svg('circle', { r: 8.5, fill: 'none', stroke: color, 'stroke-opacity': 0.45, 'stroke-width': 1.5 }, body);
      svg('circle', { r: merge ? 4.2 : 4.6, fill: merge ? '#0f1015' : color, stroke: merge ? color : '#0f1015', 'stroke-width': merge ? 2 : 2.2 }, body);
      grp.setAttribute('transform', `translate(${cx(i)} ${cy(i)})`);
      return { ring, body, k: track(0, [[T[i]!, 1, pop], [outAt[i]!, 0, ease]]) };
    });

    // ---------- 每一行的文字 ----------
    const rnd = seeded(42);
    const rows = COMMITS.map((c, i) => {
      const row = el('div', `row${c.parents.length > 1 ? ' merge' : ''}`, content);
      row.style.top = `${TOP + RH * rowOf(i)}px`;
      el('span', 'msg', row, en ? c.en : c.zh);
      const ci = el('span', 'ci', row);
      const ciSvg = svg('svg', { width: 12, height: 12, viewBox: '0 0 12 12' }, ci);
      const check = svg('path', { d: 'M2.6 6.2 5 8.5l4.4-5', fill: 'none', stroke: '#3dd68c', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ciSvg);
      const spin = svg('circle', { cx: 6, cy: 6, r: 4.4, fill: 'none', stroke: '#e3b341', 'stroke-width': 1.6, 'stroke-dasharray': '18 30', 'stroke-linecap': 'round' }, ciSvg);
      const av = el('span', 'av', row, AUTHORS[c.a]!.i);
      av.style.background = AUTHORS[c.a]!.bg;
      const sha = el('span', 'sha', row);
      const hash = Array.from({ length: 7 }, () => HEX[Math.floor(rnd() * 16)]).join('');
      const ago = el('span', 'ago', row, en ? c.ago[1] : c.ago[0]);
      const at = T[i]! + 0.06;
      return {
        row,
        parts: [row.children[0] as HTMLElement, ci, av, sha, ago].map((node, j) => ({ node, k: track(0, [[at + j * 0.05, 1, soft], [outAt[i]! + j * 0.02, 0, ease]]) })),
        sha,
        hash,
        at,
        check,
        spin,
      };
    });
    (rows[LAST]!.row.firstElementChild as HTMLElement).style.fontWeight = '600';

    // ---------- 分支标签：跟着各自的最新提交，合并后收起 ----------
    const tips = (lane: number) => COMMITS.map((c, i) => (c.lane === lane ? i : -1)).filter((i) => i >= 0);
    const branchEnd = [OUT, T[9]! + 0.15, T[7]! + 0.15]; // feature 在第 10 条合并，修复分支在第 8 条合并
    const pills = LANES.map((lane, li) => {
      const box = el('div', 'pills', content);
      box.style.zIndex = String(3 - li); // main 往上走时从其他标签上面滑过
      let tag: { node: HTMLElement; k: Track; shine: HTMLElement } | undefined;
      if (li === 0) {
        const node = el('div', 'pill tag', box);
        paint(node, '#3dd68c', '#a6f0c8');
        tagGlyph(node);
        node.append('v0.4.0');
        const shine = el('i', 'shine', node);
        tag = { node, k: track(0, [[T[LAST]! + 0.4, 1, pop], [outAt[LAST]!, 0, ease]]), shine };
      }
      const pill = el('div', 'pill', box);
      paint(pill, lane.color, lane.soft);
      if (li === 0) checkGlyph(pill, lane.soft);
      else branchGlyph(pill, lane.soft);
      pill.append(lane.name);
      const ids = tips(li);
      const first = ids[0]!;
      const y = track(cy(first), ids.slice(1).map((i) => [T[i]! + 0.02, cy(i), soft] as const));
      const lastTip = ids[ids.length - 1]!;
      const k = track(0, [[T[first]! + 0.1, 1, pop], [li === 0 ? outAt[lastTip]! : branchEnd[li]!, 0, ease]]);
      const line = svg('line', { x1: 140, x2: LANE_X[li]! - 6.5, stroke: lane.color, 'stroke-opacity': 0.55, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, connectors);
      return { box, pill, y, k, line, tag };
    });

    // 选中行跟着最新提交；颜色是那条提交所在分支的颜色
    const bandY = track(cy(0), T.slice(1).map((at, i) => [at, cy(i + 1), soft] as const));
    const bandK = track(0, [[T[0]!, 1, ease], [OUT, 0, ease]]);
    // 窗口高度跟着行数长：先腾出一行，新提交再落进去；收尾时跟着生长线一起缩回一行
    const grow = track(1, T.slice(1).map((at, i) => [at - 0.22, i + 2, soft] as const));
    const k0 = N - (ROWS_BOTTOM - scan(OUT)) / RH; // 让收尾开始那一刻行数正好接上

    const render = (t: number) => {
      // 生长线遮罩
      const sy = scan(t);
      maskFade.setAttribute('y', String(sy - FADE));
      maskSolid.setAttribute('y', String(sy));

      // 窗口始终竖直居中；内容层（图和文字）按最终布局排好，整体跟着窗口底边走，并裁到表格区域里
      const n = t < OUT ? grow(t) : clamp((ROWS_BOTTOM - sy) / RH + k0, 1, N);
      const h = WH - (N - n) * RH;
      const top = 200 - h / 2;
      const shift = top + h - (WY + WH);
      win.style.height = `${h}px`;
      win.style.transform = `translateY(${top}px)`;
      glow.style.transform = `translateY(${top - WY}px)`;
      content.style.transform = `translateY(${shift}px)`;
      content.style.clipPath = `inset(${top + 66 - shift}px 0 ${400 - WY - WH}px 0)`;

      let latest = -1;
      for (let i = 0; i < N; i++) if (t >= T[i]!) latest = i;
      const shown = COMMITS.reduce((n, _, i) => n + (t >= T[i]! && t < outAt[i]! ? 1 : 0), 0);
      countNum.textContent = String(shown);

      nodes.forEach((n, i) => {
        const k = n.k(t);
        n.body.setAttribute('transform', `scale(${Math.max(0, k)})`);
        // 亮起时一圈光环往外扩散
        const p = clamp((t - T[i]!) / 0.7);
        n.ring.setAttribute('r', String(5 + p * 11));
        n.ring.setAttribute('opacity', String(p > 0 && p < 1 ? (1 - p) * 0.8 : 0));
      });

      // 合并：一颗光点沿着合并进来的那条线跑进主干
      for (const m of merges) {
        const p = clamp((t - m.at) / 0.45);
        const len = 22;
        m.path.setAttribute('stroke-dasharray', `${len} ${m.len + len}`);
        m.path.setAttribute('stroke-dashoffset', String(len - p * (m.len + len)));
        m.path.setAttribute('opacity', String(p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0));
      }

      rows.forEach((r, i) => {
        for (const { node, k } of r.parts) {
          const v = k(t);
          node.style.opacity = String(clamp(v));
          node.style.transform = `translateX(${(1 - v) * 10}px)`;
        }
        // 短 hash：先是滚动的乱码，从左到右逐位定格
        const p = clamp((t - r.at - 0.15) / 0.45);
        const fixed = Math.floor(p * 7.99);
        const tick = Math.floor(t * 28);
        let s = '';
        for (let j = 0; j < 7; j++) s += j < fixed ? r.hash[j] : HEX[(Math.imul(i * 97 + j * 31 + tick * 131, 2654435761) >>> 28) & 15];
        r.sha.textContent = s;
        r.sha.style.color = i === latest ? '#c9cdd6' : '';
        // CI：最新一条先转圈，跑完弹出勾；其他都是已通过
        const done = i < LAST || t > T[LAST]! + 1.5;
        r.spin.setAttribute('opacity', done ? '0' : '1');
        r.spin.setAttribute('transform', `rotate(${t * 400} 6 6)`);
        const ck = i < LAST ? 1 : pop(t - T[LAST]! - 1.5);
        r.check.setAttribute('opacity', done ? String(i < LAST ? 0.75 : 1) : '0');
        r.check.setAttribute('transform', `translate(6 6) scale(${ck}) translate(-6 -6)`);
      });

      pills.forEach((b) => {
        const k = b.k(t);
        const y = b.y(t);
        b.box.style.transform = `translateY(${y - 9}px)`;
        b.pill.style.opacity = String(clamp(k * 1.4));
        b.pill.style.transform = `scale(${0.6 + 0.4 * k})`;
        b.line.setAttribute('y1', String(y));
        b.line.setAttribute('y2', String(y));
        b.line.setAttribute('opacity', String(clamp(k)));
        if (b.tag) {
          const tk = b.tag.k(t);
          b.tag.node.style.opacity = String(clamp(tk * 1.4));
          b.tag.node.style.transform = `scale(${0.4 + 0.6 * tk})`;
          b.tag.shine.style.transform = `translateX(${-20 + clamp((t - T[LAST]! - 0.7) / 0.6) * 90}px)`;
        }
      });

      const bi = Math.max(0, latest);
      band.style.transform = `translateY(${bandY(t) - RH / 2}px)`;
      band.style.opacity = String(clamp(bandK(t)));
      band.style.setProperty('--c', LANES[COMMITS[bi]!.lane]!.color);
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 8.6 });
  },
};

/** 标签的配色：底色是分支色和窗口底色的混合，描边是半透明的分支色 */
function paint(node: HTMLElement, color: string, text: string) {
  node.style.setProperty('--b', mixColor('#0f1015', color, 0.15));
  node.style.setProperty('--e', `${color}6b`);
  node.style.setProperty('--s', text);
}

/** 分支图标：两个点一条弯线 */
function branchGlyph(parent: HTMLElement, color: string) {
  const s = svg('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, parent);
  svg('path', { d: 'M2.5 1.5v7M2.5 6.5c0-2 5-1.5 5-4', fill: 'none', stroke: color, 'stroke-width': 1.2, 'stroke-linecap': 'round' }, s);
  svg('circle', { cx: 7.5, cy: 2.2, r: 1.3, fill: color }, s);
  return s;
}
/** 标签图标 */
function tagGlyph(parent: HTMLElement) {
  const s = svg('svg', { width: 10, height: 10, viewBox: '0 0 10 10' }, parent);
  svg('path', { d: 'M1.2 1.2h3.6l4 4-3.6 3.6-4-4z', fill: 'none', stroke: '#a6f0c8', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }, s);
  svg('circle', { cx: 3.4, cy: 3.4, r: 0.8, fill: '#a6f0c8' }, s);
  return s;
}
/** 当前检出分支的勾 */
function checkGlyph(parent: HTMLElement, color: string) {
  const s = svg('svg', { width: 9, height: 9, viewBox: '0 0 10 10' }, parent);
  svg('path', { d: 'M1.8 5.2 4 7.4l4.4-5', fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
  return s;
}
