// 纸飞机：一架纸飞机沿着带一个翻转圈的航线飞过天空，机头始终顺着航线的切线方向，
// 身后留下一串虚线轨迹；飞出画面后轨迹淡去，云朵按周期飘动，整段无缝循环。
import { timeline } from '../timeline.ts';
import { clamp } from '../track.ts';
import { easeInOut } from '../easing.ts';
import { createStage, svg, injectCSS, TAU, type SceneDef } from './util.ts';

const D = 7;
// 航线：从左下飞入，在中间翻一个圈，再从右上飞出
const ROUTE = 'M -60 300 C 80 300 150 170 260 180 C 380 190 420 290 340 300 C 260 310 250 190 360 150 C 470 110 560 140 700 70';

export const plane: SceneDef = {
  title: '纸飞机',
  category: '插画',
  description: '一架纸飞机沿着带翻转圈的航线飞过，机头始终顺着航线方向，身后留下虚线轨迹。',
  tags: ['timeline', '路径切线', 'SVG'],
  tone: 'light',
  mount(host, options = {}) {
    const stage = createStage(host, 'light', 'nm-plane');
    injectCSS(
      'nm-plane',
      `.nm-plane{background:linear-gradient(180deg,#dbeafe 0%,#f0f7ff 55%,#fdfcf7 100%)}
.nm-plane svg{position:absolute;inset:0;width:640px;height:400px}
.nm-plane .cap{position:absolute;left:40px;bottom:30px;font-size:12px;letter-spacing:.22em;color:#5b7aa6;font-weight:600}`,
    );
    const g = svg('svg', { viewBox: '0 0 640 400' }, stage);
    // 云：几团白色圆角椭圆
    const clouds = [
      { x: 120, y: 70, s: 1, speed: 1 },
      { x: 430, y: 52, s: 0.8, speed: 2 },
      { x: 560, y: 230, s: 0.6, speed: 1 },
    ].map((c) => {
      const grp = svg('g', { opacity: 0.9 }, g);
      [
        [0, 0, 34],
        [28, -10, 26],
        [54, 2, 22],
        [26, 8, 30],
      ].forEach(([dx, dy, r]) => svg('ellipse', { cx: dx!, cy: dy!, rx: r!, ry: r! * 0.62, fill: '#fff' }, grp));
      return { grp, ...c };
    });
    const path = svg('path', { d: ROUTE, fill: 'none', stroke: 'none' }, g);
    const trail = svg('path', { fill: 'none', stroke: '#5b7aa6', 'stroke-width': 2, 'stroke-dasharray': '2 9', 'stroke-linecap': 'round' }, g);
    // 纸飞机：两片三角形，机头朝右
    const planeG = svg('g', {}, g);
    svg('path', { d: 'M 22 0 L -16 -13 L -8 0 Z', fill: '#ffffff', stroke: '#1d1d1f', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, planeG);
    svg('path', { d: 'M 22 0 L -16 13 L -8 0 Z', fill: '#e8eef8', stroke: '#1d1d1f', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, planeG);
    svg('path', { d: 'M 22 0 L -8 0', stroke: '#1d1d1f', 'stroke-width': 1.2 }, planeG);
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = options.text ?? 'FLIGHT · 纸飞机';
    stage.append(cap);

    const total = path.getTotalLength();
    const render = (t: number) => {
      // 0.3–5.6 秒飞完全程，起降慢、中间快
      const u = easeInOut(clamp((t - 0.3) / 5.3));
      const len = u * total;
      const p = path.getPointAtLength(len);
      const ahead = path.getPointAtLength(Math.min(total, len + 1));
      const behind = path.getPointAtLength(Math.max(0, len - 1));
      const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
      // 翻圈时机身会侧倾：用切线角速度近似，做成上下压扁
      const bank = Math.cos((angle * Math.PI) / 180) < 0 ? 0.55 : 1;
      planeG.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle}) scale(1 ${bank})`);
      // 轨迹：每 6px 取一个点
      const pts: string[] = [];
      for (let l = 0; l <= len; l += 6) {
        const q = path.getPointAtLength(l);
        pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`);
      }
      trail.setAttribute('d', pts.length > 1 ? 'M' + pts.join(' L') : '');
      trail.setAttribute('opacity', String(1 - clamp((t - 5.6) / 1.0)));
      clouds.forEach((c) => {
        // 每轮正好漂过整数个 760px（画面宽 640 + 两边各留 60），循环时云的位置首尾一致
        const x = ((c.x + (t / D) * 760 * c.speed) % 760) - 60;
        c.grp.setAttribute('transform', `translate(${x} ${c.y + Math.sin((t / D) * TAU) * 4}) scale(${c.s})`);
      });
    };

    return timeline({ duration: D, loop: true, render, target: host, autoplay: options.autoplay ?? true, reducedMotion: 3.2 });
  },
};
