import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Cheap survivability for the green dragon trips: fill the empty armour slots on ~1100gp.
// Real upgrades (adamant platebody 12.8k, rune platebody 65k at Oziach, rune legs 64k at the
// Champions' Guild) need far more money than sam has.
//   Peksa (Barbarian Village): steel full helm (550)
//   Horvik (Varrock): iron platelegs (280)
//   Thessalia (Varrock): leather gloves + boots (6 each)
const EDGE_BANK = { x: 3094, z: 3492 };
const SHOPS = [
    { npc: /^peksa$/i, at: { x: 3076, z: 3429 }, items: [/^steel full helm$/i] },
    { npc: /^horvik/i, at: { x: 3229, z: 3437 }, items: [/^iron platelegs$/i] },
    { npc: /^thessalia$/i, at: { x: 3204, z: 3416 }, items: [/^leather gloves$/i, /^leather boots$/i] },
];
const WEAR = /^(steel full helm|iron platelegs|leather gloves|leather boots)$/i;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const coins = () => sdk.findInventoryItem(/^coins$/i)?.count ?? 0;
    const worn = (re: RegExp) => sdk.getEquipment().some(e => re.test(e.name));

    if (coins() < 900) {
        await h.walk(EDGE_BANK, 'edgeville bank');
        await bot.openBank();
        await bot.withdrawItem(/^coins$/i, -1);
        await bot.closeBank();
    }
    console.log('coins', coins());

    for (const shop of SHOPS) {
        const want = shop.items.filter(re => !worn(re) && !h.has(re));
        if (!want.length) continue;
        await h.walk(shop.at, `${shop.npc}`, 2);
        const o = await bot.openShop(shop.npc);
        if (!o.success) { console.log('shop failed:', o.message); continue; }
        for (const re of want) console.log(`${re}:`, (await bot.buyFromShop(re, 1)).success, '| coins', coins());
        await bot.closeShop();
    }

    for (const it of sdk.getInventory().filter(i => WEAR.test(i.name))) {
        console.log(`wear ${it.name}:`, (await bot.equipItem(new RegExp(`^${it.name}$`, 'i'))).success);
    }
    console.log('worn:', sdk.getEquipment().map(e => e.name).join(', '), '| coins', coins());
}, { timeout: 20 * 60_000 });
