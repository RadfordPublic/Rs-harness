import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Lobsters for Elvarg, all in Catherby: Harry's shop (net, lobster pot), net/bait spots to train,
// cage spots for lobsters, range and bank next door. XP is in tenths in fishing.struct and 25x here:
// shrimp 250, anchovies 1000 (Fishing 15), lobster 2250 (Fishing 40).
//   STEP=go | buy | train | lobsters N=26 | all | run (go + lobsters, for a trained fisher)
// go: Falador -> Taverley -> over White Wolf Mountain -> Catherby.
const STEP = process.env.STEP ?? 'all';
const N = Number(process.env.N ?? 26);          // cooked lobsters wanted in the bank

const HARRY = { x: 2834, z: 3444 };
const NET_SPOTS = { x: 2837, z: 3433 };         // Net/Bait (2836, 3431), (2838, 3431)
const CAGE_SPOTS = { x: 2848, z: 3428 };        // Cage/Harpoon (2844, 3429), (2853, 3423)
const RANGE = { x: 2817, z: 3443 };             // (2817, 3444)
const BANK = { x: 2809, z: 3441 };
const ROUTE = [{ x: 2936, z: 3450 }, { x: 2880, z: 3460 }, { x: 2860, z: 3490 }, { x: 2840, z: 3470 }, HARRY];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const fishing = () => sdk.getSkill('Fishing')?.baseLevel ?? 1;

    async function fishAt(where: { x: number; z: number }, op: RegExp, until: () => boolean) {
        await h.walk(where, 'fishing spots', 3);
        let idle = 0;
        // Catherby has a spot you can't stand next to; skip any spot that's unreachable or gave nothing for a minute.
        const skip = new Map<number, number>();
        while (!until() && idle < 20) {
            await bot.dismissBlockingUI();
            const spot = sdk.getNearbyNpcs().filter(n => /fishing spot/i.test(n.name) && n.reachable !== false
                && (skip.get(n.index) ?? 0) < Date.now() && n.optionsWithIndex.some(o => op.test(o.text)))
                .sort((a, b) => a.distance - b.distance)[0];
            if (!spot) { idle++; await sdk.waitForTicks(5); continue; }
            const before = sdk.getInventory().length + (sdk.getSkill('Fishing')?.experience ?? 0);
            const opt = spot.optionsWithIndex.find(o => op.test(o.text))!;
            // Clicking a spot from ~8 tiles away kept doing nothing; stand next to it first.
            if (spot.distance > 2) await bot.walkTo(spot.x, spot.z, 1);
            const seen = sdk.getState()!.gameMessages.at(-1);
            await sdk.sendInteractNpc(spot.index, opt.opIndex);
            // Each catch ends the fishing, so this loop re-clicks after every one. The animation flickers on and
            // off while waiting for a lobster, so "You attempt to catch" is the sign the spot works; then allow
            // up to 45s for the catch itself (lobsters at 40 are slow).
            const progress = (s: any) => s.inventory.length + (s.skills.find((k: any) => k.name === 'Fishing')?.experience ?? 0) !== before;
            const attempting = (s: any) => { const m = s.gameMessages; return m.slice(m.lastIndexOf(seen) + 1).some((x: any) => /you attempt to catch/i.test(x.text)); };
            const moved = await sdk.waitForCondition(s => progress(s) || attempting(s), 10_000).then(() => true, () => false);
            if (moved && !progress(sdk.getState()!)) await sdk.waitForCondition(progress, 45_000).catch(() => {});
            if (!moved) { skip.set(spot.index, Date.now() + 60_000); console.log(`  spot ${spot.x},${spot.z} op${opt.opIndex} gave nothing, skipping it; at ${h.pos()} | ${sdk.getState()!.gameMessages.slice(-2).map(m => m.text).join(" / ")}`); }
            idle = moved ? 0 : idle + 1;
        }
    }

    async function dropCatch(re: RegExp) {
        for (const it of sdk.getInventory().filter(i => re.test(i.name))) { await sdk.sendDropItem(it.slot); await sdk.waitForTicks(1); }
    }

    const steps: Record<string, () => Promise<void>> = {
        async go() {
            // The green dragon trips bank the lobster pot; grab it from whichever bank is nearest.
            if (!h.has(/lobster pot/i)) {
                const o = await bot.openBank();
                if (o.success) { await bot.withdrawItem(/^lobster pot$/i, 1).catch(() => {}); await bot.closeBank(); }
                console.log('lobster pot:', h.has(/lobster pot/i));
            }
            for (const p of ROUTE) if (!(await h.walk(p, `${p.x},${p.z}`, 3))) { await h.scan('stuck'); return; }
        },

        async buy() {
            await h.walk(HARRY, 'harry');
            await bot.openShop(/harry/i);
            if (!h.has(/small fishing net/i)) console.log('net:', (await bot.buyFromShop(/^small fishing net$/i, 1)).success);
            if (!h.has(/lobster pot/i)) console.log('pot:', (await bot.buyFromShop(/^lobster pot$/i, 1)).success);
            await bot.closeShop();
        },

        // Net until 40, dropping the catch each time the inventory fills.
        async train() {
            while (fishing() < 40) {
                await fishAt(NET_SPOTS, /^net$/i, () => fishing() >= 40 || h.freeSlots() === 0);
                await dropCatch(/^raw (shrimps|anchovies)$/i);
                console.log(`fishing ${fishing()}`);
                if (h.freeSlots() === 0) break;   // something else filled up the inventory
            }
        },

        async lobsters() {
            const banked = () => Number(process.env.BANKED ?? 0) + cookedSoFar;
            let cookedSoFar = 0;
            for (let trip = 0; trip < 6 && banked() < N; trip++) {
                await fishAt(CAGE_SPOTS, /^cage$/i, () => h.freeSlots() === 0);
                console.log(`trip ${trip}: ${h.count(/^raw lobster$/i)} raw | fishing ${fishing()}`);
                await h.walk(RANGE, 'range', 1);
                const range = (await sdk.scanNearbyLocs(5)).find(l => /^range$/i.test(l.name));
                for (let i = 0; i < 40 && range && h.has(/^raw lobster$/i); i++) {
                    const n = h.count(/^raw lobster$/i);
                    await bot.useItemOnLoc(/^raw lobster$/i, range);
                    await sdk.waitForTicks(2);
                    const d = sdk.getState()!.dialog;
                    if (d.isOpen && d.options.length > 1) await sdk.sendClickDialog((d.options.find(o => /all|x/i.test(o.text)) ?? d.options[0]).index);
                    await sdk.waitForCondition(() => h.count(/^raw lobster$/i) < n, 8_000).catch(() => {});
                }
                const cooked = h.count(/^lobster$/i);
                await dropCatch(/burnt lobster/i);
                await h.walk(BANK, 'catherby bank');
                await bot.openBank();
                await bot.depositItem(/^lobster$/i, -1);
                await bot.closeBank();
                cookedSoFar += cooked;
                console.log(`  banked ${cooked} lobsters (${banked()} total)`);
            }
        },
    };

    if (STEP === 'run') {          // already trained: just fetch the pot, go and fish
        await steps.go();
        if (!h.has(/lobster pot/i)) await steps.buy();
        await steps.lobsters();
    } else if (STEP === 'all') {
        await steps.go();
        await steps.buy();
        await steps.train();
        await steps.lobsters();
    } else await steps[STEP]();
}, { timeout: 120 * 60_000 });
