// 节拍：一张黑胶在转，外圈一环频谱跟着 120 BPM 的鼓点跳；右边是正在播放的曲目和一排 16 步鼓机。
// 鼓点按四小节写好（第一小节开头是重拍加镲，第四小节军鼓滚奏推上去，再接回开头），每一下都是一次弹簧脉冲。
// 频谱像真的分析器：柱子瞬间顶上去、带着“重力”加速回落，峰值帽先停一会儿再掉下来。
// 这些有惯性的量先按固定步长模拟两轮、取第二轮做成查表，render(t) 只查表插值，所以仍是时间的纯函数，首尾无缝。
import { spring, type Spring } from '../spring.ts';
import { track, clamp, mix } from '../track.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, injectCSS, seeded, wrap, TAU, type SceneDef } from './util.ts';

const D = 8;
const BPM = 120;
const STEP = 60 / BPM / 4; // 十六分音符
const STEPS = 16; // 每小节
const BANDS = 36; // 频段数，左右镜像成 72 根
const FPS = 120; // 查表的采样率
const PX = 2;
// 黑胶和频谱环
const RX = 190;
const RY = 200;
const DISC = 80;
const R_IN = 94;
const BAR = 58;
// 右侧面板
const PX0 = 384;
const GX = 430;
const GY = 238;
const CELL = 7;
const GAP = 3;
// 配色：一组暖色，从玫瑰到杏色
const ROSE = '#ff4f6d';
const CORAL = '#ff8a5b';
const APRICOT = '#ffc58a';
const ROWS = [ROSE, CORAL, APRICOT];

type Kind = 'kick' | 'snare' | 'hat' | 'open' | 'crash' | 'bass';
type Hit = { at: number; kind: Kind; vel: number; center: number };

