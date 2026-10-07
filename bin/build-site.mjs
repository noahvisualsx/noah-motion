// npm run build:site：把演示页打包成可以直接部署的静态网站（输出到 site/）
//   site/index.html  演示页（网站首页）
//   site/hero.html   可导出成视频的片头
//   site/dist/       编译好的库
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'site');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.cp(path.join(root, 'dist'), path.join(out, 'dist'), { recursive: true });

for (const name of await fs.readdir(path.join(root, 'demo'))) {
  if (!name.endsWith('.html')) continue;
  const html = await fs.readFile(path.join(root, 'demo', name), 'utf8');
  // 演示页在仓库里放在 demo/ 下、引用 ../dist/；网站里放在根目录，改成 ./dist/
  await fs.writeFile(path.join(out, name), html.replaceAll('../dist/', './dist/'));
}

console.log(`网站已打包到 ${path.relative(process.cwd(), out)}/`);
