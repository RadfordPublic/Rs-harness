import { runScript } from '../../sdk/runner';
import { Spells } from '../../sdk/spells';
import { helpers, type Pt } from './lib';

// Phase 1 of the alch plan (see lab_log.md): raise gp by chopping yews near Varrock and
// selling them to the general store, buy a staff of air + mind runes, and Wind Strike
// Lumbridge cows to Magic 66 (Magic Guild entry). Steps run in order; each skips itself
// once its goal is met.
//   STEP=all (default) | bank | knife | gp | magic | craft
const STEP = process.env.STEP ?? 'all';
const GP_TARGET = Number(process.env.GP_TARGET ?? 9000);
const MAGIC_TARGET = Number(process.env.MAGIC_TARGET ?? 66);
const MIN_YEW_PRICE = Number(process.env.MIN_YEW_PRICE ?? 30);

const DRAYNOR_BANK = { x: 3092, z: 3245 };
const VARROCK_WEST_BANK = { x: 3185, z: 3436 };
const KNIFE_SPAWN = { x: 3224, z: 3202 };
// Yews are slow to respawn and each general store pays less the more it holds, so alternate
// between a Varrock circuit and an Edgeville one, rotating through each circuit's yew patches.
const CIRCUITS = [
    {
        name: 'Varrock', bank: { x: 3185, z: 3436 }, store: { x: 3217, z: 3415 },   // shopkeeper (3218, 3415)
        spots: [
            { x: 3208, z: 3502, label: 'yews north of the palace' },   // (3204,3504) (3208,3500) (3221,3504)
            { x: 3248, z: 3470, label: 'yew by the church' },          // (3248,3472)
            { x: 3268, z: 3480, label: 'yews NE Varrock' },            // (3266,3493) (3270,3470)
            { x: 3304, z: 3467, label: 'yew east of Varrock' },        // (3304,3469)
        ],
    },
    {
        name: 'Edgeville', bank: { x: 3094, z: 3492 }, store: { x: 3080, z: 3510 },  // shopkeeper (3080, 3511)
        spots: [{ x: 3086, z: 3474, label: 'Edgeville yews' }],                   // (3085,3468) (3085,3480)
    },
];
const ZAFF = { x: 3203, z: 3434 };
const AUBURY = { x: 3253, z: 3403 };
const COW_FIELD = { x: 3253, z: 3280 };
const LUMBRIDGE_STORE = { x: 3212, z: 3247 };
const SHEEP_PEN = { x: 3201, z: 3266 };
const SHEEP_UNSHORN = 43;                       // npc.pack: sheepunsheered (shorn = 42)
const CASTLE_STAIRS = { x: 3206, z: 3209 };     // staircase loc at (3204, 3207)
const CRAFTING_TARGET = 10;                     // spinning flax needs Crafting 10
const BOBS_AXES = { x: 3231, z: 3203 };       // Lumbridge, Bob at (3232, 3203)
const KEEP = /^(knife|coins|(mind|air|chaos) rune|(bronze|steel) axe|staff of (air|fire))$/i;