// 四小节的鼓谱：每行 16 步，x = 打，o = 开镲
const PATTERN = [
  { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.o.' },
  { kick: 'x......xx.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx' },
  { kick: 'x.......x.x.....', snare: '....x.......x..x', hat: 'xxx.xxx.xxx.xxo.' },
  { kick: 'x......xx.x.....', snare: '....x.......xxxx', hat: 'x.x.x.x.x.x.....' },
];

/** 把鼓谱和贝斯线展开成一串击打 */
function score() {
  const rnd = seeded(7);
  const hits: Hit[] = [];
  const bassNotes = [1.2, 1.2, 2.6, 1.8, 1.2, 3.4, 2.6, 1.8];
  PATTERN.forEach((bar, b) => {
    for (let s = 0; s < STEPS; s++) {
      const at = (b * STEPS + s) * STEP;
      const accent = s % 4 === 0 ? 1 : 0.82;
      if (bar.kick[s] === 'x') hits.push({ at, kind: 'kick', vel: s === 0 ? 1 : 0.9, center: 1.5 });
      // 第四小节的滚奏一下比一下重
      if (bar.snare[s] === 'x') hits.push({ at, kind: 'snare', vel: b === 3 && s > 12 ? 0.7 + (s - 12) * 0.1 : 0.85, center: 13 });
      if (bar.hat[s] === 'x') hits.push({ at, kind: 'hat', vel: (0.5 + rnd() * 0.15) * accent, center: 30 + rnd() * 3 });
      if (bar.hat[s] === 'o') hits.push({ at, kind: 'open', vel: 0.6, center: 29 });
      if (s % 2 === 0) hits.push({ at, kind: 'bass', vel: 0.5 + rnd() * 0.1, center: bassNotes[(s / 2 + b * 3) % 8]! });
    }
  });
  hits.push({ at: 0, kind: 'crash', vel: 1, center: 26 });
  return hits;
}

const gauss = (x: number, c: number, w: number) => Math.exp(-((x - c) ** 2) / (2 * w * w));

/** 每种击打在各频段上的响应 */
function shape(h: Hit) {
  return Float32Array.from({ length: BANDS }, (_, b) => {
    switch (h.kind) {
      case 'kick':
        return h.vel * (1.15 * gauss(b, h.center, 2.6) + 0.3 * gauss(b, 7, 3));
      case 'snare':
        return h.vel * (0.8 * gauss(b, h.center, 4.5) + 0.3 * gauss(b, 25, 5));
      case 'hat':
        return h.vel * 0.42 * gauss(b, h.center, 2.6);
      case 'open':
        return h.vel * 0.5 * gauss(b, h.center, 4);
      case 'crash':
        return h.vel * (0.75 * gauss(b, h.center, 8) + 0.25 * gauss(b, 10, 6));
      default:
        return h.vel * 0.7 * gauss(b, h.center, 1.5);
    }
  });
}

export const equalizer: SceneDef = {
  title: '节拍',
  category: '图形',
  description: '黑胶在转，外圈一环频谱跟着四小节的鼓点跳：柱子带着重力回落、峰值帽停一下再掉；右边的鼓机逐步点亮，第四小节滚奏推回开头的重拍。',
  tags: ['spring 脉冲', 'track', '周期折回', 'canvas'],
  tone: 'dark',
  en: {
    title: 'Beat',
    description: 'A record spins inside a ring spectrum that dances to a four-bar groove: bars fall back with gravity, peak caps hang before dropping, and a 16-step drum machine lights up until a snare roll lands on the downbeat again.',
    tags: ['spring pulses', 'track', 'periodic wrap', 'canvas'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'dark', 'nm-eq');
    injectCSS(
      'nm-eq',
      `.nm-eq{background:#09090d}
.nm-eq .tx{position:absolute;left:${PX0}px;white-space:nowrap}
.nm-eq .lab{top:70px;font-size:11px;font-weight:650;letter-spacing:.18em;color:${CORAL}}
.nm-eq .title{top:88px;font-size:34px;font-weight:700;letter-spacing:-.02em;color:#f5f5f7;max-width:236px;overflow:hidden;text-overflow:ellipsis}
.nm-eq .artist{top:134px;font-size:13px;color:rgba(245,245,247,.5)}
.nm-eq .bpm{top:176px;font-size:24px;font-weight:650;color:#f5f5f7;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.nm-eq .bpm small{margin-left:5px;font-size:11px;font-weight:600;letter-spacing:.12em;color:rgba(245,245,247,.45)}
.nm-eq .row{font-size:9.5px;font-weight:600;letter-spacing:.08em;color:rgba(245,245,247,.4);line-height:10px}
.nm-eq .bar{top:316px;font-size:10px;font-weight:600;letter-spacing:.12em;color:rgba(245,245,247,.4)}`,
    );
    const { ctx } = createCanvas(stage, PX);
    el('div', 'tx lab', stage, en ? 'NOW PLAYING' : '正在播放');
    el('div', 'tx title', stage, options.text ?? (en ? 'Night Drive' : '夜航'));
    el('div', 'tx artist', stage, en ? 'noah · City Lights EP' : 'noah · 城市灯火 EP');
    const bpm = el('div', 'tx bpm', stage, String(BPM));
    el('small', '', bpm, 'BPM');
    (en ? ['KICK', 'SNARE', 'HAT'] : ['底鼓', '军鼓', '踩镲']).forEach((name, r) => {
      const row = el('div', 'tx row', stage, name);
      row.style.top = `${GY + r * 18 - 1.5}px`;
    });
    const barLabel = el('div', 'tx bar', stage);

    // ---------- 击打与包络 ----------
    const hits = score();
    const atk = spring({ duration: 0.08, bounce: 0 });
    const rel: Record<Kind, Spring> = {
      kick: spring({ duration: 0.5, bounce: 0.12 }),
      snare: spring({ duration: 0.42, bounce: 0.1 }),
      hat: spring({ duration: 0.16, bounce: 0 }),
      open: spring({ duration: 0.55, bounce: 0 }),
      crash: spring({ duration: 1.8, bounce: 0 }),
      bass: spring({ duration: 0.34, bounce: 0.05 }),
    };
    // 一下击打：0.04 秒推上去，再按各自的弹簧放开
    const pulses = Object.fromEntries((Object.keys(rel) as Kind[]).map((k) => [k, track(0, [[0, 1, atk], [0.04, 0, rel[k]]])])) as Record<Kind, ReturnType<typeof track>>;
    const life: Record<Kind, number> = { kick: 0.9, snare: 0.8, hat: 0.3, open: 0.9, crash: 2.6, bass: 0.6 };
    const shapes = hits.map(shape);
    const env = (kind: Kind, t: number) => {
      let v = 0;
      for (const h of hits) {
        if (h.kind !== kind) continue;
        const local = wrap(t, h.at, D);
        if (local < life[kind]) v = Math.max(v, h.vel * pulses[kind](local));
      }
      return v;
    };

    // ---------- 预先模拟：瞬间顶上、重力回落、峰值帽停留后下落 ----------
    const F = D * FPS;
    const level = new Float32Array(F * BANDS);
    const peak = new Float32Array(F * BANDS);
    {
      const raw = new Float32Array(BANDS);
      const disp = new Float32Array(BANDS);
      const vel = new Float32Array(BANDS);
      const cap = new Float32Array(BANDS);
      const capV = new Float32Array(BANDS);
      const hold = new Float32Array(BANDS);
      const SUB = 2; // 每个查表帧模拟两步
      const dt = 1 / (FPS * SUB);
      for (let i = -F * SUB; i < F * SUB; i++) {
        const t = i * dt;
        // 底噪：低频厚、高频薄，再加一点随小节起伏的铺底
        for (let b = 0; b < BANDS; b++) raw[b] = 0.03 + 0.06 * (1 - b / BANDS) + 0.04 * (0.5 + 0.5 * Math.sin((TAU * 2 * t) / D + b * 0.55));
        // 第四小节：高频的“上扬”越推越满（按周期折回的时间算，预热那一轮也要有，接缝处的状态才对得上）
        const rise = clamp(((((t % D) + D) % D) - 6) / 2) ** 2;
        for (let b = 18; b < BANDS; b++) raw[b]! += 0.3 * rise * (b - 17) / (BANDS - 18);
        hits.forEach((h, k) => {
          const local = wrap(t, h.at, D);
          if (local >= life[h.kind]) return;
          const p = pulses[h.kind](local);
          const s = shapes[k]!;
          for (let b = 0; b < BANDS; b++) raw[b]! += p * s[b]!;
        });
        for (let b = 0; b < BANDS; b++) {
          const r = 1 - Math.exp(-1.25 * Math.max(0, raw[b]!)); // 柔和饱和，叠在一起也不会顶破
          if (r >= disp[b]!) {
            disp[b] = mix(disp[b]!, r, 0.7);
            vel[b] = 0;
          } else {
            vel[b]! += 9 * dt; // 重力：越掉越快
            disp[b] = Math.max(r, disp[b]! - vel[b]! * dt);
          }
          if (disp[b]! >= cap[b]!) {
            cap[b] = disp[b]!;
            capV[b] = 0;
            hold[b] = 0.32;
          } else if (hold[b]! > 0) hold[b]! -= dt;
          else {
            capV[b]! += 3.2 * dt;
            cap[b] = Math.max(disp[b]!, cap[b]! - capV[b]! * dt);
          }
        }
        if (i >= 0 && i % SUB === 0) {
          const f = i / SUB;
          level.set(disp, f * BANDS);
          peak.set(cap, f * BANDS);
        }
      }
    }
    const lookup = (table: Float32Array, t: number, b: number) => {
      const x = (((t % D) + D) % D) * FPS;
      const f0 = Math.floor(x) % F;
      const f1 = (f0 + 1) % F;
      return mix(table[f0 * BANDS + b]!, table[f1 * BANDS + b]!, x - Math.floor(x));
    };

    // ---------- 预先画好的唱片和贴纸 ----------
    const disc = document.createElement('canvas');
    disc.width = disc.height = DISC * 2 * PX;
    {
      const g = disc.getContext('2d')!;
      g.scale(PX, PX);
      g.translate(DISC, DISC);
      const base = g.createRadialGradient(0, 0, 0, 0, 0, DISC);
      base.addColorStop(0, '#16151a');
      base.addColorStop(1, '#0c0b0f');
      g.fillStyle = base;
      g.beginPath();
      g.arc(0, 0, DISC, 0, TAU);
      g.fill();
      // 纹路：一圈圈细线，几处曲目间隙更暗更宽
      const rnd = seeded(5);
      g.lineWidth = 0.5;
      for (let r = 35; r < DISC - 2; r += 0.85) {
        const gap = [48, 59, 70].some((x) => Math.abs(r - x) < 1.2);
        g.strokeStyle = gap ? 'rgba(0,0,0,.55)' : `rgba(255,255,255,${0.025 + rnd() * 0.035})`;
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, DISC - 0.8, 0, TAU);
      g.stroke();
      // 贴纸：落日和海面
      g.save();
      g.beginPath();
      g.arc(0, 0, 31, 0, TAU);
      g.clip();
      const sky = g.createLinearGradient(0, -31, 0, 31);
      sky.addColorStop(0, '#2b1236');
      sky.addColorStop(0.55, '#5a1c45');
      sky.addColorStop(1, '#14101e');
      g.fillStyle = sky;
      g.fillRect(-31, -31, 62, 62);
      const sun = g.createLinearGradient(0, -20, 0, 6);
      sun.addColorStop(0, APRICOT);
      sun.addColorStop(1, ROSE);
      g.fillStyle = sun;
      g.beginPath();
      g.arc(0, 2, 17, Math.PI, 0);
      g.fill();
      g.fillStyle = '#5a1c45';
      for (let i = 0; i < 4; i++) g.fillRect(-20, -6 + i * 2.6, 40, 0.6 + i * 0.35); // 落日上的横纹
      g.fillStyle = 'rgba(255,138,91,.5)';
      for (let i = 0; i < 5; i++) g.fillRect(-12 + i * 1.6, 5 + i * 3.6, 24 - i * 3.2, 1); // 海面的倒影
      g.restore();
      // 贴纸边缘一圈小字
      g.fillStyle = 'rgba(255,197,138,.75)';
      g.font = '600 4.2px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';
      const ring = 'NOAH · CITY LIGHTS · SIDE A · STEREO · ';
      [...ring].forEach((ch, i) => {
        g.save();
        g.rotate((TAU * i) / ring.length);
        g.fillText(ch, -1.2, -26.5);
        g.restore();
      });
      // 中心孔
      g.fillStyle = '#09090d';
      g.beginPath();
      g.arc(0, 0, 2.6, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 0.6;
      g.stroke();
    }

    const kickPop = spring({ duration: 0.4, bounce: 0.35 });
    const beatPop = track(0, [[0, 1, spring({ duration: 0.12, bounce: 0 })], [0.06, 0, kickPop]]);

    const render = (t: number) => {
      const kick = env('kick', t);
      const crash = env('crash', t);
      const bar = Math.floor(t / (STEP * STEPS)) % 4;
      const stepF = (t / STEP) % STEPS;
      const step = Math.floor(stepF);

      // 背景：唱片身后一团随底鼓呼吸的暖光
      ctx.fillStyle = '#09090d';
      ctx.fillRect(0, 0, 640, 400);
      const glowR = 210 + 30 * kick + 40 * crash;
      const glow = ctx.createRadialGradient(RX, RY, 40, RX, RY, glowR);
      glow.addColorStop(0, `rgba(255,79,109,${0.13 + 0.12 * kick + 0.12 * crash})`);
      glow.addColorStop(0.55, `rgba(255,138,91,${0.04 + 0.04 * kick})`);
      glow.addColorStop(1, 'rgba(255,138,91,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 640, 400);

      // 冲击波：每小节第一拍荡开一圈，开头那一下（重拍加镲）最大
      for (let b = 0; b < 4; b++) {
        const local = wrap(t, b * STEP * STEPS, D);
        if (local > 1.1) continue;
        const k = local / 1.1;
        ctx.strokeStyle = `rgba(255,197,138,${(1 - k) ** 2 * Math.min(1, local / 0.04) * (b === 0 ? 0.5 : 0.25)})`; // 40 毫秒淡入，不会凭空蹦出来
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(RX, RY, R_IN + BAR * 0.5 + k * (b === 0 ? 160 : 110), 0, TAU);
        ctx.stroke();
      }

      // 频谱环：低频在下，往上越来越高，左右镜像
      const breathe = 1 + 0.025 * kick;
      const rIn = R_IN * breathe;
      const bars = new Path2D();
      const caps = new Path2D();
      for (let b = 0; b < BANDS; b++) {
        const lv = lookup(level, t, b);
        const pk = lookup(peak, t, b);
        const d = ((b + 0.5) / BANDS) * Math.PI;
        for (const a of [Math.PI / 2 + d, Math.PI / 2 - d]) {
          const c = Math.cos(a);
          const s = Math.sin(a);
          const r2 = rIn + 4 + lv * BAR;
          bars.moveTo(RX + c * rIn, RY + s * rIn);
          bars.lineTo(RX + c * r2, RY + s * r2);
          const r3 = rIn + 9 + pk * BAR;
          caps.moveTo(RX + c * r3 + 1.3, RY + s * r3);
          caps.arc(RX + c * r3, RY + s * r3, 1.3, 0, TAU);
        }
      }
      const grad = ctx.createRadialGradient(RX, RY, rIn, RX, RY, rIn + BAR + 6);
      grad.addColorStop(0, ROSE);
      grad.addColorStop(0.5, CORAL);
      grad.addColorStop(1, APRICOT);
      ctx.lineCap = 'round';
      // 先画一层宽而淡的，当作辉光
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.16 + 0.1 * kick;
      ctx.lineWidth = 7;
      ctx.stroke(bars);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.stroke(bars);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,230,205,.9)';
      ctx.fill(caps);
      // 内圈一条细线托住柱子
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(RX, RY, rIn - 5, 0, TAU);
      ctx.stroke();

      // 黑胶：8 秒转 4 圈（30 转/分），底鼓时轻轻一胀
      const spin = (TAU * 4 * t) / D;
      const k = 1 + 0.012 * kick;
      ctx.save();
      ctx.translate(RX, RY);
      ctx.scale(k, k);
      ctx.shadowColor = 'rgba(0,0,0,.6)';
      ctx.shadowBlur = 24 * PX;
      ctx.shadowOffsetY = 8 * PX;
      ctx.fillStyle = '#0c0b0f';
      ctx.beginPath();
      ctx.arc(0, 0, DISC, 0, TAU);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.rotate(spin);
      ctx.drawImage(disc, -DISC, -DISC, DISC * 2, DISC * 2);
      ctx.rotate(-spin);
      // 不随唱片转的反光：两道对角的亮楔，带一点频谱的暖色
      ctx.beginPath();
      ctx.arc(0, 0, DISC - 1, 0, TAU);
      ctx.arc(0, 0, 33, 0, TAU, true);
      const sheen = ctx.createConicGradient(-Math.PI / 4, 0, 0);
      const a = 0.1 + 0.06 * kick;
      sheen.addColorStop(0, `rgba(255,255,255,${a})`);
      sheen.addColorStop(0.09, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.41, 'rgba(255,138,91,0)');
      sheen.addColorStop(0.5, `rgba(255,170,130,${a * 0.8})`);
      sheen.addColorStop(0.59, 'rgba(255,138,91,0)');
      sheen.addColorStop(0.91, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, `rgba(255,255,255,${a})`);
      ctx.fillStyle = sheen;
      ctx.fill('evenodd');
      ctx.restore();

      // ---------- 右侧：四拍指示 ----------
      const beat = Math.floor(stepF / 4);
      for (let i = 0; i < 4; i++) {
        const on = i === beat;
        const pop = on ? beatPop(wrap(t, Math.floor(t / (STEP * 4)) * STEP * 4, D)) : 0;
        ctx.fillStyle = on ? (i === 0 ? ROSE : CORAL) : 'rgba(255,255,255,.12)';
        ctx.beginPath();
        ctx.arc(PX0 + 100 + i * 15, 191, 3.2 + 1.6 * pop, 0, TAU);
        ctx.fill();
      }

      // ---------- 鼓机：三行 16 步，播放头扫过时点亮 ----------
      const cellX = (s: number) => GX + s * (CELL + GAP) + Math.floor(s / 4) * 4;
      // 播放头
      const ph = cellX(Math.floor(stepF)) + (stepF % 1) * (CELL + GAP);
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.beginPath();
      ctx.roundRect(ph - 3, GY - 6, CELL + 6, 18 * 2 + CELL + 12, 5);
      ctx.fill();
      const rows = ['kick', 'snare', 'hat'] as const;
      const pat = PATTERN[bar]!;
      rows.forEach((row, r) => {
        for (let s = 0; s < STEPS; s++) {
          const ch = pat[row][s];
          const x = cellX(s);
          const y = GY + r * 18;
          if (ch === '.') {
            ctx.fillStyle = 'rgba(255,255,255,.08)';
            ctx.beginPath();
            ctx.roundRect(x, y, CELL, CELL, 2);
            ctx.fill();
            continue;
          }
          // 刚被播放头打到的格子：亮起再按弹簧暗回去
          const since = s <= step ? (stepF - s) * STEP : Infinity;
          const flash = since < 0.6 ? clamp(beatPop(since)) : 0;
          const grow = 1 + 0.45 * flash;
          const w = CELL * grow;
          ctx.globalAlpha = 0.55 + 0.45 * flash;
          if (flash > 0.05) {
            ctx.shadowColor = ROWS[r]!;
            ctx.shadowBlur = 10 * flash * PX;
          }
          ctx.fillStyle = ROWS[r]!;
          ctx.beginPath();
          ctx.roundRect(x + (CELL - w) / 2, y + (CELL - w) / 2, w, w, ch === 'o' ? w / 2 : 2);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.globalAlpha = 1;
        }
      });

      // 四小节进度：只有当前小节那段跟着走，每个小节交接看起来都一样，循环接缝也就看不出来
      for (let b = 0; b < 4; b++) {
        const x = PX0 + b * 54;
        ctx.fillStyle = 'rgba(255,255,255,.1)';
        ctx.beginPath();
        ctx.roundRect(x, 300, 48, 3, 1.5);
        ctx.fill();
        if (b !== bar) continue;
        ctx.fillStyle = CORAL;
        ctx.beginPath();
        ctx.roundRect(x, 300, Math.max(3, 48 * (stepF / STEPS)), 3, 1.5);
        ctx.fill();
      }
      barLabel.textContent = en ? `BAR ${bar + 1} / 4` : `第 ${bar + 1} / 4 小节`;
      bpm.style.transform = `scale(${1 + 0.04 * kick})`;
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 4.05 });
  },
};
