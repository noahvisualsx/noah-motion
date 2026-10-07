#!/usr/bin/env node
// noah-motion render：把用 timeline + exposeForRender 写的网页动画逐帧导出成 MP4。
//
//   npx noah-motion render demo/hero.html --out hero.mp4 --size 1080x1080 --fps 60 --motion-blur 4
//
// 原理：本地起一个静态服务器，用 Chrome（playwright-core 驱动）打开页面，
// 每一帧调用页面里的 __noahMotion.seek(t)、截一张图，最后交给 ffmpeg 合成。
// 因为动画是时间的纯函数，导出的每一帧和网页上看到的完全一致，不会掉帧。
// 需要：本机装了 Chrome 和 ffmpeg；第一次用时 npm i -D playwright-core。

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { serve } from './serve.mjs';

const HELP = `用法：noah-motion render <页面.html> [选项]

选项：
  --out <文件>          输出路径，默认 <页面名>.mp4
  --size <宽x高>        画面尺寸，默认 1080x1080
  --fps <数字>          帧率，默认 60
  --motion-blur <数字>  每帧采样几次做运动模糊，默认 1（关闭）；4 比较自然，导出会慢 4 倍
  --selector <CSS>      只截这个元素，默认截整个画面
  --audio <文件>        给视频配上音频（按视频时长截断）
  --query <参数>        附加到页面地址的参数，比如 name=orbits&text=你好
  --root <目录>         静态服务器的根目录，默认当前目录
  --chrome <路径>       Chrome 可执行文件，默认用系统安装的 Chrome
`;

function parseArgs(argv) {
  const [cmd, input, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]?.replace(/^--/, '');
    if (key) opts[key] = rest[++i];
  }
  return { cmd, input, opts };
}

const run = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} 退出码 ${code}\n${err.slice(-1500)}`))));
  });

async function render(input, opts) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error('需要 playwright-core：npm i -D playwright-core');
    process.exit(1);
  }

  const [width, height] = (opts.size ?? '1080x1080').split('x').map(Number);
  const fps = Number(opts.fps ?? 60);
  const sub = Math.max(1, Number(opts['motion-blur'] ?? 1));
  const root = path.resolve(opts.root ?? '.');
  const page = path.resolve(input);
  const out = path.resolve(opts.out ?? input.replace(/\.html?$/, '') + '.mp4');
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'noah-motion-frames-'));
  await fs.mkdir(path.dirname(out), { recursive: true });

  const server = await serve(root);
  const url = `http://127.0.0.1:${server.address().port}/${path.relative(root, page).split(path.sep).join('/')}?render${opts.query ? '&' + opts.query : ''}`;
  const browser = await chromium.launch(opts.chrome ? { executablePath: opts.chrome } : { channel: 'chrome' });
  try {
    const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await tab.goto(url, { waitUntil: 'networkidle' });
    await tab.waitForFunction(() => globalThis.__noahMotion, null, { timeout: 15000 });
    const duration = await tab.evaluate(() => globalThis.__noahMotion.duration);
    const target = opts.selector ? tab.locator(opts.selector) : tab;

    const total = Math.round(duration * fps);
    let n = 0;
    for (let f = 0; f < total; f++) {
      for (let s = 0; s < sub; s++) {
        const t = (f + s / sub) / fps;
        await tab.evaluate((time) => globalThis.__noahMotion.seek(time), t);
        await target.screenshot({ path: path.join(framesDir, `${String(n++).padStart(6, '0')}.png`), animations: 'allow' });
      }
      if (f % fps === 0) process.stdout.write(`\r截帧 ${f}/${total}`);
    }
    process.stdout.write(`\r截帧 ${total}/${total}\n`);
  } finally {
    await browser.close();
    server.close();
  }

  // 运动模糊：每 sub 张子帧取平均合成一帧
  const vf = sub > 1 ? [`tmix=frames=${sub}`, `select='not(mod(n+1\\,${sub}))'`, `setpts=N/(${fps}*TB)`] : [];
  vf.push('format=yuv420p');
  const args = ['-y', '-framerate', String(fps * sub), '-i', path.join(framesDir, '%06d.png')];
  if (opts.audio) args.push('-i', path.resolve(opts.audio));
  args.push('-vf', vf.join(','), '-r', String(fps), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart');
  if (opts.audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push(out);
  console.log('合成视频…');
  await run('ffmpeg', args);
  await fs.rm(framesDir, { recursive: true, force: true });
  console.log(`完成：${out}`);
}

const { cmd, input, opts } = parseArgs(process.argv.slice(2));
if (cmd === 'render' && input) await render(input, opts);
else console.log(HELP);
