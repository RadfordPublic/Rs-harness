import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Makes food for talisman hunts without spending runes:
//   net:  Draynor bank (put the air runes back) -> Gerrant (Port Sarim) buys a small fishing net.
//   fish: nets shrimps/anchovies at Draynor (south of the dark wizards) until the inventory is full.
//   cook: the Lumbridge castle Cooking range (needs Cook's Assistant, done) cooks everything raw.
//   STEP=net|fish|cook|loop (default: net then fish+cook once; loop repeats fish+cook ROUNDS times).
const STEP = process.env.STEP ?? 'all';
const ROUNDS = Number(process.env.ROUNDS ?? 1);

const DRAYNOR_BANK = { x: 3092, z: 3245 };
const GERRANT = { x: 3014, z: 3224 };
const SPOTS = { x: 3087, z: 3227 };   // Draynor net/bait spots (see learnings/fishing.md)
const RANGE = { x: 3210, z: 3214 };   // Lumbridge castle kitchen; the Draynor fireplace is in a wall (can't reach)

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const NET = /^small fishing net$/i, RAW = /^raw (shrimps|anchovies)$/i;
    const fishing = () => sdk.getSkill('Fishing')?.baseLevel ?? 1;

    async function net() {
        if (h.has(/^air rune$/i)) {
            await h.walk(DRAYNOR_BANK, 'draynor bank');
            if ((await bot.openBank()).success) { await bot.depositItem(/^air rune$/i, -1); await bot.closeBank(); }
        }
        if (h.has(NET)) return;
        await h.walk(GERRANT, 'gerrant');
        if (!(await bot.openShop(/gerrant/i)).success) return console.log('openShop failed');
        const r = await bot.buyFromShop(NET, 1);
        console.log(`small fishing net: ${r.success}`);
        await bot.closeShop();
    }

    async function fish() {
        if (!h.has(NET)) return console.log('no small fishing net');
        await h.walk(SPOTS, 'draynor spots');
        let idle = 0;
        while (h.freeSlots() > 0 && idle < 20) {
            const p = sdk.getState()!.player;
            if (p.animId !== -1 && p.animId !== undefined) { idle = 0; await sdk.waitForTicks(3); continue; }
            const spot = sdk.getNearbyNpcs().filter(n => /fishing spot/i.test(n.name) && n.options.some(o => /^net$/i.test(o)))
                .sort((a, b) => a.distance - b.distance)[0];
            if (!spot) { idle++; await h.walk(SPOTS, 'draynor spots'); await sdk.waitForTicks(5); continue; }
            await bot.interactNpc(spot, /^net$/i);
            await sdk.waitForTicks(4);
            idle++;
        }
        console.log(`FISH DONE: ${h.count(RAW)} raw fish, Fishing ${fishing()}`);
    }

    async function cook() {
        await h.walk(RANGE, 'lumbridge range');
        const range = sdk.findNearbyLoc(/^(cooking range|range)$/i);
        if (!range) return h.scan('nothing to cook on', 10);
        for (let i = 0; i < 40 && h.has(RAW); i++) {
            const before = h.count(RAW);
            await bot.useItemOnLoc(RAW, range);
            await sdk.waitForTicks(2);
            if (sdk.getState()?.dialog.isOpen) await sdk.clickDialogByText(/cook all|all/i).catch(() => {});
            await sdk.waitForCondition(() => h.count(RAW) < before, 10_000).catch(() => {});
            await bot.dismissBlockingUI();
        }
        for (const item of sdk.getInventory().filter(i => /^burnt/i.test(i.name))) { await sdk.sendDropItem(item.slot); await sdk.waitForTicks(1); }
        console.log(`COOK DONE: ${h.count(/^(shrimps|anchovies)$/i)} cooked, ${h.count(/^burnt/i)} burnt, ${h.count(RAW)} raw left`);
    }

    if (STEP === 'all' || STEP === 'net') await net();
    if (STEP === 'all' || STEP === 'fish') await fish();
    if (STEP === 'all' || STEP === 'cook') await cook();
    if (STEP === 'loop') for (let r = 0; r < ROUNDS; r++) { await fish(); await cook(); }
}, { timeout: 60 * 60_000 });
