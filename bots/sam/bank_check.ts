import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Print the bank. BANK=x,z picks which one to walk to (default Yanille).
const [bx, bz] = (process.env.BANK ?? '2612,3092').split(',').map(Number);

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    if (sdk.getState()!.player.level > 0) await h.climb('down', /staircase/i);
    for (let i = 0; i < 5 && !(await h.walk({ x: bx, z: bz }, 'bank')); i++);
    const o = await bot.openBank();
    if (!o.success) throw new Error(`bank: ${o.message}`);
    console.log(sdk.getBankItems().map(i => `${i.name} x${i.count}`).join('\n'));
    await bot.closeBank();
}, { timeout: 10 * 60_000 });
