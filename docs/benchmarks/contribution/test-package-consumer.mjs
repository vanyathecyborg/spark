import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const checkout = resolve(process.argv[2] || '../spark-production-hardening');
const dir = mkdtempSync(join(tmpdir(), 'spark-native-consumer-'));
const run = (exe, args, cwd = dir) => execFileSync(exe, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], checkout))[0];
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'spark-consumer-check', private: true, type: 'module', dependencies: { '@sparkjsdev/spark': `file:./${packed.filename}`, three: '0.180.0', '@types/three': '0.180.0', typescript: '5.8.3' } }));
copyFileSync(fileURLToPath(new URL('./fixtures/consumer.ts', import.meta.url)), join(dir, 'consumer.ts'));
const results = { directory: dir, node: process.version, package: packed.shasum, checks: [] };
for (const [three, types] of [['0.180.0', '0.180.0'], ['0.185.1', '0.185.4']]) {
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `three@${three}`, `@types/three@${types}`]);
  run(join(dir, 'node_modules/.bin/tsc'), ['--noEmit', '--strict', '--target', 'ES2020', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', 'consumer.ts']);
  run(process.execPath, ['--input-type=module', '-e', "import {SparkRenderer,getSparkRendererCapabilities} from '@sparkjsdev/spark'; if(typeof SparkRenderer!=='function'||typeof getSparkRendererCapabilities!=='function') throw Error('Missing ESM export');"]);
  run(process.execPath, ['-e', "const {SparkRenderer,getSparkRendererCapabilities}=require('@sparkjsdev/spark');if(typeof SparkRenderer!=='function'||typeof getSparkRendererCapabilities!=='function')throw Error('Missing CommonJS export');"]);
  results.checks.push({ three, types, typecheck: true, esm: true, commonjs: true, lock: JSON.parse(readFileSync(join(dir, 'package-lock.json'))) .lockfileVersion });
}
console.log(JSON.stringify(results, null, 2));
