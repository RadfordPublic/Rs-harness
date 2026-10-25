import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Rune Mysteries: Duke (Lumbridge L1) -> Sedridor (Wizards' Tower basement)
// -> Aubury (Varrock) -> Sedridor. Run all, or STEP=duke|sedridor|aubury|finish|scan.
const STEP = process.env.STEP ?? 'all';

const CASTLE_STAIRS = { x: 3206, z: 3209 };   // Staircase loc at (3204, 3207)
const DUKE = { x: 3210, z: 3220 };            // L1
const SEDRIDOR = { x: 3103, z: 9571 };
const AUBURY = { x: 3253, z: 3401 };

const CHOICES = [
    /have you any quests/i, /sure, no problem/i, /looking for the head wizard/i,
    /ok, here you are/i, /yes, certainly/i, /package for you/i,
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const inBasement = () => sdk.getState()!.player.worldZ > 9000;

    async function toSedridor() {
        if (!inBasement()) {
            // Walking "near" the ladder lands outside the west wall. Go in the east door (3109, 3166),
            // then through the inner door (3107, 3162); the ladder is just inside.
            for (const [x, z, wx, wz] of [[3109, 3166, 3109, 3164], [3107, 3162, 3107, 3163]]) {
                const d = (await sdk.scanNearbyLocs(15)).find(l => l.name === 'Door' && l.x === x && l.z === z);
                if (!d) await h.walk({ x: 3110, z: 3168 }, 'tower door');
                const door = d ?? (await sdk.scanNearbyLocs(15)).find(l => l.name === 'Door' && l.x === x && l.z === z);
                if (door?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(door);
                await bot.walkTo(wx, wz, 1);
            }
            await h.climb('down', /ladder/i);
        }
        await h.walk(SEDRIDOR, 'sedridor');
    }
    async function leaveBasement() {
        if (inBasement()) await h.climb('up', /ladder/i);
        // The pathfinder won't route out of the ladder room, so open both doors on the way out.
        for (const [x, z, wx, wz] of [[3107, 3162, 3108, 3163], [3109, 3166, 3109, 3168]]) {
            const d = (await sdk.scanNearbyLocs(8)).find(l => l.name === 'Door' && l.x === x && l.z === z);
            if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(d);
            await bot.walkTo(wx, wz, 1);
        }
        console.log('left tower:', h.pos());
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here'); },

        async duke() {
            if (h.has(/air talisman/i)) { console.log('have talisman'); return; }
            if (sdk.getState()!.player.level === 0) {
                await h.walk(CASTLE_STAIRS, 'castle stairs');
                await h.climb('up', /^staircase$/i);
            }
            await h.walk(DUKE, 'duke');
            await h.talk(/duke/i, CHOICES);
            console.log('talisman:', h.has(/air talisman/i));
            await h.walk({ x: 3205, z: 3209 }, 'stairs L1');
            await h.climb('down', /^staircase$/i);
        },

        async sedridor() {
            await toSedridor();
            await h.talk(/sedridor|head wizard/i, CHOICES);
            console.log('package:', h.has(/research package/i));
            await leaveBasement();
        },

        async aubury() {
            await h.walk(AUBURY, 'aubury');
            await h.talk(/aubury/i, CHOICES);       // hands over the package
            await h.talk(/aubury/i, CHOICES);       // second chat gives the notes
            console.log('notes:', h.has(/research notes/i));
        },

        async finish() {
            await toSedridor();
            await h.talk(/sedridor|head wizard/i, CHOICES);
            await sdk.waitForTicks(3);
            await bot.closeInterface();
            console.log(h.messages().some(t => /quest complete|completed the/i.test(t)) ? 'QUEST COMPLETE' : 'not complete?');
            await leaveBasement();
        },
    };

    const order = STEP === 'all' ? ['duke', 'sedridor', 'aubury', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => i.name).join(', '), '| at', h.pos());
}, { timeout: 20 * 60_000 });
