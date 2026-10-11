// 拨弦字：一根细弦横穿画面，字坐在弦上。拨片落下、贴住弦，用弹簧把弦慢慢拉成三角形，然后抬起松开。
// 松开后的弦按达朗贝尔解运动：y(x,t) = ½[F(x−vt) + F(x+vt)]·e^(−γt)，F 是初始三角形在两端固定下的奇延拓（周期 2L），
// 两个折角各自往两边跑，碰到琴码翻个面再跑回来。字跟着弦起伏、按脚下的斜率倾斜，跑得快的字被染成拨片的颜色。
// 拨三次：靠左用力往上拉、靠右从上往下压、正中轻轻一下；最后一下被慢慢按停，结尾和开头一样静止，首尾相接。
import { spring } from '../spring.ts';
import { track, clamp, mix, mixColor } from '../track.ts';
import { easeInOut, easeOut } from '../easing.ts';
import { timeline } from '../timeline.ts';
import { createStage, createCanvas, el, injectCSS, smooth, wrap, type SceneDef } from './util.ts';

const D = 10.4;
const X0 = 56; // 左琴码
const X1 = 584; // 右琴码
const L = X1 - X0;
const Y0 = 220; // 弦静止时的高度
const PERIOD = 1.3; // 慢放后的基频周期：折角跑完一个来回（2L）的时间
const V = (2 * L) / PERIOD;
const DAMP = 0.85; // 衰减 γ
const INK = '#1d1d1f';
const ACCENT = '#f2542d';
const PX = 2; // canvas 的像素倍率；阴影参数不受变换影响，要自己乘上
const TEXT_W = 356; // 字只排在两次靠边拨弦之间，不和拨片打架
// 拾音点：弦上这一点的位移随时间画成下方的波形，像示波器
const PICK_X = X0 + 0.8 * L;
const SCOPE_Y = 298;
const SCOPE_X = 132; // 波形最早的一端
const SCROLL = 200; // 波形往左走的速度（像素 / 秒）

// 三次拨弦：at = 拨片落下的时刻，p = 拨点在弦上的位置（0~1），h = 拉开的高度（负数朝上）
const PLUCKS = [
  { at: 0.25, p: 0.1, h: -84 },
  { at: 3.55, p: 0.9, h: 62 },
  { at: 6.85, p: 0.5, h: -46 },
];
const LAND = 0.45; // 落下到贴住弦
const HOLD = 0.72; // 贴住到松开

/** 两端固定、拨点在 a 的三角形，顶点高 1 */
const tri = (u: number, a: number) => (u <= a ? u / a : (L - u) / (L - a));
/** 奇延拓成周期 2L 的函数 */
const odd = (s: number, a: number) => {
  const m = ((s % (2 * L)) + 2 * L) % (2 * L);
  return m <= L ? tri(m, a) : -tri(2 * L - m, a);
};
/** 把沿弦跑的位置折回 [0, L]：碰到端点就反射 */
const fold = (s: number) => {
  const m = ((s % (2 * L)) + 2 * L) % (2 * L);
  return m <= L ? m : 2 * L - m;
};

/** 拨片：圆角三角形，尖端在原点，片身朝 +y，两条侧边和底边都微微鼓出来 */
function pickPath() {
  const p = new Path2D();
  p.moveTo(0, 46);
  p.bezierCurveTo(14, 46, 23, 42, 23.5, 34);
  p.bezierCurveTo(24, 25, 12, 10, 3.6, 2.2);
  p.quadraticCurveTo(0, -0.8, -3.6, 2.2);
  p.bezierCurveTo(-12, 10, -24, 25, -23.5, 34);
  p.bezierCurveTo(-23, 42, -14, 46, 0, 46);
  p.closePath();
  return p;
}

