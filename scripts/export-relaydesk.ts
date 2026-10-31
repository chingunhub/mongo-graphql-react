import { loadCurriculum } from '../server/content.js';
import { getProgress } from '../server/progress.js';
import { exportRelaydesk } from '../server/relaydesk-export.js';
const args = process.argv.slice(2);
if (
  args.some((arg) => !['--mine', '--reference'].includes(arg)) ||
  (args.includes('--mine') && args.includes('--reference'))
)
  throw Error('Choose --mine or --reference');
const mode = args.includes('--reference') ? 'reference' : 'mine';
console.log(JSON.stringify(await exportRelaydesk(loadCurriculum(), getProgress(), mode), null, 2));
