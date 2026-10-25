import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Turns banked raw beef (left over from the cow farm) into food: withdraw N raw beef at Draynor,
// cook it on the Port Sarim range. Also grabs the cheese spawn in Aggie's house for Witch's House.
//   N=24 bun bots/sam/cook_food.ts
const N = Number(process.env.N ?? 24);
const BANK = { x: 3092, z: 3243 };          // Draynor
const CHEESE = { x: 3084, z: 3261 };        // ground spawn in Aggie's house
const RANGE = { x: 3018, z: 3237 };         // Port Sarim (3019, 3237)

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);

    await h.walk(BANK, 'draynor bank');
    console.log('open bank:', (await bot.openBank()).success);
    for (const n of ['Cooked meat', 'Bones']) await bot.withdrawItem(new RegExp(`^${n}$`, 'i'), -1).catch(() => {});
    const room = Math.min(N, h.freeSlots() - 2);
    console.log('raw beef:', (await bot.withdrawItem(/^raw beef$/i, room)).success, h.count(/^raw beef$/i));
    await bot.closeBank();

    if (!h.has(/^cheese$/i)) {
        await h.walk(CHEESE, 'cheese', 1);
        const c = sdk.findGroundItem(/^cheese$/i);
        if (c) await bot.pickupItem(c);
        console.log('cheese:', h.has(/^cheese$/i));
    }

    await h.walk(RANGE, 'range', 1);
    const range = (await sdk.scanNearbyLocs(6)).find(l => /^range$/i.test(l.name));
    if (!range) { await h.scan('no range'); return; }
    for (let i = 0; i < N * 2 && h.has(/^raw beef$/i); i++) {
        const n = h.count(/^raw beef$/i);
        await bot.useItemOnLoc(/^raw beef$/i, range);
        await sdk.waitForTicks(2);
        // "Cook how many?" -> take the all/most option when it's offered.
        const d = sdk.getState()!.dialog;
        if (d.isOpen && d.options.length > 1) {
            const all = d.options.find(o => /all|x|10|5/i.test(o.text)) ?? d.options[0];
            await sdk.sendClickDialog(all.index);
        }
        await sdk.waitForCondition(() => h.count(/^raw beef$/i) < n, 8_000).catch(() => {});
    }
    console.log('cooked meat:', h.count(/^cooked meat$/i), 'burnt', h.count(/burnt/i), '| hp', sdk.getState()!.player.hp);
}, { timeout: 20 * 60_000 });
