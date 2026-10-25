import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Kills the chaos druids in Taverley Dungeon until we hold LAWS law runes (drop tables/chaos_druid.rs2:
// 2 laws at 7/128). Needed for Telekinetic Grab on Wormbrain's map piece (Dragon Slayer).
//   LAWS=3 bun bots/sam/law_hunt.ts
const LAWS = Number(process.env.LAWS ?? 3);
const LADDER = { x: 2884, z: 3398 };          // Taverley Dungeon ladder (2884, 3397)
const DRUIDS = { x: 2933, z: 9849 };
const LOOT = /^(law rune|nature rune|grimy .*)$/i;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const laws = () => h.count(/^law rune$/i);
    if (sdk.getState()!.player.worldZ < 9000) {
        await h.walk(LADDER, 'dungeon ladder', 1);
        await h.climb('down', /ladder/i);
    }
    if (!(await h.walk(DRUIDS, 'druids', 3))) { await h.scan('path to druids', 12); return; }
    let kills = 0;
    while (laws() < LAWS && kills < 150) {
        if (sdk.getState()!.player.hp < 45 && h.has(/cooked meat/i)) { await bot.eatFood(/cooked meat/i); continue; }
        const loot = sdk.getState()!.groundItems.find(g => LOOT.test(g.name) && g.distance <= 8);
        if (loot && h.freeSlots() > 0) { await bot.pickupItem(loot); continue; }
        const d = sdk.getNearbyNpcs().filter(n => /^chaos druid$/i.test(n.name) && n.hp !== 0 && n.reachable !== false).sort((a, b) => a.distance - b.distance)[0];
        if (!d) { await sdk.waitForTicks(5); await h.walk(DRUIDS, 'druids', 3); continue; }
        if (!(await bot.attack(d)).success) { await sdk.waitForTicks(1); continue; }
        await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === d.index && n.hp !== 0), 30_000).catch(() => {});
        await sdk.waitForTicks(2);
        if (++kills % 10 === 0) console.log(`  ${kills} kills, ${laws()} laws, hp ${sdk.getState()!.player.hp}`);
    }
    console.log(`laws: ${laws()} after ${kills} kills`);
}, { timeout: 40 * 60_000 });
