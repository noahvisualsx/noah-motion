// npm run demo：本地打开演示页
import { serve } from './serve.mjs';

const server = await serve('.', Number(process.env.PORT ?? 5174));
console.log(`演示页：http://127.0.0.1:${server.address().port}/demo/`);
