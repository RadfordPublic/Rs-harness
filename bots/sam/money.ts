import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Pickpockets in Falador until we hold GOAL coins (default 2100: the Lady Lumbridge costs 2000).
// Men/women until Thieving 40, then guards (30gp each, pickpocket.dbrow). XP is 25x here.
//   GOAL=2100 bun bots/sam/money.ts
const GOAL = Number(process.env.GOAL ?? 2100);
const MEN = { x: 2970, z: 3380 };
const GUARDS = { x: 2960, z: 3385 };

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const coins = () => h.count(/^coins$/i);
    const thieving = () => sdk.getSkill('Thieving')?.baseLevel ?? 1;
    let tries = 0;
    console.log(`start: ${coins()}gp, thieving ${thieving()}`);
    while (coins() < GOAL && tries < 600) {
        const hp = sdk.getState()!.player.hp;
        if (hp < 40) {
            if (h.has(/cooked meat/i)) await bot.eatFood(/cooked meat/i);
            else { console.log('low hp, no food: resting'); await sdk.waitForCondition(s => s.player.hp >= 60, 120_000).catch(() => {}); }
            continue;
        }
        const guards = thieving() >= 40;
        const target = sdk.findNearbyNpc(guards ? /^guard$/i : /^(man|woman)$/i, { reachable: true });
        if (!target) { await h.walk(guards ? GUARDS : MEN, guards ? 'guards' : 'men', 4); await sdk.waitForTicks(3); continue; }
        await bot.pickpocketNpc(target);
        if (++tries % 25 === 0) console.log(`  ${tries} tries: ${coins()}gp, thieving ${thieving()}, hp ${sdk.getState()!.player.hp}`);
    }
    console.log(`done: ${coins()}gp, thieving ${thieving()} after ${tries} tries`);
}, { timeout: 60 * 60_000 });
