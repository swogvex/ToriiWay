// Prints an ADMIN_PASSWORD_HASH for the admin page. The password is typed here and never
// stored; paste only the printed hash into Vercel. Usage: pnpm admin:hash

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { hashPassword } from '../../src/lib/server/password.ts';

const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question('Admin password (at least 12 characters): ');
rl.close();
if (password.length < 12) {
  console.error('Too short: use at least 12 characters.');
  process.exit(1);
}
console.log('\nADMIN_PASSWORD_HASH=');
console.log(await hashPassword(password));
