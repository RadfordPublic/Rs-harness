import { runScript } from '../../sdk/runner';
import { Spells } from '../../sdk/spells';
import { helpers } from './lib';

// Magic 35 -> 64 so a Wizard's mind bomb (+2, +2%) lifts sam to the Magic Guild's 66 (the door checks
// the boosted level) for its nature runes (1000 stock, 20gp). Cheapest XP here is Curse (29xp, x25)
// with a staff of earth: 2 water + 1 body per cast, ~11gp. Shop prices rise 1% per rune under base
// stock and restock 1 per 10 ticks, so buy only while near base price and wait otherwise.
//   STEP=dhide (Al Kharid: 3 dragonhides -> body) | oziach (sell it) | staff (Zaff) | train TARGET=64
//   STEP=demon SPELL=earth_strike: safespot the Wizards' Tower lesser demon over its railing, runes from Betty
const STEP = process.env.STEP ?? 'train';
const TARGET = Number(process.env.TARGET ?? 64);
const MAX_PRICE = Number(process.env.MAX_PRICE ?? 1.5);   // x base cost
const RESERVE = 150;                                      // keep for tolls/food

const KHARID_BANK = { x: 3269, z: 3167 };
const DRAYNOR_BANK = { x: 3092, z: 3245 };    // coins for the 10gp toll gate
const TANNER = { x: 3275, z: 3192 };
const TAN_GREEN_ALL = 8695;                    // tanner:com_103
const OZIACH = { x: 3068, z: 3516 };
const ZAFF = { x: 3203, z: 3432 };
const STAFF = process.env.STAFF ?? 'earth';      // STAFF=fire for high alchemy
const AUBURY = { x: 3253, z: 3401 };
const SPOT = { x: 3253, z: 3410 };             // outside Aubury's: east Varrock street
const BARMAID = { x: 2957, z: 3371 };          // Rising Sun Inn, Falador
const GUILD_DOOR = { x: 2582, z: 3088 };       // west doors (2584, 3087/3088)
const GUILD_STAIRS = { x: 2591, z: 3088 };     // up to the Magic Store owner (2595, 3087, L1): 1000 nature runes
const BETTY = { x: 3013, z: 3258 };            // Port Sarim rune shop, closest to the Wizards' Tower
// Runes per cast with a staff of earth (earth runes free). SPELL picks one for the demon step.
const SPELLS: Record<string, { id: number; runes: Record<string, number> }> = {
    curse: { id: Spells.CURSE, runes: { water: 2, body: 1 } },
    earth_strike: { id: Spells.EARTH_STRIKE, runes: { air: 1, mind: 1 } },
    earth_bolt: { id: Spells.EARTH_BOLT, runes: { air: 1, chaos: 1 } },
};
const SPELL = SPELLS[process.env.SPELL ?? (STEP === 'train' ? 'curse' : 'earth_strike')];
const WEAPON = /(sword|scimitar|longsword|mace|battleaxe|dagger|spear)$/i;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const magic = () => sdk.getSkill('Magic')?.baseLevel ?? 1;
    const coins = () => h.count(/^coins$/i);
    const xpFor = (lvl: number) => { let p = 0; for (let l = 1; l < lvl; l++) p += Math.floor(l + 300 * 2 ** (l / 7)); return Math.floor(p / 4); };
    const rune = (r: string) => new RegExp(`^${r} rune$`, 'i');
    const casts = () => Math.min(...Object.entries(SPELL.runes).map(([r, n]) => Math.floor(h.count(rune(r)) / n)));
    // Al Kharid behind the toll gate (3268, 3227/3228); the pathfinder won't pay it, so far() does.
    const inKharid = (p: { x: number; z: number }) => p.x >= 3268 && p.z >= 3110 && p.z <= 3330;
    async function crossGate() {
        const inside = inKharid({ x: sdk.getState()!.player.worldX, z: sdk.getState()!.player.worldZ });
        await far({ x: inside ? 3269 : 3266, z: 3228 }, 'toll gate', 1, false);
        const gate = (await sdk.scanNearbyLocs(5)).find(l => /gate/i.test(l.name) && l.x === 3268);
        if (!gate) throw new Error('toll gate not found');
        await bot.interactLoc(gate, 1);
        await sdk.waitForCondition(s => s.dialog.isOpen, 5_000).catch(() => {});
        await h.chat([/^yes, ok/i]);
        await sdk.waitForCondition(s => (s.player.worldX >= 3268) !== inside, 10_000).catch(() => {});
        if ((sdk.getState()!.player.worldX >= 3268) === inside) throw new Error(`toll gate: still ${inside ? 'in' : 'outside'} Al Kharid`);
    }

    async function far(t: { x: number; z: number }, label: string, tol = 2, gate = true) {
        const me = sdk.getState()!.player;
        if (gate && inKharid({ x: me.worldX, z: me.worldZ }) !== inKharid(t)) await crossGate();
        for (let i = 0; i < 15 && !(await h.walk(t, label, tol)); i++);   // Yanille is a long walk
    }

    // Buy SPELL's runes, 10 casts at a time, while they're near base price; returns casts bought.
    async function buyRunes(maxCasts: number, shop = { npc: /^aubury$/i, at: AUBURY }) {
        await far(shop.at, `${shop.npc}`, 3);
        const o = await bot.openShop(shop.npc);
        if (!o.success) { console.log('rune shop:', o.message); return 0; }
        const price = (r: string) => sdk.getState()!.shop.shopItems.find(i => rune(r).test(i.name));
        const ok = (r: string) => { const it = price(r); return !!it && it.count >= 10 && it.buyPrice <= it.baseCost * MAX_PRICE; };
        const need = Object.entries(SPELL.runes);
        const start = casts();
        while (casts() - start < maxCasts && coins() > RESERVE + 100 && h.freeSlots() > 1 && need.every(([r]) => ok(r))) {
            const before = casts();
            for (const [r, n] of need) await bot.buyFromShop(rune(r), 10 * n);
            if (casts() === before) break;
        }
        console.log(`runes: +${casts() - start} casts (${casts()} held) | ${need.map(([r]) => `${r} ${price(r)?.buyPrice}gp x${price(r)?.count}`).join(', ')} | coins ${coins()}`);
        await bot.closeShop();
        return casts() - start;
    }

    async function enterGuild() {
        await steps.leaveTower();
        if (!h.has(/mind bomb/i)) await steps.mindbomb();
        await far(GUILD_DOOR, 'magic guild', 1);
        const boosted = () => sdk.getSkill('Magic')?.level ?? 0;
        if (boosted() < 66) await bot.eatFood(/mind bomb/i);
        await sdk.waitForTicks(2);
        console.log(`magic ${boosted()}/${magic()}`);
        if (boosted() < 66) throw new Error('mind bomb not enough for the guild');
        const door = (await sdk.scanNearbyLocs(4)).find(l => /door/i.test(l.name));
        if (door) await bot.interactLoc(door, /open/i);
        await sdk.waitForCondition(s => s.player.worldX >= 2585, 6_000).catch(() => {});
    }

    const steps: Record<string, () => Promise<void>> = {
        async dhide() {
            if (sdk.getState()!.player.worldX < 3268 && coins() < 50) {
                await far(DRAYNOR_BANK, 'draynor bank');
                await bot.openBank();
                await bot.withdrawItem(/^coins$/i, -1);
                await bot.closeBank();
                console.log('coins for the gate:', coins());
            }
            await far(KHARID_BANK, 'al kharid bank');
            await bot.openBank();
            await bot.withdrawItem(/^dragonhide$/i, -1);
            if (coins() < 600) await bot.withdrawItem(/^coins$/i, -1);   // tanning, 20gp a hide
            if (!h.has(/^needle$/i)) await bot.withdrawItem(/^needle$/i, 1);
            if (!h.has(/^thread$/i)) await bot.withdrawItem(/^thread$/i, -1);
            await bot.closeBank();
            console.log('hides:', h.count(/^dragonhide$/i));
            await h.walk(TANNER, 'tanner', 2);
            await bot.interactNpc(/^(ellis|tanner)$/i, /trade/i);
            await sdk.waitForCondition(s => !!s.interface?.isOpen, 5_000).catch(() => {});
            await sdk.sendClickComponent(TAN_GREEN_ALL);
            await sdk.waitForCondition(() => h.has(/dragon leather/i), 5_000).catch(() => {});
            await bot.closeInterface();
            console.log('leather:', h.count(/dragon leather/i), '| coins', coins());
            // craftLeather only knows "Green dragon leather"; the item here is plain "Dragon leather".
            for (let i = 0; i < 9 && h.count(/dragon leather/i) >= 3; i++) {
                const needle = sdk.findInventoryItem(/^needle$/i)!, leather = sdk.findInventoryItem(/dragon leather/i)!;
                await sdk.sendUseItemOnItem(needle.slot, leather.slot);
                await sdk.waitForCondition(s => s.dialog.isOpen || !!s.interface?.isOpen, 5_000).catch(() => {});
                const s = sdk.getState()!;
                console.log('menu:', s.dialog.options.map(o => o.text).join(' | '), '|', s.interface?.options?.map(o => o.text).join(' | '));
                const opt = s.dialog.options.find(o => /body/i.test(o.text));
                if (opt) await sdk.sendClickDialog(opt.index);
                else if (s.interface?.isOpen) {
                    const io = s.interface.options.find(o => /body/i.test(o.text));
                    if (io) await sdk.clickInterfaceOption(io);
                }
                await sdk.waitForCondition(() => h.has(/body/i), 6_000).catch(() => {});
                await bot.dismissBlockingUI();
            }
            console.log('inv:', sdk.getInventory().map(i => i.name).join(', '), '| crafting', sdk.getSkill('Crafting')?.baseLevel);
        },

        async oziach() {
            await far(OZIACH, 'oziach');
            // After Dragon Slayer, Trade goes through "Can I buy a rune plate mail body now please?".
            await bot.interactNpc(/^oziach$/i, /trade/i);
            await sdk.waitForCondition(s => s.dialog.isOpen || s.shop.isOpen, 8_000).catch(() => {});
            if (!sdk.getState()!.shop.isOpen) await h.chat([/rune plate/i]);
            await sdk.waitForCondition(s => s.shop.isOpen, 8_000).catch(() => {});
            if (!sdk.getState()!.shop.isOpen) { await h.scan('oziach shop'); return; }
            const before = coins();
            const r = await bot.sellToShop(/d'?hide body|dragonhide body/i, process.env.SELL ? Number(process.env.SELL) : 'all');
            await bot.closeShop();
            console.log(`sold body: ${r.success} ${r.message ?? ''} +${coins() - before}gp | coins ${coins()}`);
        },

        async staff() {
            const staff = new RegExp(`^staff of ${STAFF}$`, 'i');
            if (sdk.getEquipment().some(e => staff.test(e.name))) return;
            if (!h.has(staff)) {
                await far(ZAFF, 'zaff');
                const o = await bot.openShop(/^zaff$/i);
                if (!o.success) throw new Error(`zaff: ${o.message}`);
                console.log(`staff of ${STAFF}:`, (await bot.buyFromShop(staff, 1)).success, '| coins', coins());
                await bot.closeShop();
            }
            console.log('wield staff:', (await bot.equipItem(staff)).success);
        },

        // Top floor of the Wizards' Tower: a caged Lesser demon (npc 82) at (3110, 3157, L2).
        async tower() {
            if (sdk.getState()!.player.level === 2) { await bot.walkTo(3110, 3160, 0); return; }
            await far({ x: 3110, z: 3168 }, 'tower door');
            // East door, then the inner door to the room with the staircase (same route as the basement).
            for (const [x, z, wx, wz] of [[3109, 3166, 3109, 3164], [3107, 3162, 3105, 3161]]) {
                const d = (await sdk.scanNearbyLocs(15)).find(l => l.name === 'Door' && l.x === x && l.z === z);
                if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(d);
                await bot.walkTo(wx, wz, 1);
            }
            for (let i = 0; i < 4 && sdk.getState()!.player.level < 2; i++) {
                if (!(await h.climb('up'))) await h.scan('tower', 12);
            }
            // The pen is walled on three sides; its south railing doesn't block spells.
            await bot.walkTo(3110, 3160, 0);
            console.log('tower top:', h.pos(), '| demon', sdk.findNearbyNpc(/demon/i)?.name);
        },

        async leaveTower() {
            for (let i = 0; i < 4 && sdk.getState()!.player.level > 0; i++) await h.climb('down');
            // Doors swing shut behind; open the nearest closed one until sam is out the east door.
            for (let i = 0; i < 6 && !(await h.walk({ x: 3110, z: 3170 }, 'out of tower', 1)); i++) {
                const d = (await sdk.scanNearbyLocs(6)).filter(l => /door/i.test(l.name) && l.optionsWithIndex.some(o => /open/i.test(o.text)))
                    .sort((a, b) => a.distance - b.distance)[0];
                if (d) await bot.openDoor(d);
            }
        },

        async demon() {
            await steps.staff();
            await steps.tower();
            let n = 0, fails = 0;
            const t0 = Date.now(), xp0 = sdk.getSkill('Magic')?.experience ?? 0;
            while (magic() < TARGET && fails < 40) {
                if (casts() === 0) {
                    if (coins() <= RESERVE + 100) { console.log('out of money'); break; }
                    await steps.leaveTower();
                    // Only what's left to TARGET (xp per cast measured so far, +10 spare), so coins stay for nature runes.
                    const xpNow = sdk.getSkill('Magic')?.experience ?? 0, perCast = n ? (xpNow - xp0) / n : 1500;
                    const want = Math.min(150, Math.ceil((xpFor(TARGET) - xpNow) / perCast) + 10);
                    if (!(await buyRunes(want, { npc: /^betty$/i, at: BETTY }))) { console.log('no runes bought'); break; }
                    await steps.tower();
                }
                const demon = sdk.findNearbyNpc(/demon/i);
                if (!demon) { await sdk.waitForTicks(5); continue; }   // dead, respawning
                const xp = sdk.getSkill('Magic')?.experience ?? 0;
                await bot.castSpell(demon, SPELL.id);
                await sdk.waitForCondition(() => (sdk.getSkill('Magic')?.experience ?? 0) > xp, 4_000).catch(() => {});
                if ((sdk.getSkill('Magic')?.experience ?? 0) === xp) { fails++; await sdk.waitForTicks(5); continue; }
                fails = 0;
                if (++n % 10 === 0) {
                    const min = (Date.now() - t0) / 60_000, gained = (sdk.getSkill('Magic')?.experience ?? 0) - xp0;
                    console.log(`  ${n} casts, magic ${magic()} | ${Math.round(gained / min)} xp/min | ${casts()} casts left`);
                }
            }
            if (fails) console.log('last messages:', h.messages().slice(-3));
            console.log(`demon done: ${n} casts, magic ${magic()}, ${casts()} casts left | coins ${coins()}`);
        },

        // Rising Sun Inn, Falador: "I'll try the Mind Bomb." for 2gp.
        async mindbomb() {
            await far(BARMAID, 'rising sun');
            for (let i = 0; i < 2 && h.count(/mind bomb/i) < 2; i++) await h.talk(/barmaid/i, [/what ales/i, /mind bomb/i]);
            console.log('mind bombs:', h.count(/mind bomb/i));
        },

        // Wizards' Guild, Yanille: the door checks the boosted level against 66, so drink at the door.
        async guild() {
            const p = () => sdk.getState()!.player;
            const inside = () => p().level === 1 || (p().worldX > 2584 && p().worldX < 2597 && Math.abs(p().worldZ - 3088) < 8);
            if (!inside()) await enterGuild();
            if (p().level === 0) { await h.walk(GUILD_STAIRS, 'guild stairs', 1); await h.climb('up', /staircase/i); }
            const o = await bot.openShop(/magic store owner/i);
            if (!o.success) { await h.scan('guild shop'); return; }
            const nat = () => sdk.getState()!.shop.shopItems.find(i => /^nature rune$/i.test(i.name));
            console.log(`nature: ${nat()?.buyPrice}gp x${nat()?.count} | coins ${coins()}`);
            while (coins() - RESERVE > (nat()?.buyPrice ?? 1e9) * 10 && (nat()?.count ?? 0) >= 10) {
                const before = h.count(/^nature rune$/i);
                await bot.buyFromShop(/^nature rune$/i, 10);
                if (h.count(/^nature rune$/i) === before) break;
            }
            console.log(`bought nature runes: ${h.count(/^nature rune$/i)} | now ${nat()?.buyPrice}gp | coins ${coins()}`);
            await bot.closeShop();
        },

        async train() {
            const weapon = sdk.getEquipment().find(e => WEAPON.test(e.name))?.name;
            await steps.staff();
            const skip = new Map<number, number>();   // npc index -> until (already cursed)
            let n = 0, idle = 0;
            while (magic() < TARGET) {
                if (casts() === 0) {
                    if (coins() <= RESERVE + 30) { console.log('out of money'); break; }
                    if (!(await buyRunes(60))) {
                        if (++idle > 15) { console.log('prices stayed high'); break; }
                        console.log('prices high, waiting for restock'); await sdk.waitForTicks(100); continue;
                    }
                    idle = 0;
                    await h.walk(SPOT, 'curse spot', 4);
                }
                const now = Date.now();
                const npc = sdk.getNearbyNpcs()
                    .filter(c => c.optionsWithIndex?.some(o => /attack/i.test(o.text)) && (skip.get(c.index) ?? 0) < now && c.distance < 10)
                    .sort((a, b) => a.distance - b.distance)[0];
                if (!npc) { await sdk.waitForTicks(5); continue; }
                const xp = sdk.getSkill('Magic')?.experience ?? 0;
                const r = await bot.castSpell(npc, SPELL.id);
                await sdk.waitForCondition(() => (sdk.getSkill('Magic')?.experience ?? 0) > xp, 4_000).catch(() => {});
                if ((sdk.getSkill('Magic')?.experience ?? 0) === xp) {
                    // Already cursed, splashed, or out of reach: try someone else for a minute.
                    skip.set(npc.index, now + 60_000);
                    if (!r.success) await sdk.waitForTicks(1);
                    continue;
                }
                skip.set(npc.index, now + 60_000);    // defence stays lowered for a while
                if (++n % 25 === 0) console.log(`  ${n} curses, magic ${magic()} | ${casts()} casts left, coins ${coins()}`);
            }
            if (weapon) console.log(`re-wield ${weapon}:`, (await bot.equipItem(new RegExp(`^${weapon}$`, 'i'))).success);
            console.log(`done: magic ${magic()} after ${n} curses | coins ${coins()}, ${casts()} casts left`);
        },
    };

    await steps[STEP]();
}, { timeout: 180 * 60_000 });
