# noah-motion

零依赖的小型动画库：**闭式弹簧**、**可以随意拖动的时间轴**、几个常用的**网页动效**，同一份动画既能在网页上实时播放，也能**逐帧导出成视频**。

- gzip 后约 8KB，TypeScript 编写，自带类型
- 动画是时间的纯函数：任意一帧都能精确复现
- 默认照顾系统的“减少动态效果”设置
- 用于 [noahvisuals.vercel.app](https://noahvisuals.vercel.app) 的全部动效

> A tiny, dependency-free animation library: closed-form springs, scrubbable timelines, a few web motion helpers, and a CLI that renders the same timeline to MP4 frame by frame.

## 安装

```bash
npm i github:noahvisualsx/noah-motion
```

本地看演示：`npm run demo`，然后打开 http://127.0.0.1:5174/demo/

## 弹簧 `spring`

不逐帧模拟，直接解二阶阻尼振动方程，给一个时间立刻得到位置和速度。回弹、临界、过阻尼三种情况都是精确解。

```js
import { spring } from 'noah-motion';

const s = spring({ duration: 0.5, bounce: 0.25 }); // 也可以传 { stiffness, damping, mass }
s(0.2);          // 第 0.2 秒的进度（0 → 1，回弹时会短暂超过 1）
s.velocity(0.2); // 第 0.2 秒的速度
s.settle;        // 停稳需要多少秒
s.toCSS();       // { easing: 'linear(0, …, 1)', duration: 812 } —— 直接给 CSS transition / Web Animations 用
```

- `bounce`：0 刚好停住不过冲，0.2～0.4 明显回弹，负数更“黏”、慢慢停住
- `velocity`：起始速度。动画被中途打断、接着往新目标走时，用它保持连贯

## 轨道 `track` 与时间轴 `timeline`

轨道是一个数值随时间变化的完整剧本。每次改目标都从那一刻起动一条新弹簧，所有弹簧叠加，所以上一段没停稳就换目标也会自然衔接。

```js
import { track, timeline, mixColor, clamp } from 'noah-motion';

const width = track(16, [
  [0.4, 220], // 第 0.4 秒起，往 220 走
  [2.2, 120], // 第 2.2 秒起，改往 120 走
  [3.4, 16],
]);
const tint = track(0, [[1, 1], [3, 0]]);

const tl = timeline({
  duration: 4,
  loop: true,
  target: stage, // 滚出屏幕自动暂停
  render(t) {
    shape.style.width = width(t) + 'px';
    shape.style.background = mixColor('#1d1d1f', '#0071e3', clamp(tint(t)));
  },
});

tl.pause();
tl.seek(1.5); // 停在任意一帧
```

`render(t)` 只根据 `t` 画画面、不保存上一帧的状态，这样拖动、倒放、导出视频都不会出错。

缓动曲线：`cubicBezier(x1, y1, x2, y2)`、`easeOut`、`easeIn`、`easeInOut`、`steps(n)`、`linear`。
小工具：`mix`、`clamp`、`remap`、`mixColor`。

## 网页动效 `noah-motion/dom`

```js
import { flip, countUp, countOnView, morph, denoise, reveal } from 'noah-motion/dom';

// 布局变化：排序、筛选、换列，元素从旧位置弹到新位置
await flip('.card', () => list.append(...sorted));

// 数字滚动；countOnView 会在 [data-count] 元素滚进屏幕时开始
countUp(el, 211726, { format: (n) => (n / 10000).toFixed(1) + '万' });
countOnView('[data-count]');

// 尺寸变形：改按钮内容时宽高用弹簧过渡，文字模糊换场
morph(button, () => {
  label.textContent = '已复制';
  button.classList.add('done');
});

// 生成式出现：图片像被一轮轮去噪那样从模糊加噪点分步变清晰
denoise('.cover');

// 滚动进场
reveal('.card', { y: 24, blur: 6, stagger: 0.06 });
```

## 导出视频

同一条时间轴，用命令行逐帧截图再合成 MP4。每一帧都是算出来的，不会掉帧，还可以做运动模糊。

```js
import { exposeForRender } from 'noah-motion';
exposeForRender(tl); // 页面地址带 ?render 时自动暂停，由命令行一帧帧推进
```

```bash
npm i -D playwright-core   # 第一次用时安装；需要本机有 Chrome 和 ffmpeg
npx noah-motion render demo/hero.html --out hero.mp4 --size 1080x1080 --fps 60 --motion-blur 4
```

选项：`--out` 输出路径，`--size` 尺寸，`--fps` 帧率，`--motion-blur` 每帧采样次数（4 比较自然），`--selector` 只截某个元素，`--audio` 配音频，`--chrome` 指定 Chrome 路径。

## 设计原则

- **时间是唯一的输入**：画面只由时间决定，可预测、可测试、可导出。
- **弹簧优先**：用时长和回弹描述手感，而不是写死的贝塞尔曲线和毫秒数。
- **尊重用户设置**：开了“减少动态效果”时，时间轴停在静止画面，网页动效直接跳到结果。
- **原创实现**：全部代码从零编写，不依赖、也不照搬其他动画库的代码和接口；弹簧方程、贝塞尔曲线这类数学是公共知识。

## 开发

```bash
npm test        # 单元测试（Node 自带的测试运行器）
npm run build   # 编译到 dist/
npm run demo    # 演示页
```

## 许可

MIT © noahvisualsx
