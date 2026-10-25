import { runScript } from '../../sdk/runner';
import { Spells } from '../../sdk/spells';
import type { BankItem } from '../../sdk/types';
import { helpers, type Pt } from './lib';

// Phases 2-4 of the alch plan (see lab_log.md), based at Seers' Village:
//   fletch  - flax -> bow strings, and Fletching to 70 with the best bow each level allows,
//             strung for double XP. Strung bows are banked to alch later.
//   yanille - take every banked strung bow (as notes) and all coins to the Magic Guild, alternate
//             buying nature runes and high alching the bows, then bring NATURE_STOCK runes home.
//   loop    - chop yews, cut + string yew longbows, high alch them (768gp each) at Seers' bank;
//             fetches more nature runes from Yanille when they run out.
//   STEP=all (default: travel, fletch, yanille, loop) | travel | strings | fletch | yanille | loop
const STEP = process.env.STEP ?? 'all';
const FLETCH_TARGET = Number(process.env.FLETCH_TARGET ?? 70);
const NATURE_STOCK = Number(process.env.NATURE_STOCK ?? 300);     // runes to bring back from Yanille
const MAX_NATURE_PRICE = Number(process.env.MAX_NATURE_PRICE ?? 60);

const SEERS_BANK = { x: 2725, z: 3491 };
const FLAX_FIELD = { x: 2741, z: 3444 };
const WHEEL_LADDER = { x: 2715, z: 3471 };    // ladder (2715, 3470) up to the wheel (2711, 3471) on L1
const HOME_BANKS = [                          // to drop coins at before the walk (gp is lost on death)
    { x: 3092, z: 3245, label: 'Draynor bank' },
    { x: 3185, z: 3436, label: 'Varrock west bank' },
    { x: 3094, z: 3492, label: 'Edgeville bank' },
];
const GUILD_DOOR = { x: 2583, z: 3088 };     // west doors (2584, 3087-3088), Magic 66 to enter
const GUILD_STAIRS = { x: 2590, z: 3088 };   // stairs (2590, 3089) up to the store on L1
const KEEP = /^(knife|staff of fire|steel axe|nature rune)$/i;
const BOW_STRING = 1777, FLAX = 1779, NATURE = 561, COINS = 995;
const STRUNG_BOWS = [839, 847, 849, 851, 855, 859];   // longbow, willow long/short, maple, yew, magic

