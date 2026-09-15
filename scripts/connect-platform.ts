import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { oracleOrigin } from '../server/platform.ts';

const names = ['OWNER_ACCESS_TOKEN', 'ORACLE_ENDPOINT', 'ORACLE_API_TOKEN'] as const;
const values = Object.fromEntries(names.filter(name => process.env[name]).map(name => [name, process.env[name]!]));
try {
  if (values.OWNER_ACCESS_TOKEN && !/^[A-Za-z0-9_-]{32,256}$/.test(values.OWNER_ACCESS_TOKEN)) throw new Error();
  if (!!values.ORACLE_ENDPOINT !== !!values.ORACLE_API_TOKEN) throw new Error();
  if (values.ORACLE_ENDPOINT && (!oracleOrigin(values.ORACLE_ENDPOINT) || !/^[A-Za-z0-9_-]{40,100}$/.test(values.ORACLE_API_TOKEN))) throw new Error();
  if (Object.keys(values).length) {
    const env = { ...process.env };
    for (const name of names) delete env[name];
    const result = spawnSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'secret', 'bulk', '--name', 'worldifact'], {
      input: JSON.stringify(values), encoding: 'utf8', env, timeout: 60000,
      shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.error || result.status !== 0) throw new Error();
    console.log('Optional platform secrets synchronized. Connection and rendering are not implied.');
  } else console.log('No optional platform secrets supplied. Existing Worker secrets are preserved.');
} catch {
  console.error('Platform secret setup failed. Check owner code format and the paired Oracle endpoint/credential. Sensitive output suppressed.');
  process.exitCode = 1;
}
