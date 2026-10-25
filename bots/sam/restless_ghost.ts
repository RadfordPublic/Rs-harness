import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// The Restless Ghost. Run all, or one step with STEP=<name>:
//   aereck | urhney | ghost | skull | coffin | scan
// Dialog choices come from server/content/scripts/quests/quest_priest and father_*.rs2.
const STEP = process.env.STEP ?? 'all';

const AERECK = { x: 3244, z: 3207 };       // Lumbridge church
const URHNEY = { x: 3235, z: 3153 };       // swamp hut south of the castle (map spawn)
const COFFIN = { x: 3249, z: 3192 };       // graveyard shed; the ghost spawns at (3249, 3194)
const SKULL = { x: 3120, z: 9566 };        // Wizards' Tower basement altar

const CHOICES = [
    /looking for a quest/i, /ok, let me help/i, /father aereck sent me/i, /got a ghost haunting/i,
    /now tell me what the problem is/i, /do you know why you're a ghost/i, /certain task/i,
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const inBasement = () => sdk.getState()!.player.worldZ > 9000;

    async function wearAmulet() {
        if (sdk.findInventoryItem(/ghostspeak/i)) console.log('wear amulet:', (await bot.equipItem(/ghostspeak/i)).success);
    }

    async function openCoffin() {
        await h.walk(COFFIN, 'coffin', 2);
        const locs = await sdk.scanNearbyLocs(8);
        const shut = locs.find(l => /coffin/i.test(l.name) && l.optionsWithIndex.some(o => /^open$/i.test(o.text)));
        if (shut) { await bot.interactLoc(shut, /^open$/i); await sdk.waitForTicks(3); }
        return (await sdk.scanNearbyLocs(8)).find(l => /coffin/i.test(l.name));
    }

    // Same tower route as test1's rune_mysteries.ts: east door, inner door, then the ladder down.
    async function toBasement() {
        if (inBasement()) return;
        await h.walk({ x: 3110, z: 3168 }, 'tower door');
        for (const [x, z, wx, wz] of [[3109, 3166, 3109, 3164], [3107, 3162, 3107, 3163]]) {
            const d = (await sdk.scanNearbyLocs(15)).find(l => l.name === 'Door' && l.x === x && l.z === z);
            if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(d);
            await bot.walkTo(wx, wz, 1);
        }
        await h.climb('down', /ladder/i);
    }
    async function leaveBasement() {
        if (inBasement()) { await h.walk({ x: 3104, z: 9575 }, 'ladder', 1); await h.climb('up', /ladder/i); }
        for (const [x, z, wx, wz] of [[3107, 3162, 3108, 3163], [3109, 3166, 3109, 3168]]) {
            const d = (await sdk.scanNearbyLocs(8)).find(l => l.name === 'Door' && l.x === x && l.z === z);
            if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(d);
            await bot.walkTo(wx, wz, 1);
        }
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 15); },

        async aereck() { await h.walk(AERECK, 'aereck'); await h.talk(/father aereck/i, CHOICES); },

        async urhney() {
            if (!sdk.findInventoryItem(/ghostspeak/i) && !sdk.getEquipment().some(e => /ghostspeak/i.test(e.name))) {
                await h.walk(URHNEY, 'urhney');
                if (!sdk.findNearbyNpc(/urhney/i)) await h.scan('no urhney', 15);
                await h.talk(/urhney/i, CHOICES);
            }
            console.log('amulet:', !!sdk.findInventoryItem(/ghostspeak/i));
        },

        async ghost() {
            await wearAmulet();
            await openCoffin();
            await sdk.waitForCondition(s => s.nearbyNpcs.some(n => /ghost/i.test(n.name)), 5_000).catch(() => {});
            await h.talk(/ghost/i, CHOICES);
        },

        async skull() {
            if (h.has(/skull/i)) return;
            await toBasement();
            await h.walk(SKULL, 'altar', 2);
            const skull = sdk.findGroundItem(/skull/i);
            if (!skull) { await h.scan('no skull', 10); return; }
            await bot.pickupItem(skull);
            await sdk.waitForCondition(() => h.has(/skull/i), 5_000).catch(() => {});
            console.log('skull:', h.has(/skull/i));
            // A skeleton (lvl 13) spawns and attacks; at our level just walk off and let it be.
            await leaveBasement();
        },

        async coffin() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            const coffin = await openCoffin();
            if (!coffin) { await h.scan('no coffin', 10); return; }
            // Opening the coffin plays an animation; a use sent during it is dropped, so retry.
            for (let i = 0; i < 4 && h.has(/skull/i); i++) {
                await sdk.waitForTicks(2);
                await bot.useItemOnLoc(/skull/i, coffin);
                await sdk.waitForCondition(() => !h.has(/skull/i), 4_000).catch(() => {});
            }
            await h.chat();
            await bot.closeInterface();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    if (inBasement() && STEP !== 'skull') await leaveBasement();
    const order = STEP === 'all' ? ['aereck', 'urhney', 'ghost', 'skull', 'coffin'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => i.name).join(', '), '| at', h.pos());
}, { timeout: 20 * 60_000 });
