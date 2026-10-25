import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Black Knights' Fortress (needs 12 QP). Run all, or one step with STEP=<name>:
//   cabbage | amik | money | chainbody | helm | grill | hole | leave | finish | scan
// quest_blackknight + sir_amik_varze.rs2. The fortress guard door only opens for someone wearing
// an iron chainbody and a bronze med helm. Listen at the grill, then drop a normal cabbage
// (not a Draynor Manor one) down the hole above the witch's cauldron.
const STEP = process.env.STEP ?? 'all';

const CABBAGES = { x: 2903, z: 3419 };        // Taverley patch
const AMIK = { x: 2960, z: 3336 };            // Falador castle, L2
const FALADOR_STORE = { x: 2957, z: 3387 };
const MEN = { x: 2967, z: 3373 };             // pickpocket spot if the gold bar doesn't cover it
const WAYNE = { x: 2973, z: 3312 };           // Wayne's Chains, Falador
const HELMETS = { x: 3076, z: 3428 };         // Barbarian Village helmet shop
const FORTRESS_DOOR = { x: 3016, z: 3513 };   // guard entrance (3016, 3514), approach from the south
const GRILL = { x: 3025, z: 3507 };
const HOLE = { x: 3031, z: 3507 };            // L1
const COST = 210 + 24;

