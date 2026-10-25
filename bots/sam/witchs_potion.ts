import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Witch's Potion. Run all, or one step with STEP=<name>:
//   bank | newt | start | onion | rat | burn | finish | scan
// Hetty, quest_hetty, drop tables/rat.rs2 (tail only drops once the quest is started).
const STEP = process.env.STEP ?? 'all';

const BANK = { x: 3092, z: 3243 };         // Draynor
const BETTY = { x: 3013, z: 3258 };        // Port Sarim magic shop
const HETTY = { x: 2968, z: 3205 };        // Rimmington
const ONION = { x: 2946, z: 3249 };
const RATS = { x: 2930, z: 3247 };
const RANGE = { x: 2970, z: 3208 };        // in Hetty's house

const CHOICES = [/in search of a quest/i, /improve my magic/i, /yes i'd like to improve my magic/i, /yes i have everything/i];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 15); },

        async bank() {
            if (h.has(/^coins$/i) && h.count(/^raw beef$/i) >= 10) return;
            await h.walk(BANK, 'bank');
            console.log('open bank:', (await bot.openBank()).success);
            const keep = /^(coins|raw beef)$/i;
            for (const n of [...new Set(sdk.getInventory().filter(i => !keep.test(i.name)).map(i => i.name))]) {
                await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
            }
            if (!h.has(/^coins$/i)) console.log('coins:', (await bot.withdrawItem(/^coins$/i, -1)).success);
            const beef = 12 - h.count(/^raw beef$/i);
            if (beef > 0) console.log('beef:', (await bot.withdrawItem(/^raw beef$/i, beef)).success);
            await bot.closeBank();
            console.log('coins', h.count(/^coins$/i), 'beef', h.count(/^raw beef$/i));
        },

        async newt() {
            if (h.has(/eye of newt/i)) return;
            await h.walk(BETTY, 'betty');
            console.log('shop:', (await bot.openShop(/betty/i)).message);
            console.log('buy newt:', (await bot.buyFromShop(/eye of newt/i, 1)).success);
            await bot.closeShop();
        },

        async start() { await h.walk(HETTY, 'hetty'); await h.talk(/^hetty$/i, CHOICES); },

        async onion() {
            if (h.has(/^onion$/i)) return;
            await h.walk(ONION, 'onions');
            const onion = sdk.findNearbyLoc(/^onion$/i);
            if (!onion) { await h.scan('no onion'); return; }
            await bot.interactLoc(onion, /pick/i);
            await sdk.waitForCondition(() => h.has(/^onion$/i), 6_000).catch(() => {});
            console.log('onion:', h.has(/^onion$/i));
        },

        async rat() {
            for (let i = 0; i < 5 && !h.has(/rat's tail/i); i++) {
                const tail = sdk.findGroundItem(/rat's tail/i);
                if (tail) { await bot.pickupItem(tail); continue; }
                // Rats wander round Hetty's house; the spawn west of the onions is behind a locked door.
                let rat = sdk.findNearbyNpc(/^rat$/i, { reachable: true });
                if (!rat) { await h.walk(RATS, 'rats'); rat = sdk.findNearbyNpc(/^rat$/i, { reachable: true }); }
                if (!rat) { await h.scan('no rat'); return; }
                await bot.attack(rat);
                await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === rat.index && (n.hp ?? 1) > 0), 20_000).catch(() => {});
                await sdk.waitForCondition(s => s.groundItems.some(g => /rat's tail/i.test(g.name)), 4_000).catch(() => {});
            }
            console.log('tail:', h.has(/rat's tail/i));
        },

        async burn() {
            if (h.has(/burnt meat/i)) return;
            await h.walk(RANGE, 'range', 1);
            const range = sdk.findNearbyLoc(/^range$/i);
            if (!range) { await h.scan('no range'); return; }
            // Cooking 30 still burns beef now and then; cook until one burns.
            while (!h.has(/burnt meat/i) && h.has(/^raw beef$/i)) {
                const n = h.count(/^raw beef$/i);
                await bot.useItemOnLoc(/^raw beef$/i, range);
                // A "how many" dialog may open; take the single option, else it cooks one.
                await sdk.waitForTicks(2);
                if (sdk.getState()!.dialog.isOpen) await sdk.clickDialogByText(/^cook$|1|one/i).catch(() => sdk.sendClickDialog(0));
                await sdk.waitForCondition(() => h.count(/^raw beef$/i) < n, 6_000).catch(() => {});
            }
            console.log('burnt meat:', h.has(/burnt meat/i), 'cooked', h.count(/^cooked meat$/i));
        },

        async finish() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            await h.walk(HETTY, 'hetty');
            await h.talk(/^hetty$/i, CHOICES);
            // She makes the potion in her cauldron; drinking from it finishes the quest.
            const cauldron = (await sdk.scanNearbyLocs(8)).find(l => /cauldron/i.test(l.name));
            if (!cauldron) { await h.scan('no cauldron'); return; }
            const opt = cauldron.optionsWithIndex.find(o => /drink/i.test(o.text)) ?? cauldron.optionsWithIndex[0];
            await bot.interactLoc(cauldron, new RegExp(opt.text, 'i'));
            await sdk.waitForTicks(4);
            await h.chat();
            await bot.closeInterface();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    const order = STEP === 'all' ? ['bank', 'newt', 'start', 'onion', 'rat', 'burn', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 20 * 60_000 });
