import { runScript } from '../../sdk/runner';

// Cook's Assistant. Run all steps, or one with STEP=<name>:
//   start | supplies | flour | egg | milk | finish | scan
// e.g. STEP=scan bun bots/test1/cooks_assistant.ts
const STEP = process.env.STEP ?? 'all';

const COOK = { x: 3208, z: 3214 };
const STORE = { x: 3212, z: 3247 };      // Lumbridge general store
const WHEAT = { x: 3161, z: 3295 };
const MILL = { x: 3166, z: 3306 };
const CHICKENS = { x: 3230, z: 3298 };
const COWS = { x: 3254, z: 3275 };

await runScript(async ({ bot, sdk }) => {
    const pos = () => { const p = sdk.getState()!.player; return `(${p.worldX}, ${p.worldZ}, L${p.level})`; };
    const has = (re: RegExp) => !!sdk.findInventoryItem(re);
    const inv = () => sdk.getInventory().map(i => i.name).join(', ');

    async function walk(t: { x: number; z: number }, label: string) {
        const r = await bot.walkTo(t.x, t.z, 3);
        console.log(`walk ${label}: ${r.success ? 'ok' : r.message} now ${pos()}`);
        return r.success;
    }

    // Click through a dialog, picking the first option matching any of `prefer`.
    async function chat(prefer: RegExp[] = []) {
        for (let i = 0; i < 40; i++) {
            const d = sdk.getState()?.dialog;
            if (!d?.isOpen) { await sdk.waitForTicks(1); if (!sdk.getState()?.dialog.isOpen) return; continue; }
            if (d.isWaiting) { await sdk.waitForTicks(1); continue; }
            if (d.text) console.log(`  > ${d.text.replace(/\s+/g, ' ').slice(0, 160)}`);
            const pick = d.options.length > 1 && prefer.length
                ? d.options.find(o => prefer.some(p => p.test(o.text)))
                : undefined;
            if (pick) console.log(`  * ${pick.text}`);
            await sdk.sendClickDialog(pick ? pick.index : d.options[0]?.index ?? 0);
            await sdk.waitForTicks(1);
        }
    }

    async function scan(label: string) {
        const locs = await sdk.scanNearbyLocs(15);
        const names = [...new Set(locs.map(l => `${l.name}@${l.x},${l.z}[${l.optionsWithIndex.map(o => o.text).join('/')}]`))];
        console.log(`${label} ${pos()} locs:`, names.slice(0, 40).join('  '));
        const s = sdk.getState()!;
        console.log('npcs:', s.nearbyNpcs?.map((n: any) => n.name).slice(0, 20).join(', '));
        console.log('ground:', s.groundItems?.map((g: any) => `${g.name}@${g.x},${g.z}`).slice(0, 20).join(', '));
    }

    async function climb(dir: 'up' | 'down') {
        const opt = dir === 'up' ? /climb-up/i : /climb-down/i;
        const locs = await sdk.scanNearbyLocs(10);
        const lad = locs.filter(l => /ladder|staircase/i.test(l.name) && l.optionsWithIndex.some(o => opt.test(o.text)))
            .sort((a, b) => a.distance - b.distance)[0];
        if (!lad) { console.log(`no ladder to climb ${dir}`); return false; }
        const before = sdk.getState()!.player.level;
        await bot.interactLoc(lad, opt);
        await sdk.waitForCondition(s => s.player.level !== before, 10_000).catch(() => {});
        // Uses sent straight after a plane change can succeed client-side but do nothing.
        await sdk.waitForTicks(2);
        console.log(`climb ${dir}: ${pos()}`);
        return sdk.getState()!.player.level !== before;
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await scan('here'); },

        async start() {
            await walk(COOK, 'cook');
            const r = await bot.talkTo(/^cook$/i);
            console.log('talk cook:', r.success, r.message ?? '');
            await chat([/what's wrong/i, /yes|i'll get|help/i]);
        },

        async supplies() {
            if (has(/^pot$/i) && has(/^bucket$/i)) { console.log('have pot + bucket'); return; }
            await walk(STORE, 'store');
            const o = await bot.openShop(/shop ?keeper|shop assistant/i);
            console.log('open shop:', o.success, o.message);
            if (!has(/^pot$/i)) console.log('buy pot:', (await bot.buyFromShop(/^pot$/i, 1)).success);
            if (!has(/^bucket$/i)) console.log('buy bucket:', (await bot.buyFromShop(/^bucket$/i, 1)).success);
            await bot.closeShop();
        },

        async flour() {
            if (has(/pot of flour/i)) return;
            if (!has(/^grain$/i)) {
                await walk(WHEAT, 'wheat');
                const wheat = sdk.findNearbyLoc(/^wheat$/i);
                if (!wheat) { await scan('no wheat'); return; }
                const r = await bot.interactLoc(wheat, /pick/i);
                console.log('pick wheat:', r.success, r.message);
                await sdk.waitForCondition(() => has(/^grain$/i), 10_000).catch(() => {});
                if (!has(/^grain$/i)) { console.log('no grain yet'); return; }
            }
            await walk(MILL, 'mill');
            await climb('up'); await climb('up');
            const top = await sdk.scanNearbyLocs(8);
            const hopper = top.find(l => /^hopper$/i.test(l.name));
            if (!hopper) { await scan('no hopper'); return; }
            for (let i = 0; i < 3 && has(/^grain$/i); i++) {
                await bot.useItemOnLoc(/^grain$/i, hopper);
                await sdk.waitForCondition(() => !has(/^grain$/i), 4_000).catch(() => {});
            }
            console.log('grain in hopper:', !has(/^grain$/i));
            const controls = top.find(l => /hopper controls/i.test(l.name));
            if (!controls) { await scan('no controls'); return; }
            console.log('operate:', (await bot.interactLoc(controls, /operate|pull/i)).success);
            await chat();
            await sdk.waitForTicks(3);
            await climb('down'); await climb('down');
            const bin = sdk.findNearbyLoc(/flour bin/i);
            if (!bin) { await scan('no flour bin'); return; }
            const r = await bot.useItemOnLoc(/^pot$/i, bin);
            if (!r.success) await bot.interactLoc(bin, /empty|take/i);
            await sdk.waitForCondition(() => has(/pot of flour/i), 5_000).catch(() => {});
            console.log('flour:', has(/pot of flour/i));
        },

        async egg() {
            if (has(/^egg$/i)) return;
            await walk(CHICKENS, 'chickens');
            const egg = sdk.findGroundItem(/^egg$/i);
            if (!egg) { await scan('no egg'); return; }
            console.log('pickup egg:', (await bot.pickupItem(egg)).success);
        },

        async milk() {
            if (has(/bucket of milk/i)) return;
            await walk(COWS, 'cows');
            // Any Cow takes a bucket here (npc/scripts/cow_milking.rs2); there's no "Dairy cow".
            const cow = sdk.findNearbyNpc(/^cow$/i);
            if (!cow) { await scan('no cow'); return; }
            const r = await bot.useItemOnNpc(/^bucket$/i, cow);
            console.log('bucket->cow:', r.success, r.message ?? '');
            await sdk.waitForCondition(() => has(/bucket of milk/i), 8_000).catch(() => {});
            console.log('milk:', has(/bucket of milk/i));
        },

        async finish() {
            await walk(COOK, 'cook');
            await bot.talkTo(/^cook$/i);
            await chat([/yes|i have/i]);
            await chat();
        },
    };

    const order = STEP === 'all' ? ['start', 'supplies', 'flour', 'egg', 'milk', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', inv(), '| at', pos());
}, { timeout: 10 * 60_000 });
