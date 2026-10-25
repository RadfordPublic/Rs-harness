import { runScript } from '../../sdk/runner';
import { Spells } from '../../sdk/spells';
import { helpers } from './lib';

// Buys air + mind runes from Betty (Port Sarim) and wind-strikes the nearby men until Magic TARGET
// (default 33, Dragon Slayer's Telegrab requirement). XP is 25x here, so ~75 casts from 31 to 33.
//   TARGET=33 bun bots/sam/magic_train.ts
const TARGET = Number(process.env.TARGET ?? 33);
const SPARE = 15;                                // keep this many casts for Wormbrain
const BETTY = { x: 3013, z: 3258 };
const MEN = { x: 3015, z: 3237 };

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const magic = () => sdk.getSkill('Magic')?.baseLevel ?? 1;
    const casts = () => Math.min(h.count(/^air rune$/i), h.count(/^mind rune$/i));

    // Rough count: 137.5 xp per cast at 25x.
    const xpFor = (lvl: number) => { let p = 0; for (let l = 1; l < lvl; l++) p += Math.floor(l + 300 * 2 ** (l / 7)); return Math.floor(p / 4); };
    const need = Math.ceil(Math.max(0, xpFor(TARGET) - (sdk.getSkill('Magic')?.experience ?? 0)) / 137.5) + SPARE;
    if (casts() < need) {
        await h.walk(BETTY, 'betty');
        await bot.openShop(/betty/i);
        const buy = need - casts() + 5;
        console.log('air:', (await bot.buyFromShop(/^air rune$/i, buy)).success, 'mind:', (await bot.buyFromShop(/^mind rune$/i, buy)).success);
        await bot.closeShop();
    }
    console.log(`magic ${magic()}, ${casts()} casts in hand, coins ${h.count(/^coins$/i)}`);

    await h.walk(MEN, 'men');
    let n = 0;
    while (magic() < TARGET && casts() > SPARE) {
        const man = sdk.findNearbyNpc(/^(man|woman)$/i, { reachable: true });
        if (!man) { await sdk.waitForTicks(5); continue; }
        const r = await bot.castSpell(man, Spells.WIND_STRIKE);
        if (!r.success) { await sdk.waitForTicks(2); continue; }
        if (++n % 20 === 0) console.log(`  ${n} casts, magic ${magic()}`);
        if (sdk.getState()!.player.hp < 40 && h.has(/cooked meat/i)) await bot.eatFood(/cooked meat/i);
    }
    console.log(`done: magic ${magic()}, ${casts()} casts left`);
}, { timeout: 30 * 60_000 });