const CHOICES = [
    /i seek a quest/i, /i laugh in the face of danger/i, /i'll give it a go/i, /ok, i'll give it a try/i,
    /found out what the black knight's secret weapon is/i, /ruined the black knight's invincibility potion/i,
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const level = () => sdk.getState()!.player.level;
    const coins = () => h.count(/^coins$/i);
    const wearing = (re: RegExp) => sdk.getEquipment().some(e => re.test(e.name));

    async function climbTo(target: number) {
        for (let i = 0; i < 4 && level() !== target; i++) await h.climb(level() < target ? 'up' : 'down', /stair|ladder/i);
    }

    async function buy(at: { x: number; z: number }, label: string, item: RegExp) {
        await h.walk(at, label);
        console.log('shop:', (await bot.openShop()).message);
        const r = await bot.buyFromShop(item, 1);
        console.log(`buy ${item.source}: ${r.success} ${r.message ?? ''}`);
        await bot.closeShop();
    }

    // Opens the first closed door/wall matching `re` near (x, z).
    async function open(x: number, z: number, opt = /open|push/i) {
        const loc = (await sdk.scanNearbyLocs(6)).find(l => l.x === x && l.z === z && l.optionsWithIndex.some(o => opt.test(o.text)));
        if (!loc) { console.log(`nothing to open at ${x},${z}`); return false; }
        await bot.interactLoc(loc, opt);
        await sdk.waitForTicks(3);
        return true;
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 12); },

        async cabbage() {
            if (h.has(/^cabbage$/i)) return;
            await h.walk(CABBAGES, 'cabbages');
            const c = sdk.findNearbyLoc(/^cabbage$/i);
            if (c) await bot.interactLoc(c, /pick/i);
            await sdk.waitForCondition(() => h.has(/^cabbage$/i), 6_000).catch(() => {});
            console.log('cabbage:', h.has(/^cabbage$/i));
        },

        async amik() {
            await h.walk(AMIK, 'falador castle');
            await climbTo(2);
            await h.walk(AMIK, 'amik', 2);
            // He wanders round the room and is sometimes behind a door; give him a moment and retry.
            for (let i = 0; i < 5 && !(await h.talk(/amik/i, CHOICES)); i++) { await sdk.waitForTicks(5); await h.walk(AMIK, 'amik', 2); }
            await climbTo(0);
        },

        async money() {
            if (h.has(/gold bar/i)) {
                await h.walk(FALADOR_STORE, 'falador store');
                await bot.openShop();
                console.log('sell gold bar:', (await bot.sellToShop(/gold bar/i, 1)).success, 'coins', coins());
                await bot.closeShop();
            }
            const need = COST - (wearing(/iron chainbody/i) || h.has(/iron chainbody/i) ? 210 : 0) - (wearing(/bronze med helm/i) || h.has(/bronze med helm/i) ? 24 : 0);
            if (coins() >= need) return;
            await h.walk(MEN, 'men');
            for (let i = 0; i < 200 && coins() < need; i++) {
                const man = sdk.findNearbyNpc(/^(man|woman)$/i, { reachable: true });
                if (!man) { await sdk.waitForTicks(5); continue; }
                await bot.pickpocketNpc(man);
                if (sdk.getState()!.player.hp < 20) await sdk.waitForTicks(20);
            }
            console.log('coins:', coins());
        },

        async chainbody() { if (!h.has(/iron chainbody/i) && !wearing(/iron chainbody/i)) await buy(WAYNE, 'wayne', /^iron chainbody$/i); },

        async helm() { if (!h.has(/bronze med helm/i) && !wearing(/bronze med helm/i)) await buy(HELMETS, 'helmet shop', /^bronze med helm$/i); },

        async grill() {
            for (const re of [/^iron chainbody$/i, /^bronze med helm$/i]) if (h.has(re)) await bot.equipItem(re);
            console.log('disguise:', wearing(/iron chainbody/i) && wearing(/bronze med helm/i));
            await h.walk(FORTRESS_DOOR, 'fortress door', 1);
            await open(3016, 3514);
            await h.scan('inside fortress', 10);
        },

        // The room above the cauldron is reached from the north corridor on L1: ladder (3022, 3518)
        // up from the knights' meeting room, east along the corridor, then the secret wall at
        // (3030, 3510) is pushed from its north side. Opening the Sturdy door from inside sets the
        // knights on you, so this route avoids it. Eat between legs.
        async hole() {
            const eat = async () => { while (sdk.getState()!.player.hp < 40 && h.has(/cooked meat/i)) { await bot.eatFood(/cooked meat/i); await sdk.waitForTicks(2); } };
            for (const re of [/^iron chainbody$/i, /^bronze med helm$/i]) if (h.has(re)) await bot.equipItem(re);
            if (level() === 0) {
                await h.walk(FORTRESS_DOOR, 'fortress door', 1);
                if (sdk.getState()!.player.worldZ < 3514) await open(3016, 3514);
                // A guard warns you off the meeting room; insisting opens it and the knights inside aggro.
                await open(3020, 3515);
                await h.chat([/going in anyway/i]);
                await eat();
                await bot.walkTo(3022, 3517, 0);
                const lad = (await sdk.scanNearbyLocs(5)).find(l => l.x === 3022 && l.z === 3518 && l.optionsWithIndex.some(o => /climb-up/i.test(o.text)));
                if (lad) await bot.interactLoc(lad, /climb-up/i);
                await sdk.waitForCondition(() => level() === 1, 8_000).catch(() => {});
            }
            await eat();
            console.log('walk corridor:', (await bot.walkTo(3030, 3510, 0)).message, h.pos());
            await open(3030, 3510, /push/i);
            const hole = (await sdk.scanNearbyLocs(6)).find(l => /^hole$/i.test(l.name));
            if (!hole) { await h.scan('no hole'); return; }
            await bot.useItemOnLoc(/^cabbage$/i, hole);
            await sdk.waitForTicks(4);
            console.log('cabbage used:', !h.has(/^cabbage$/i), h.messages().slice(-3));
        },

        // Back the way the hole step came: wall, corridor, ladder, meeting room, guard door.
        async leave() {
            if (level() === 1) {
                await open(3030, 3510, /push/i);
                await bot.walkTo(3022, 3517, 0);
                const lad = (await sdk.scanNearbyLocs(5)).find(l => l.x === 3022 && l.z === 3518 && l.optionsWithIndex.some(o => /climb-down/i.test(o.text)));
                if (lad) await bot.interactLoc(lad, /climb-down/i);
                await sdk.waitForCondition(() => level() === 0, 8_000).catch(() => {});
            }
            await open(3020, 3515);
            await bot.walkTo(3016, 3515, 0);
            await open(3016, 3514);
            console.log('leave:', (await bot.walkTo(3016, 3505, 2)).message, h.pos());
        },

        async finish() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            await steps.amik();
            await sdk.waitForCondition(() => completes() > before, 10_000).catch(() => {});
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    const order = STEP === 'all' ? ['cabbage', 'amik', 'money', 'chainbody', 'helm', 'grill', 'hole', 'leave', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 45 * 60_000 });