type Recipe = { min: number; log: number; unstrung?: number; product: string; trees: RegExp; spot: Pt };
// Highest level first; spots are the nearest patch to Seers' bank.
const RECIPES: Recipe[] = [
    { min: 70, log: 1515, unstrung: 66, product: 'yew long', trees: /^yew( tree)?$/i, spot: { x: 2709, z: 3461 } },
    { min: 55, log: 1517, unstrung: 62, product: 'maple long', trees: /^maple( tree)?$/i, spot: { x: 2727, z: 3499 } },
    { min: 40, log: 1519, unstrung: 58, product: 'willow long', trees: /^willow( tree)?$/i, spot: { x: 2711, z: 3507 } },
    { min: 35, log: 1519, unstrung: 60, product: 'willow short', trees: /^willow( tree)?$/i, spot: { x: 2711, z: 3507 } },
    { min: 10, log: 1511, unstrung: 48, product: 'long', trees: /^tree$/i, spot: { x: 2727, z: 3484 } },
    { min: 1, log: 1511, product: 'shaft', trees: /^tree$/i, spot: { x: 2727, z: 3484 } },
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const lvl = (s: string) => sdk.getSkill(s)?.baseLevel ?? 1;
    const me = () => sdk.getState()!.player;
    const dist = (p: Pt) => Math.hypot(p.x - me().worldX, p.z - me().worldZ);
    const invId = (id: number) => sdk.getInventory().filter(i => i.id === id).reduce((n, i) => n + i.count, 0);
    const bankItem = (id: number): BankItem | undefined => sdk.getBankItems().find(i => i.id === id);
    const recipe = () => RECIPES.find(r => lvl('Fletching') >= r.min)!;

    async function openBank() {
        if (dist(SEERS_BANK) > 4) await h.walk(SEERS_BANK, "Seers' bank");
        const r = await bot.openBank();
        if (!r.success) throw new Error(`Seers' bank: ${r.message}`);
        for (const item of sdk.getInventory().filter(i => !KEEP.test(i.name))) await bot.depositItem(item, -1);
    }

    async function travel() {
        if (dist(SEERS_BANK) < 100) return;
        const home = [...HOME_BANKS].sort((a, b) => dist(a) - dist(b))[0];
        await h.walk(home, home.label);
        const r = await bot.openBank();
        if (r.success) {
            for (const item of sdk.getInventory().filter(i => !KEEP.test(i.name))) await bot.depositItem(item, -1);
            await bot.closeBank();
        }
        // The route crosses White Wolf Mountain; carry nothing worth losing.
        console.log(`walking to Seers' with HP ${sdk.getSkill('Hitpoints')?.level}`);
        const w = await bot.walkTo(SEERS_BANK.x, SEERS_BANK.z, 3, { timeout: 20 * 60_000 });
        console.log(`travel: ${w.success ? 'ok' : w.message} now ${h.pos()} HP ${sdk.getSkill('Hitpoints')?.level}`);
    }

    // One inventory of flax -> bow strings, banked.
    async function stringRun() {
        if (lvl('Crafting') < 10) throw new Error('need Crafting 10 to spin flax');
        await h.walk(FLAX_FIELD, 'flax field');
        let misses = 0;
        while (h.freeSlots() > 0 && misses < 10) {
            const flax = sdk.getNearbyLocs().filter(l => /^flax$/i.test(l.name)).sort((a, b) => dist(a) - dist(b))[0];
            if (!flax) { misses++; await sdk.waitForTicks(3); continue; }
            const before = invId(FLAX);
            await bot.interactLoc(flax, /pick/i);
            await sdk.waitForCondition(() => invId(FLAX) > before, 5_000).catch(() => {});
            misses = invId(FLAX) > before ? 0 : misses + 1;
        }
        console.log(`picked ${invId(FLAX)} flax`);
        await h.walk(WHEEL_LADDER, 'wheel house ladder', 1);
        await h.climb('up', /^ladder$/i);
        const wheel = (await sdk.scanNearbyLocs(8)).find(l => /spinning wheel/i.test(l.name));
        misses = 0;
        while (wheel && invId(FLAX) > 0 && misses < 5) {
            const before = invId(FLAX);
            await bot.useItemOnLoc(/^flax$/i, wheel);
            await sdk.waitForCondition(() => invId(FLAX) < before, 6_000).catch(() => {});
            await bot.dismissBlockingUI();
            misses = invId(FLAX) < before ? 0 : misses + 1;
        }
        console.log(`spun ${invId(BOW_STRING)} bow strings${wheel ? '' : ' (no wheel found!)'}`);
        await h.climb('down', /^ladder$/i);
        await openBank();
        console.log(`bank: ${bankItem(BOW_STRING)?.count ?? 0} bow strings`);
        await bot.closeBank();
    }

    async function chopLoad(r: Recipe) {
        await h.walk(r.spot, `${r.product} trees`);
        let misses = 0;
        while (h.freeSlots() > 0 && misses < 20) {
            const tree = sdk.getNearbyLocs().filter(l => r.trees.test(l.name)).sort((a, b) => dist(a) - dist(b))[0];
            if (!tree || dist(tree) > 25) { misses++; await h.walk(r.spot, `${r.product} trees`); await sdk.waitForTicks(5); continue; }
            misses = (await bot.chopTree(tree)).success ? 0 : misses + 1;
        }
    }

    // Use a bow string on each unstrung bow.
    async function stringBows(unstrung: number) {
        let misses = 0;
        while (invId(unstrung) > 0 && invId(BOW_STRING) > 0 && misses < 5) {
            const bow = sdk.getInventory().find(i => i.id === unstrung)!;
            const str = sdk.getInventory().find(i => i.id === BOW_STRING)!;
            const before = invId(unstrung);
            await sdk.sendUseItemOnItem(str.slot, bow.slot);
            await sdk.waitForCondition(s => s.dialog.isOpen || s.interface?.isOpen || invId(unstrung) < before, 5_000).catch(() => {});
            if (invId(unstrung) === before) { await bot.dismissBlockingUI(); misses++; } else misses = 0;
        }
    }

    async function fletch() {
        while (lvl('Fletching') < FLETCH_TARGET) {
            const r = recipe();
            await openBank();
            const logs = bankItem(r.log)?.count ?? 0;
            const strings = bankItem(BOW_STRING)?.count ?? 0;
            if (r.unstrung && strings === 0) { await bot.closeBank(); await stringRun(); continue; }
            const n = r.unstrung ? Math.min(Math.floor(h.freeSlots() / 2), strings) : h.freeSlots();
            if (logs < n) { await bot.closeBank(); await chopLoad(r); continue; }
            await bot.withdrawItem(bankItem(r.log)!, n);
            if (r.unstrung) await bot.withdrawItem(bankItem(BOW_STRING)!, n);
            await bot.closeBank();
            await sdk.waitForTicks(2);   // a knife use sent straight after closing the bank is dropped
            let made = 0, fails = 0;
            while (invId(r.log) > 0 && fails < 3) {
                const f = await bot.fletchLogs(r.product);
                if (!f.success) { console.log(`fletch ${r.product}: ${f.message}`); fails++; await sdk.waitForTicks(2); continue; }
                made++;
                fails = 0;
            }
            if (r.unstrung) await stringBows(r.unstrung);
            console.log(`made ${made} x ${r.product}: Fletching ${lvl('Fletching')}`);
        }
        await openBank();
        await bot.closeBank();
    }

    // High alch every strung bow (or bow note) in the inventory while nature runes last.
    async function alchBows() {
        let alched = 0;
        for (;;) {
            const bow = sdk.getInventory().find(i => /(long|short)bow$/i.test(i.name));
            if (!bow || invId(NATURE) === 0) break;
            const before = invId(COINS);
            await sdk.sendSpellOnItem(bow.slot, Spells.HIGH_ALCHEMY);
            await sdk.waitForCondition(() => invId(COINS) > before, 5_000).catch(() => {});
            if (invId(COINS) === before) { console.log(`alch ${bow.name} did nothing`); break; }
            alched++;
            await sdk.waitForTicks(3);   // alchemy has a 5-tick delay
        }
        return alched;
    }

    // Buy up to `want` nature runes while they stay under MAX_NATURE_PRICE.
    async function buyNatures(want: number) {
        const r = await bot.openShop(/magic store owner/i);
        if (!r.success) throw new Error(`Magic Guild store: ${r.message}`);
        let bought = 0;
        while (bought < want) {
            const stock = sdk.getState()!.shop.shopItems.find(i => i.id === NATURE);
            const batch = Math.min(10, want - bought);
            if (!stock || stock.count < batch || stock.buyPrice > MAX_NATURE_PRICE || invId(COINS) < stock.buyPrice * batch) break;
            if (!(await bot.buyFromShop(/^nature rune$/i, batch)).success) break;
            bought += batch;
        }
        await bot.closeShop();
        await sdk.waitForTicks(2);
        return bought;
    }

    async function yanilleTrip() {
        await openBank();
        for (const id of STRUNG_BOWS) {
            const b = bankItem(id);
            if (b) await bot.withdrawItem(b, b.count, { asNote: true });
        }
        const gp = bankItem(COINS);
        if (gp) await bot.withdrawItem(gp, gp.count);
        await bot.closeBank();
        const bows = () => sdk.getInventory().filter(i => /(long|short)bow$/i.test(i.name)).reduce((n, i) => n + i.count, 0);
        console.log(`to Yanille with ${bows()} bows, ${invId(COINS)} gp, ${invId(NATURE)} natures`);
        const w = await bot.walkTo(GUILD_DOOR.x, GUILD_DOOR.z, 1, { timeout: 20 * 60_000 });
        if (!w.success) throw new Error(`walk to the Magic Guild: ${w.message}`);
        await bot.openDoor(/door/i);
        await h.walk(GUILD_STAIRS, 'guild stairs', 1);
        await h.climb('up', /^(stairs|staircase)$/i);
        let alched = 0;
        while (bows() > 0) {
            const got = await buyNatures(bows() - invId(NATURE));
            const n = await alchBows();
            alched += n;
            console.log(`bought ${got} natures, alched ${n}: ${invId(COINS)} gp, ${bows()} bows left`);
            if (got === 0 && n === 0) break;
        }
        const extra = await buyNatures(NATURE_STOCK - invId(NATURE));
        console.log(`Yanille: alched ${alched} bows, bought ${extra} natures to take home; ${invId(COINS)} gp, ${invId(NATURE)} natures`);
        await h.climb('down', /^(stairs|staircase)$/i);
        const back = await bot.walkTo(SEERS_BANK.x, SEERS_BANK.z, 3, { timeout: 20 * 60_000 });
        console.log(`back to Seers': ${back.success ? 'ok' : back.message}`);
        await openBank();
        await bot.closeBank();
    }

    // Yew longbows: chop, cut, string, alch. Runs until stopped.
    async function alchLoop() {
        const r = RECIPES[0];
        let total = 0;
        for (;;) {
            await openBank();
            const natures = invId(NATURE) + (bankItem(NATURE)?.count ?? 0);
            if (natures === 0) { await bot.closeBank(); await yanilleTrip(); continue; }
            if (invId(NATURE) === 0) await bot.withdrawItem(bankItem(NATURE)!, bankItem(NATURE)!.count);
            const strings = bankItem(BOW_STRING)?.count ?? 0;
            if (strings === 0) { await bot.closeBank(); await stringRun(); continue; }
            const n = Math.min(Math.floor(h.freeSlots() / 2), strings, invId(NATURE));
            if ((bankItem(r.log)?.count ?? 0) < n) { await bot.closeBank(); await chopLoad(r); continue; }
            await bot.withdrawItem(bankItem(r.log)!, n);
            await bot.withdrawItem(bankItem(BOW_STRING)!, n);
            await bot.closeBank();
            await sdk.waitForTicks(2);
            let fails = 0;
            while (invId(r.log) > 0 && fails < 3) {
                if ((await bot.fletchLogs(r.product)).success) fails = 0;
                else { fails++; await sdk.waitForTicks(2); }
            }
            await stringBows(r.unstrung!);
            const before = invId(COINS);
            const alched = await alchBows();
            total += alched;
            console.log(`alched ${alched} yew longbows for ${invId(COINS) - before} gp (${total} total), Magic ${lvl('Magic')}, ${invId(NATURE)} natures left`);
        }
    }

    if (STEP === 'all' || STEP === 'travel') await travel();
    if (STEP === 'strings') await stringRun();
    if (STEP === 'all' || STEP === 'fletch') await fletch();
    if (STEP === 'all' || STEP === 'yanille') await yanilleTrip();
    if (STEP === 'all' || STEP === 'loop') await alchLoop();
    console.log(`done: Fletching ${lvl('Fletching')}, Crafting ${lvl('Crafting')}, ${h.pos()}`);
}, { timeout: 8 * 60 * 60_000 });
