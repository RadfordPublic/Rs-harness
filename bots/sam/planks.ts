import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Three wooden planks for the Lady Lumbridge. Off Crandor, the only plank spawns are in the
// Wilderness (~level 18): (3148, 3671), (3154, 3659), (3154, 3670), (3171, 3680), (3182, 3669).
// Banks everything at Edgeville first (only food goes in), so a death costs nothing.
//   N=3 bun bots/sam/planks.ts
const N = Number(process.env.N ?? 3);
const BANK = { x: 3094, z: 3492 };            // Edgeville
const SPAWNS = [{ x: 3154, z: 3659 }, { x: 3154, z: 3670 }, { x: 3148, z: 3671 }, { x: 3171, z: 3680 }, { x: 3182, z: 3669 }];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const planks = () => h.count(/^plank$/i);

    await h.walk(BANK, 'edgeville bank');
    await bot.openBank();
    for (const n of [...new Set(sdk.getInventory().filter(i => !/^cooked meat$|^plank$/i.test(i.name)).map(i => i.name))]) {
        await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
    }
    if (h.count(/cooked meat/i) < 6) await bot.withdrawItem(/^cooked meat$/i, 6).catch(() => {});
    await bot.closeBank();
    console.log('carrying:', sdk.getInventory().map(i => i.name).join(', ') || 'nothing', '| worn:', sdk.getEquipment().map(e => e.name).join(', '));

    for (let lap = 0; lap < 4 && planks() < N; lap++) {
        for (const s of SPAWNS) {
            if (planks() >= N) break;
            if (sdk.getState()!.player.hp < 45 && h.has(/cooked meat/i)) await bot.eatFood(/cooked meat/i);
            await h.walk(s, `plank ${s.x},${s.z}`, 2);
            const p = sdk.getState()!.groundItems.find(g => /^plank$/i.test(g.name) && g.distance <= 4);
            if (p) { await bot.pickupItem(p); console.log('  plank', planks()); }
        }
        if (planks() < N) await sdk.waitForTicks(30);   // let the spawns come back
    }
    console.log('planks:', planks(), '| heading back');
    await h.walk(BANK, 'edgeville bank');
}, { timeout: 30 * 60_000 });