export const wave: SceneDef = {
  title: '拨弦字',
  category: '文字',
  description: '一行字坐在一根弦上。拨片用弹簧把弦拉成三角形再松开，弦按达朗贝尔解振动：折角往两头跑、碰到琴码翻面折回；字随弦起伏倾斜，跑得快的字被染红。',
  tags: ['达朗贝尔解', 'track', 'spring', 'mixColor', 'canvas'],
  tone: 'light',
  en: {
    title: 'Plucked string',
    description: "A line of text sits on a string. A pick pulls the string into a triangle on a spring and lets go; the string follows d'Alembert's solution, its corners racing to the bridges and flipping back. Letters ride and tilt with it, and the fast ones flush red.",
    tags: ["d'Alembert", 'track', 'spring', 'mixColor', 'canvas'],
  },
  mount(host, options = {}) {
    const en = options.lang === 'en';
    const stage = createStage(host, 'light', 'nm-pluck');
    injectCSS(
      'nm-pluck',
      `.nm-pluck{background:radial-gradient(110% 85% at 50% 42%,#fcfbf8 0%,#f3f0ea 62%,#e8e3da 100%)}
.nm-pluck .eq{position:absolute;left:0;right:0;top:356px;text-align:center;font:italic 14px/1 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;color:#8d887e;letter-spacing:.02em;white-space:pre}
.nm-pluck .eq sup{font-size:10px;margin-left:1px}
.nm-pluck .lab{position:absolute;left:${PICK_X + 12}px;top:${SCOPE_Y - 4}px;font:600 9px/1 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;letter-spacing:.24em;color:#b0aa9f}
.nm-pluck .eq b{display:block;margin-bottom:9px;font:600 10px/1 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;font-style:normal;letter-spacing:.24em;color:#b0aa9f}`,
    );
    const { ctx } = createCanvas(stage);
    const eq = el('div', 'eq', stage);
    el('b', '', eq, en ? "D'ALEMBERT" : '达朗贝尔解');
    el('span', '', eq, 'y(x, t) = ½ [ F(x − vt) + F(x + vt) ] · e');
    el('sup', '', eq, '−γt');
    el('div', 'lab', stage, en ? 'PICKUP' : '拾音点');

    // ---------- 三次拨弦 ----------
    const land = spring({ duration: 0.45, bounce: 0.15 });
    const liftOff = spring({ duration: 0.3, bounce: 0 });
    const draw = spring({ duration: 0.8, bounce: 0 }); // 拉弦：越拉越费劲，慢慢停住
    const plucks = PLUCKS.map((k, i) => {
      const contact = k.at + LAND;
      const release = contact + HOLD;
      const pull = track(0, [[contact, 1, draw]]);
      const next = PLUCKS[i + 1];
      return {
        ...k,
        a: k.p * L,
        dir: Math.sign(k.h),
        contact,
        release,
        pull,
        hRel: k.h * pull(release), // 松手那一刻真正拉开的高度，振动从这里接上
        // 下一次拨片贴上来时按住这一下的余振；最后一下在结尾前慢慢按停
        muteFrom: next ? next.at + LAND - 0.15 : D - 1.6,
        muteTo: next ? next.at + LAND + 0.3 : D - 0.2,
        lift: track(1, [[k.at, 0, land], [release, 1, liftOff]]),
      };
    });
    type Pluck = (typeof plucks)[number];

    /** 一次拨弦在 u 处、t 时刻造成的位移 */
    const disp = (pl: Pluck, u: number, t: number) => {
      if (t <= pl.contact) return 0;
      if (t <= pl.release) return pl.h * pl.pull(t) * tri(u, pl.a);
      const tau = t - pl.release;
      const env = Math.exp(-DAMP * tau) * (1 - smooth(pl.muteFrom, pl.muteTo, t));
      if (env < 1e-4) return 0;
      return pl.hRel * 0.5 * (odd(u - V * tau, pl.a) + odd(u + V * tau, pl.a)) * env;
    };
    /** 弦在 x 处的高度：三次拨弦直接叠加（线性波动方程） */
    const Y = (x: number, t: number) => {
      const u = x - X0;
      if (u <= 0 || u >= L) return Y0;
      let y = Y0;
      for (const pl of plucks) y += disp(pl, u, t);
      return y;
    };

    // ---------- 字 ----------
    const text = options.text ?? (en ? 'Let it ring' : '余音绕梁 三日不绝');
    const chars = [...text];
    const FONT = (s: number) => `600 ${s}px -apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei","Helvetica Neue",sans-serif`;
    ctx.font = FONT(100);
    const track0 = 0.06; // 字距（相对字号），留点缝，弦折起来时相邻的字不容易撞在一起
    const raw = chars.map((ch) => ctx.measureText(ch).width / 100 + track0);
    const size = Math.min(52, TEXT_W / raw.reduce((s, w) => s + w, 0));
    let cursor = 320 - (raw.reduce((s, w) => s + w, 0) * size) / 2;
    const glyphs = chars.map((ch, i) => {
      const w = raw[i]! * size;
      const g = { ch, x: cursor + w / 2, half: Math.max(w * 0.36, 4), cjk: /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) };
      cursor += w;
      return g;
    });

    // ---------- 画 ----------
    const N = 264;
    const strokeString = (t: number) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = X0 + (L * i) / N;
        const y = Y(x, t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    const pick = pickPath();

    const render = (t: number) => {
      ctx.clearRect(0, 0, 640, 400);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // 示波器：拾音点的位移往左流走，越旧越淡。时间按整轮折回，开头接得上上一轮末尾的余振
      const scopeAt = (x: number) => SCOPE_Y + (Y(PICK_X, wrap(t - (PICK_X - x) / SCROLL, 0, D)) - Y0) * 0.5;
      ctx.setLineDash([1, 4]);
      ctx.strokeStyle = 'rgba(60,56,50,.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(SCOPE_X, SCOPE_Y);
      ctx.lineTo(PICK_X, SCOPE_Y);
      ctx.stroke();
      const head = scopeAt(PICK_X);
      ctx.beginPath();
      ctx.moveTo(PICK_X, Y(PICK_X, t) + 5);
      ctx.lineTo(PICK_X, head - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      const fadeL = ctx.createLinearGradient(SCOPE_X, 0, PICK_X, 0);
      fadeL.addColorStop(0, 'rgba(43,42,40,0)');
      fadeL.addColorStop(0.6, 'rgba(43,42,40,.45)');
      fadeL.addColorStop(1, 'rgba(242,84,45,.9)');
      ctx.strokeStyle = fadeL;
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let x = SCOPE_X; x <= PICK_X; x += 2) {
        if (x === SCOPE_X) ctx.moveTo(x, scopeAt(x));
        else ctx.lineTo(x, scopeAt(x));
      }
      ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(PICK_X, head, 2.6, 0, Math.PI * 2);
      ctx.fill();
      // 弦上标出拾音点：一个小空心圈
      ctx.strokeStyle = 'rgba(242,84,45,.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(PICK_X, Y(PICK_X, t), 3.6, 0, Math.PI * 2);
      ctx.stroke();

      // 琴码外面的两截弦：不动，颜色淡一点
      ctx.strokeStyle = 'rgba(60,56,50,.28)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, Y0);
      ctx.lineTo(X0, Y0);
      ctx.moveTo(X1, Y0);
      ctx.lineTo(644, Y0);
      ctx.stroke();

      // 残影：往回取几个时刻再画几遍弦，像慢门拍下的轨迹
      for (let j = 4; j >= 1; j--) {
        ctx.strokeStyle = `rgba(242,84,45,${0.16 * (1 - j / 5)})`;
        ctx.lineWidth = 1.3;
        strokeString(t - j * 0.018);
      }
      // 弦本体，带一道落在纸上的影子
      ctx.save();
      ctx.shadowColor = 'rgba(40,28,10,.22)';
      ctx.shadowBlur = 5 * PX;
      ctx.shadowOffsetY = 9 * PX;
      ctx.strokeStyle = '#2b2a28';
      ctx.lineWidth = 1.6;
      strokeString(t);
      ctx.restore();

      // 琴码：两颗金属钉
      for (const x of [X0, X1]) {
        ctx.save();
        ctx.shadowColor = 'rgba(40,28,10,.3)';
        ctx.shadowBlur = 4 * PX;
        ctx.shadowOffsetY = 3 * PX;
        const g = ctx.createRadialGradient(x - 1.8, Y0 - 2, 0.5, x, Y0, 6);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, '#cfcac0');
        g.addColorStop(1, '#7d776d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, Y0, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 折角：最近一次松开的那两个角，各用一个小亮点标出来
      for (const pl of plucks) {
        if (t <= pl.release) continue;
        const tau = t - pl.release;
        const env = Math.exp(-DAMP * tau) * (1 - smooth(pl.muteFrom, pl.muteTo, t)) * smooth(0, 0.12, tau);
        if (env < 0.03) continue;
        for (const u of [fold(pl.a + V * tau), fold(pl.a - V * tau)]) {
          const x = X0 + u;
          const y = Y(x, t);
          const halo = ctx.createRadialGradient(x, y, 0, x, y, 11);
          halo.addColorStop(0, `rgba(242,84,45,${0.35 * env})`);
          halo.addColorStop(1, 'rgba(242,84,45,0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(242,84,45,${Math.min(1, env * 1.6)})`;
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 字：脚下两点的平均高度定位置、连线定角度；速度越大越红，并且顺着运动方向拉长一点
      ctx.font = FONT(size);
      ctx.textAlign = 'center';
      const dt = 1 / 120;
      for (const g of glyphs) {
        const yl = Y(g.x - g.half, t);
        const yr = Y(g.x + g.half, t);
        const vy = (Y(g.x, t + dt) - Y(g.x, t - dt)) / (2 * dt);
        const heat = smooth(80, 420, Math.abs(vy)); // 阈值收紧一点，少停在半红半黑的中间色
        ctx.save();
        ctx.translate(g.x, (yl + yr) / 2 - 4);
        ctx.rotate(0.85 * Math.atan2(yr - yl, g.half * 2)); // 稍微收一点角度，字更稳
        ctx.scale(1 - 0.05 * heat, 1 + 0.12 * heat);
        ctx.shadowColor = `rgba(40,28,10,${0.1 + 0.08 * heat})`;
        ctx.shadowBlur = 6 * PX;
        ctx.shadowOffsetY = 5 * PX;
        ctx.fillStyle = mixColor(INK, ACCENT, heat);
        ctx.textBaseline = g.cjk ? 'ideographic' : 'alphabetic';
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }

      // 拨片：落下 → 滑过去贴住弦 → 跟着弦被拉开 → 松手时往回一缩、抬起淡出（顺便往外侧让开，不挡字）
      for (const pl of plucks) {
        const lift = pl.lift(t);
        if (t < pl.at || lift > 0.98) continue;
        const k = clamp(lift);
        const out = Math.sign(X0 + pl.a - 320) || -1;
        let x = X0 + pl.a;
        let y: number;
        if (t <= pl.contact) {
          const e = easeInOut(clamp((t - pl.at - 0.06) / (LAND - 0.06)));
          y = mix(Y0 - pl.dir * 30, Y(x, t), e);
        } else if (t <= pl.release) y = Y(x, t);
        else {
          const e = easeOut(clamp((t - pl.release) / 0.45));
          y = Y0 + pl.hRel - pl.dir * 40 * e;
          x += out * 14 * e;
        }
        const lean = pl.dir * 0.1 * pl.pull.velocity(t); // 拉得快时片身稍微往后仰
        const rot = (pl.dir < 0 ? 0 : Math.PI) + 0.22 * out * (pl.dir < 0 ? 1 : -1) + lean;
        const sc = 0.88 * (1 + 0.35 * k);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        ctx.globalAlpha = 1 - k;
        ctx.save();
        ctx.shadowColor = `rgba(120,36,10,${0.32 - 0.16 * k})`;
        ctx.shadowBlur = (5 + 16 * k) * PX;
        // 阴影要始终落在下方：拨片转了 180° 时偏移方向不变，因为 canvas 的阴影不跟着变换走
        ctx.shadowOffsetY = (4 + 18 * k) * PX;
        const body = ctx.createLinearGradient(-22, 2, 22, 46);
        body.addColorStop(0, '#ff9a6c');
        body.addColorStop(0.45, '#f2542d');
        body.addColorStop(1, '#c2381a');
        ctx.fillStyle = body;
        ctx.fill(pick);
        ctx.restore();
        // 边缘的一圈倒角和一道高光
        ctx.strokeStyle = 'rgba(110,26,6,.4)';
        ctx.lineWidth = 0.9;
        ctx.stroke(pick);
        ctx.save();
        ctx.translate(0, 27);
        ctx.scale(0.8, 0.8);
        ctx.translate(0, -27);
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke(pick);
        ctx.restore();
        const gloss = ctx.createLinearGradient(-20, 10, 4, 30);
        gloss.addColorStop(0, 'rgba(255,255,255,.5)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        ctx.beginPath();
        ctx.ellipse(-9, 24, 5, 13, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 1.3 });
  },
};
