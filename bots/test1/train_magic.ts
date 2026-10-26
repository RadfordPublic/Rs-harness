import { runScript } from '../../sdk/runner';
import { Spells } from '../../sdk/spells';
import { helpers } from './lib';

// Wind Strike on the Lumbridge cows with test1's own air + mind runes, up to MAGIC_TARGET
// (default 66, the Magic Guild's entry level). Banks first (any bank, they're global) for the
// runes and coins, then crosses the Al Kharid toll gate if it's on that side.
const MAGIC_TARGET = Number(process.env.MAGIC_TARGET ?? 66);
const COW_FIELD = { x: 3253, z: 3280 };
const BANKS = [
    { x: 3269, z: 3167, label: 'Al Kharid bank' },
    { x: 3253, z: 3420, label: 'Varrock east bank' },
    { x: 3092, z: 3245, label: 'Draynor bank' },
];
const AIR = /^air rune$/i, MIND = /^mind rune$/i, COINS = /^coins$/i;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const lvl = () => sdk.getSkill('Magic')?.baseLevel ?? 1;
    const me = () => sdk.getState()!.player;
    const dist = (p: { x: number, z: number }) => Math.hypot(p.x - me().worldX, p.z - me().worldZ);
    const casts = () => Math.min(h.count(AIR), h.count(MIND));

    // Bank everything else; take all the mind runes, as many air runes, and the coins.
    const bank = [...BANKS].sort((a, b) => dist(a) - dist(b))[0];
    await h.walk(bank, bank.label);
    const o = await bot.openBank();
    if (!o.success) throw new Error(`openBank: ${o.message}`);
    for (const item of [...new Set(sdk.getInventory().map(i => i.name))]) {
        if (!AIR.test(item) && !MIND.test(item) && !COINS.test(item)) await bot.depositItem(new RegExp(`^${item}$`, 'i'), -1);
    }
    const take = (re: RegExp) => sdk.getBankItems().find(i => re.test(i.name));
    const mind = take(MIND);
    if (mind) await bot.withdrawItem(mind, mind.count);
    await sdk.waitForTicks(1);
    const air = take(AIR);
    if (air) await bot.withdrawItem(air, Math.max(0, h.count(MIND) - h.count(AIR)));
    const gp = take(COINS);
    if (gp) await bot.withdrawItem(gp, gp.count);
    await sdk.waitForTicks(1);
    await bot.closeBank();
    console.log(`Magic ${lvl()}: ${casts()} Wind Strike casts in the inventory, ${h.count(COINS)} gp`);

    if (!(await h.tollGate('west'))) throw new Error('could not leave Al Kharid');
    let n = 0, fails = 0;
    while (lvl() < MAGIC_TARGET && casts() > 0 && fails < 20) {
        if (dist(COW_FIELD) > 15) await h.walk(COW_FIELD, 'cow field');
        const cow = sdk.getNearbyNpcs().filter(c => /^cow$/i.test(c.name)).sort((a, b) => dist(a) - dist(b))[0];
        if (!cow) { await sdk.waitForTicks(3); fails++; continue; }
        const r = await bot.castSpell(cow, Spells.WIND_STRIKE, 6000);
        if (r.reason === 'no_runes') break;
        if (!r.success) { fails++; await sdk.waitForTicks(1); continue; }
        fails = 0;
        if (++n % 50 === 0) console.log(`${n} casts: Magic ${lvl()}, ${casts()} casts left`);
    }
    console.log(`done: Magic ${lvl()} after ${n} casts, ${casts()} casts left, ${h.pos()}`);
}, { timeout: 4 * 60 * 60_000 });
