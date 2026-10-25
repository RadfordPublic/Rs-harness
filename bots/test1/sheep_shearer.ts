import { runScript } from '../../sdk/runner';

// Sheep Shearer: 20 balls of wool for Fred. Runs in batches (shear until the
// inventory is full, spin, hand in) because the starter kit leaves ~11 slots.
// Run all steps, or one with STEP=<name>:  shears | start | shear | spin | give | scan
const STEP = process.env.STEP ?? 'all';

const STORE = { x: 3212, z: 3247 };      // Lumbridge general store
const FRED = { x: 3189, z: 3273 };
const PEN = { x: 3201, z: 3266 };        // sheep pen south-east of Fred's house
const CASTLE_STAIRS = { x: 3206, z: 3209 };   // Staircase loc at (3204, 3207)
const SHEEP_UNSHORN = 43;                // npc.pack: sheepunsheered (sheared = 42)

await runScript(async ({ bot, sdk }) => {
    const pos = () => { const p = sdk.getState()!.player; return `(${p.worldX}, ${p.worldZ}, L${p.level})`; };
    const count = (re: RegExp) => sdk.getInventory().filter(i => re.test(i.name)).reduce((n, i) => n + i.count, 0);
    const has = (re: RegExp) => count(re) > 0;
    const freeSlots = () => 28 - sdk.getInventory().length;
    const messages = () => sdk.getState()!.gameMessages.map(m => m.text);
    const done = () => messages().some(t => /completed the|quest complete/i.test(t));

    async function walk(t: { x: number; z: number }, label: string) {
        const r = await bot.walkTo(t.x, t.z, 3);
        console.log(`walk ${label}: ${r.success ? 'ok' : r.message} now ${pos()}`);
        return r.success;
    }

    // Click through a dialog, picking the first option matching any of `prefer`.
    async function chat(prefer: RegExp[] = []) {
        for (let i = 0; i < 60; i++) {
            const d = sdk.getState()?.dialog;
            if (!d?.isOpen) { await sdk.waitForTicks(1); if (!sdk.getState()?.dialog.isOpen) return; continue; }
            if (d.isWaiting) { await sdk.waitForTicks(1); continue; }
            const pick = d.options.length > 1 && prefer.length
                ? d.options.find(o => prefer.some(p => p.test(o.text)))
                : undefined;
            if (pick) console.log(`  * ${pick.text}`);
            await sdk.sendClickDialog(pick ? pick.index : d.options[0]?.index ?? 0);
            await sdk.waitForTicks(1);
        }
    }

    async function climb(dir: 'up' | 'down', name = /ladder|staircase/i) {
        const opt = dir === 'up' ? /climb-up/i : /climb-down/i;
        const locs = await sdk.scanNearbyLocs(15);
        const stairs = locs.filter(l => name.test(l.name) && l.optionsWithIndex.some(o => opt.test(o.text)))
            .sort((a, b) => a.distance - b.distance)[0];
        if (!stairs) { console.log(`nothing to climb ${dir}`); return false; }
        const before = sdk.getState()!.player.level;
        await bot.interactLoc(stairs, opt);
        await sdk.waitForCondition(s => s.player.level !== before, 10_000).catch(() => {});
        await sdk.waitForTicks(2);   // uses sent straight after a plane change can be dropped
        console.log(`climb ${dir}: ${pos()}`);
        return sdk.getState()!.player.level !== before;
    }

    async function scan(label: string) {
        const locs = await sdk.scanNearbyLocs(12);
        const names = [...new Set(locs.filter(l => l.optionsWithIndex.length).map(l => `${l.name}@${l.x},${l.z}`))];
        console.log(`${label} ${pos()} locs:`, names.slice(0, 30).join('  '));
        console.log('npcs:', sdk.getNearbyNpcs().map(n => `${n.name}#${n.id}`).slice(0, 20).join(', '));
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await scan('here'); },

        async shears() {
            if (has(/^shears$/i)) return;
            await walk(STORE, 'store');
            const o = await bot.openShop();
            console.log('open shop:', o.success, o.message);
            if (!has(/^coins$/i)) {
                const s = await bot.sellToShop(/^shortbow$/i, 1);
                console.log('sell shortbow:', s.success, s.message ?? '', 'coins', count(/^coins$/i));
            }
            const b = await bot.buyFromShop(/^shears$/i, 1);
            console.log('buy shears:', b.success, b.message ?? '');
            await bot.closeShop();
        },

        async start() {
            await walk(FRED, 'fred');
            const r = await bot.talkTo(/fred/i);
            console.log('talk fred:', r.success, r.message ?? '');
            await chat([/looking for a quest/i, /yes,? okay/i]);
        },

        async shear() {
            await walk(PEN, 'pen');
            let fails = 0;
            while (freeSlots() > 0 && count(/^wool$/i) + count(/ball of wool/i) < 20 && fails < 15) {
                const sheep = sdk.getNearbyNpcs()
                    .filter(n => n.id === SHEEP_UNSHORN)
                    .sort((a, b) => Math.hypot(a.x - sdk.getState()!.player.worldX, a.z - sdk.getState()!.player.worldZ)
                                  - Math.hypot(b.x - sdk.getState()!.player.worldX, b.z - sdk.getState()!.player.worldZ))[0];
                if (!sheep) { fails++; await sdk.waitForTicks(5); continue; }
                const before = count(/^wool$/i);
                await bot.useItemOnNpc(/^shears$/i, sheep);
                await sdk.waitForCondition(() => count(/^wool$/i) > before, 5_000).catch(() => {});
                await bot.dismissBlockingUI();
                if (count(/^wool$/i) > before) { fails = 0; console.log(`  wool ${count(/^wool$/i)}`); } else fails++;
            }
            console.log('shear done: wool', count(/^wool$/i), 'free', freeSlots());
        },

        async spin() {
            if (!has(/^wool$/i)) return;
            if (sdk.getState()!.player.level === 0) {
                await walk(CASTLE_STAIRS, 'castle stairs');
                await climb('up', /^staircase$/i);
            }
            // The wheel (3209, 3212) only works from its south tile; from elsewhere the client "can't reach" it.
            await bot.walkTo(3209, 3211, 0);
            const wheel = (await sdk.scanNearbyLocs(5)).find(l => /spinning wheel/i.test(l.name));
            if (!wheel) { await scan('no spinning wheel'); return; }
            let fails = 0;
            while (has(/^wool$/i) && fails < 5) {
                const before = count(/^wool$/i);
                await bot.useItemOnLoc(/^wool$/i, wheel);
                await sdk.waitForCondition(() => count(/^wool$/i) < before, 6_000).catch(() => {});
                await bot.dismissBlockingUI();
                if (count(/^wool$/i) < before) fails = 0; else fails++;
            }
            console.log('spun: balls', count(/ball of wool/i), 'wool left', count(/^wool$/i));
            await climb('down', /^staircase$/i);
        },

        async give() {
            if (!has(/ball of wool/i)) return;
            await walk(FRED, 'fred');
            // Fred takes one ball per tick, so wait for the count to settle and talk again if any remain.
            for (let talk = 0; talk < 4 && has(/ball of wool/i) && !done(); talk++) {
                await bot.talkTo(/fred/i);
                await chat([/i have some/i]);
                let last = -1;
                while (count(/ball of wool/i) !== last) { last = count(/ball of wool/i); await sdk.waitForTicks(3); }
                await chat();
            }
            const given = messages().filter(t => /you give fred a ball of wool/i.test(t)).length;
            console.log('balls left in inv', count(/ball of wool/i), '| give messages seen', given);
        },
    };

    const run = async (s: string) => { console.log(`=== ${s} ===`); await steps[s](); };
    if (STEP !== 'all') await run(STEP);
    else {
        await run('shears');
        await run('start');
        for (let batch = 0; batch < 3 && !done(); batch++) {
            await run('shear'); await run('spin'); await run('give');
        }
        console.log(done() ? 'QUEST COMPLETE' : 'not finished yet');
    }
    await bot.closeInterface();
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', pos());
}, { timeout: 20 * 60_000 });