// Best combat spell for the level; the staff covers its elemental runes.
type Spell = { min: number; spell: number; label: string; staff: RegExp; runes: [string, number][] };
const SPELLS: Spell[] = [
    { min: 35, spell: Spells.FIRE_BOLT, label: 'Fire Bolt', staff: /^staff of fire$/i, runes: [['air rune', 3], ['chaos rune', 1]] },
    { min: 1, spell: Spells.WIND_STRIKE, label: 'Wind Strike', staff: /^staff of air$/i, runes: [['mind rune', 1]] },
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const lvl = (s: string) => sdk.getSkill(s)?.baseLevel ?? 1;
    const me = () => sdk.getState()!.player;
    const dist = (p: Pt) => Math.hypot(p.x - me().worldX, p.z - me().worldZ);
    const coins = () => h.count(/^coins$/i);
    const equipped = (re: RegExp) => sdk.getState()!.equipment.some(e => re.test(e.name));
    let bankCoins = 0;

    async function openBankAt(p: Pt, label: string) {
        await h.walk(p, label);
        const r = await bot.openBank();
        if (!r.success) throw new Error(`bank ${label}: ${r.message}`);
        bankCoins = sdk.getBankItems().find(i => /^coins$/i.test(i.name))?.count ?? 0;
    }

    // Deposit everything except what `keep` matches.
    async function depositAllBut(keep: RegExp) {
        for (const item of sdk.getInventory().filter(i => !keep.test(i.name))) await bot.depositItem(item, -1);
    }

    async function withdrawCoins() {
        if (bankCoins > 0) await bot.withdrawItem(/^coins$/i, bankCoins);
        bankCoins = 0;
    }

    async function shop(npc: RegExp, at: Pt, label: string) {
        await h.walk(at, label, 2);
        let r = await bot.openShop(npc);
        // A closed shop door shows up as "I can't reach that!"; open the nearest one and retry.
        for (let i = 0; i < 2 && !r.success; i++) {
            console.log(`shop ${label}: ${r.message}, opening door`);
            await bot.openDoor();
            r = await bot.openShop(npc);
        }
        if (!r.success) throw new Error(`shop ${label}: ${r.message}`);
    }

    async function bankReport() {
        await openBankAt(DRAYNOR_BANK, 'Draynor bank');
        await depositAllBut(/^$/);
        console.log('bank:', sdk.getBankItems().map(i => `${i.name} x${i.count}`).join(', '));
        await bot.closeBank();
    }

    async function getKnife() {
        if (h.has(/^knife$/i)) return;
        await h.walk(KNIFE_SPAWN, 'knife spawn', 1);
        for (let i = 0; i < 30 && !h.has(/^knife$/i); i++) {
            const knife = sdk.findGroundItem(/^knife$/i);
            if (knife) await bot.pickupItem(knife);
            else await sdk.waitForTicks(5);
        }
        console.log(h.has(/^knife$/i) ? 'got knife' : 'no knife spawned');
    }

    // A steel axe roughly doubles the yew rate over bronze (25/256 vs 12/256 at level 99).
    async function upgradeAxe() {
        if (h.has(/^steel axe$/i) || equipped(/^steel axe$/i) || coins() < 300) return;
        await shop(/^bob$/i, BOBS_AXES, "Bob's Axes");
        console.log(`buy steel axe: ${(await bot.buyFromShop(/^steel axe$/i, 1)).message}`);
        await bot.closeShop();
        if (h.has(/^steel axe$/i)) console.log((await bot.equipItem(/^steel axe$/i)).message);
    }

    // Chop a load of yews, sell them while each one still fetches MIN_YEW_PRICE, bank the rest
    // (banked yews become yew longbows in phase 4).
    async function raiseGp() {
        // Start on the nearest circuit, and sell whatever yews we're already carrying.
        const first = dist(CIRCUITS[0].bank) <= dist(CIRCUITS[1].bank) ? 0 : 1;
        await openBankAt(CIRCUITS[first].bank, `${CIRCUITS[first].name} bank`);
        await depositAllBut(new RegExp(`${KEEP.source}|^yew logs$`, 'i'));
        await withdrawCoins();
        await bot.closeBank();
        await upgradeAxe();
        let trips = 0, dry = 0, spot = 0;
        while (coins() + bankCoins < GP_TARGET && dry < 6) {
            const c = CIRCUITS[(trips + first) % CIRCUITS.length];
            if (h.freeSlots() > 0) {
                const here = c.spots[spot % c.spots.length];
                if (dist(here) > 15) await h.walk(here, here.label);
                const yew = sdk.getNearbyLocs().filter(l => /^yew( tree)?$/i.test(l.name) && Math.hypot(l.x - here.x, l.z - here.z) < 16)
                    .sort((a, b) => dist(a) - dist(b))[0];
                if (!yew) { spot++; if (c.spots.length === 1) await sdk.waitForTicks(10); continue; }
                await bot.chopTree(yew);
                continue;
            }
            await shop(/shop ?keeper|assistant/i, c.store, `${c.name} general store`);
            let sold = 0;
            const before = coins();
            while (h.has(/^yew logs$/i)) {
                const had = coins();
                const r = await bot.sellToShop(/^yew logs$/i, 1);
                if (!r.success) break;
                await sdk.waitForTicks(1);
                sold++;
                if (coins() - had < MIN_YEW_PRICE) break;   // the next one would fetch even less
            }
            await bot.closeShop();
            await openBankAt(c.bank, `${c.name} bank`);
            await depositAllBut(KEEP);
            await bot.closeBank();
            dry = coins() - before >= 10 * MIN_YEW_PRICE ? 0 : dry + 1;
            spot = 0;
            console.log(`trip ${++trips} (${c.name}): sold ${sold} yews for ${coins() - before} gp, ${coins()} gp (target ${GP_TARGET})`);
        }
    }

    async function buyStaff(name: RegExp, label: string) {
        if (h.has(name) || equipped(name)) return;
        await shop(/^zaff$/i, ZAFF, "Zaff's staffs");
        const r = await bot.buyFromShop(name, 1);
        console.log(`buy ${label}: ${r.message}`);
        await bot.closeShop();
    }

    // Casts the runes in the inventory allow for spell `sp`.
    const castsLeft = (sp: Spell) => Math.min(...sp.runes.map(([name, n]) => Math.floor(h.count(new RegExp(`^${name}$`, 'i')) / n)));

    // Buy rune sets for `sp` in batches of 10 casts while every rune stays under 2x its base price.
    async function buyRunes(sp: Spell) {
        await shop(/^aubury$/i, AUBURY, "Aubury's runes");
        let sets = 0;
        for (;;) {
            const stock = sp.runes.map(([name, n]) => ({ name, n, item: sdk.getState()!.shop.shopItems.find(i => i.name.toLowerCase() === name) }));
            const cost = stock.reduce((t, s) => t + (s.item?.buyPrice ?? Infinity) * s.n * 10, 0);
            if (stock.some(s => !s.item || s.item.count < s.n * 10 || s.item.buyPrice > 2 * s.item.baseCost) || coins() < cost) break;
            let ok = true;
            for (const s of stock) ok = ok && (await bot.buyFromShop(new RegExp(`^${s.name}$`, 'i'), s.n * 10)).success;
            if (!ok) break;
            sets += 10;
        }
        await bot.closeShop();
        console.log(`bought runes for ${sets} ${sp.label} casts, ${coins()} gp left`);
        return sets;
    }

    async function trainMagic() {
        if (lvl('Magic') >= MAGIC_TARGET) return true;
        await openBankAt(VARROCK_WEST_BANK, 'Varrock west bank');
        await depositAllBut(KEEP);
        await withdrawCoins();
        await bot.closeBank();
        await buyStaff(/^staff of air$/i, 'staff of air');
        await buyStaff(/^staff of fire$/i, 'staff of fire');   // Fire Bolt now, high alch later
        while (lvl('Magic') < MAGIC_TARGET) {
            const sp = SPELLS.find(s => lvl('Magic') >= s.min)!;
            if (!equipped(sp.staff) && h.has(sp.staff)) console.log((await bot.equipItem(sp.staff)).message);
            if (castsLeft(sp) === 0 && (await buyRunes(sp)) === 0) {
                console.log(`out of runes and gp (${coins()} gp)`);
                return false;
            }
            if (dist(COW_FIELD) > 15) await h.walk(COW_FIELD, 'cow field');
            let casts = 0;
            while (castsLeft(sp) > 0 && lvl('Magic') < MAGIC_TARGET && SPELLS.find(s => lvl('Magic') >= s.min) === sp) {
                const cow = sdk.getNearbyNpcs().filter(n => /^cow$/i.test(n.name)).sort((a, b) => dist(a) - dist(b))[0];
                if (!cow) { await h.walk(COW_FIELD, 'cow field'); await sdk.waitForTicks(3); continue; }
                const r = await bot.castSpell(cow, sp.spell, 6000);
                if (r.reason === 'no_runes') break;
                if (!r.success) { await sdk.waitForTicks(1); continue; }
                if (++casts % 50 === 0) console.log(`${casts} ${sp.label} casts: Magic ${lvl('Magic')}, ${castsLeft(sp)} casts left`);
            }
            console.log(`Magic ${lvl('Magic')} after ${casts} ${sp.label} casts`);
        }
        return true;
    }

    // Crafting 10 for flax: shear Lumbridge sheep and spin the wool on the castle wheel.
    async function trainCrafting() {
        if (lvl('Crafting') >= CRAFTING_TARGET) return;
        if (!h.has(/^shears$/i)) {
            await shop(/shop ?keeper|assistant/i, LUMBRIDGE_STORE, 'Lumbridge general store');
            console.log(`buy shears: ${(await bot.buyFromShop(/^shears$/i, 1)).message}`);
            await bot.closeShop();
        }
        while (lvl('Crafting') < CRAFTING_TARGET) {
            const upstairs = me().level === 1;   // resumed beside the wheel with wool already
            if (!upstairs) await h.walk(SHEEP_PEN, 'sheep pen');
            let fails = 0;
            while (!upstairs && h.freeSlots() > 0 && h.count(/^wool$/i) < 22 && fails < 15) {
                const sheep = sdk.getNearbyNpcs().filter(n => n.id === SHEEP_UNSHORN).sort((a, b) => dist(a) - dist(b))[0];
                if (!sheep) { fails++; await sdk.waitForTicks(5); continue; }
                const before = h.count(/^wool$/i);
                await bot.useItemOnNpc(/^shears$/i, sheep);
                await sdk.waitForCondition(() => h.count(/^wool$/i) > before, 5_000).catch(() => {});
                await bot.dismissBlockingUI();
                fails = h.count(/^wool$/i) > before ? 0 : fails + 1;
            }
            console.log(`sheared ${h.count(/^wool$/i)} wool`);
            if (!upstairs) {
                await h.walk(CASTLE_STAIRS, 'castle stairs');
                await h.climb('up', /^staircase$/i);
            }
            // The wheel (3209, 3212) only works from its south tile.
            // A shut door on L1 can block the way; open it and retry.
            for (let i = 0; i < 3 && dist({ x: 3209, z: 3211 }) > 0; i++) {
                await bot.walkTo(3209, 3211, 0);
                if (dist({ x: 3209, z: 3211 }) > 0) console.log(`wheel tile: ${(await bot.openDoor()).message}`);
            }
            const wheel = (await sdk.scanNearbyLocs(5)).find(l => /spinning wheel/i.test(l.name));
            fails = 0;
            while (wheel && h.has(/^wool$/i) && fails < 5) {
                const before = h.count(/^wool$/i);
                await bot.useItemOnLoc(/^wool$/i, wheel);
                await sdk.waitForCondition(() => h.count(/^wool$/i) < before, 6_000).catch(() => {});
                await bot.dismissBlockingUI();
                fails = h.count(/^wool$/i) < before ? 0 : fails + 1;
            }
            console.log(`spun ${h.count(/ball of wool/i)} balls: Crafting ${lvl('Crafting')}`);
            await h.climb('down', /^staircase$/i);
            for (const ball of sdk.getInventory().filter(i => /ball of wool/i.test(i.name))) await bot.dropItem(ball);
        }
    }

    if (STEP === 'bank') return bankReport();
    if (STEP === 'craft') return trainCrafting();
    if (STEP === 'all' || STEP === 'knife') await getKnife();
    if (STEP === 'gp') await raiseGp();
    if (STEP === 'magic') await trainMagic();
    // Alternate gp and magic until Magic hits the target (gp runs out on mind runes).
    for (let round = 0; STEP === 'all' && lvl('Magic') < MAGIC_TARGET && round < 10; round++) {
        await raiseGp();
        await trainMagic();
    }
    console.log(`done: Magic ${lvl('Magic')}, ${coins()} gp`);
}, { timeout: 8 * 60 * 60_000 });
