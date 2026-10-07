import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spring } from '../src/spring.ts';
import { cubicBezier, steps } from '../src/easing.ts';
import { track, mixColor, remap } from '../src/track.ts';
import { timeline } from '../src/timeline.ts';

const close = (a: number, b: number, eps = 1e-3, msg?: string) =>
  assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≉ ${b} (±${eps})`);

const numericVelocity = (f: (t: number) => number, t: number, h = 1e-5) => (f(t + h) - f(t - h)) / (2 * h);

const REGIMES = {
  回弹: { duration: 0.5, bounce: 0.35 },
  临界: { duration: 0.5, bounce: 0 },
  过阻尼: { duration: 0.5, bounce: -0.5 },
};

for (const [name, opts] of Object.entries(REGIMES)) {
  test(`弹簧（${name}）：从 0 出发，在 settle 时停到 1 附近并且之后不再离开`, () => {
    const s = spring(opts);
    assert.equal(s(0), 0);
    assert.equal(s(-1), 0);
    for (let t = s.settle; t < s.settle + 3; t += 0.01) close(s(t), 1, 0.0011, `t=${t.toFixed(2)} 时 ${s(t)}`);
    assert.equal(s(Infinity), 1);
  });

  test(`弹簧（${name}）：解析速度和数值导数一致，带初速度也成立`, () => {
    for (const velocity of [0, 4, -3]) {
      const s = spring({ ...opts, velocity });
      close(s.velocity(0), velocity, 1e-9);
      for (const t of [0.01, 0.05, 0.13, 0.3, 0.7]) close(s.velocity(t), numericVelocity(s, t), 1e-3);
      close((s(1e-7) - s(0)) / 1e-7, velocity, 1e-3); // 起步速度确实是 velocity
    }
  });
}

test('弹簧：只有 bounce > 0 会过冲，临界和过阻尼单调上升', () => {
  const sample = (s: (t: number) => number) => Array.from({ length: 300 }, (_, i) => s(i / 100));
  assert.ok(Math.max(...sample(spring({ bounce: 0.35 }))) > 1.05);
  for (const bounce of [0, -0.5]) {
    const v = sample(spring({ bounce }));
    assert.ok(Math.max(...v) <= 1 + 1e-9, `bounce ${bounce} 过冲了`);
    for (let i = 1; i < v.length; i++) assert.ok(v[i]! >= v[i - 1]! - 1e-12, `bounce ${bounce} 不单调`);
  }
});

test('弹簧：bounce 在 0 附近连续变化，三种解法之间没有跳变', () => {
  const a = spring({ bounce: 0.001 });
  const b = spring({ bounce: 0 });
  const c = spring({ bounce: -0.001 });
  for (const t of [0.05, 0.1, 0.2, 0.4]) {
    close(a(t), b(t), 2e-3);
    close(c(t), b(t), 2e-3);
  }
});

test('弹簧：物理参数（劲度、阻尼、质量）', () => {
  const s = spring({ stiffness: 100, damping: 20, mass: 1 });
  close(s.omega, 10, 1e-9);
  close(s.dampingRatio, 1, 1e-9);
});

test('弹簧：toCSS 生成 linear() 缓动，首尾是 0 和 1', () => {
  const { easing, duration } = spring({ bounce: 0.2 }).toCSS(20);
  assert.match(easing, /^linear\(0, .*, 1\)$/);
  assert.equal(easing.split(',').length, 21);
  assert.ok(duration > 100 && duration < 5000);
});

test('三次贝塞尔：和 CSS 的已知值一致', () => {
  const ease = cubicBezier(0.25, 0.1, 0.25, 1); // CSS 的 ease
  close(ease(0.5), 0.8024033877, 1e-5);
  close(ease(0.25), 0.4085939, 1e-4);
  const lin = cubicBezier(0, 0, 1, 1);
  for (const p of [0, 0.1, 0.5, 0.9, 1]) close(lin(p), p, 1e-6);
  assert.equal(ease(-1), 0);
  assert.equal(ease(2), 1);
});

test('steps：分级跳变', () => {
  const f = steps(4);
  assert.deepEqual([0, 0.24, 0.25, 0.99, 1].map(f), [0, 0, 0.25, 0.75, 1]);
});

test('轨道：关键帧之前是初始值，最后停在最后一个目标，衔接处连续', () => {
  const t = track(10, [
    [1, 50],
    [1.2, 20], // 上一段还没停稳就改目标
    [3, 80],
  ]);
  assert.equal(t(0), 10);
  assert.equal(t(1), 10);
  close(t(t.end + 1), 80, 0.1);
  for (const at of [1, 1.2, 3]) close(t(at + 1e-6), t(at - 1e-6), 1e-3);
  close(t.velocity(1.5), numericVelocity(t, 1.5), 1e-2);
});

test('小工具：mixColor、remap', () => {
  assert.equal(mixColor('#000000', '#ffffff', 0.5), 'rgb(128, 128, 128)');
  assert.equal(mixColor('#f00', '#00f', 0), 'rgb(255, 0, 0)');
  assert.equal(remap(5, 0, 10, 100, 200), 150);
  assert.equal(remap(20, 0, 10, 100, 200), 200);
});

test('时间轴：手动 seek、播放、循环和结束回调', () => {
  // 用假的 requestAnimationFrame 控制时间
  let now = 0;
  const queue: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (cb) => (queue.push(cb), queue.length);
  globalThis.cancelAnimationFrame = () => {};
  const tick = (ms: number) => {
    now += ms;
    const cbs = queue.splice(0);
    cbs.forEach((cb) => cb(now));
  };

  const seen: number[] = [];
  let ended = 0;
  const tl = timeline({ duration: 1, render: (t) => seen.push(t), autoplay: false, onEnd: () => ended++ });
  assert.deepEqual(seen, [0]);
  tl.seek(0.4);
  assert.equal(tl.time, 0.4);
  tl.play();
  tick(16); // 第一帧只记录起点
  for (let i = 0; i < 70; i++) tick(16);
  assert.equal(tl.time, 1);
  assert.equal(tl.playing, false);
  assert.equal(ended, 1);

  const looping = timeline({ duration: 1, loop: true, render: () => {}, autoplay: true });
  for (let i = 0; i < 80; i++) tick(20);
  assert.ok(looping.time >= 0 && looping.time < 1);
  looping.seek(-0.25);
  close(looping.time, 0.75, 1e-9);
  looping.destroy();
});
