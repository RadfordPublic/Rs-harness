import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Vampire Slayer. Run all, or one step with STEP=<name>:
//   morgan | hammer | harlow | count | scan
// quest_vampire, morgan.rs2, harlow.rs2. Count Draynor (lvl 34) only stays dead if we hold
// a stake and a hammer when he drops; garlic just weakens him, so we skip it.
const STEP = process.env.STEP ?? 'all';

const MORGAN = { x: 3098, z: 3268 };           // Draynor Village
const STORE = { x: 3216, z: 3414 };            // Varrock general store (hammer)
const JOLLY_BOAR = { x: 3278, z: 3489 };       // inn: bartender sells beer, Dr Harlow drinks here
const MANOR_DOOR = { x: 3108, z: 3354 };       // front door, outside (one-way: it won't open from inside)
const MANOR_STAIRS = { x: 3116, z: 3357 };     // stairs down to the crypt
const COFFIN = { x: 3077, z: 9774 };

const CHOICES = [/up for an adventure/i, /morgan needs your help/i, /ok mate/i, /i'll have a beer please/i];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const inCrypt = () => sdk.getState()!.player.worldZ > 9000;

    // learnings/draynor-manor.md: leave through the east wing, the front door won't open from inside.
    async function leaveManor() {
        for (const [x, z, id, sx, sz, ex, ez] of [[3119, 3356, 1530, 3119, 3355, 3119, 3357], [3123, 3360, 136, 3123, 3359, 3123, 3361]]) {
            await sdk.sendWalk(sx, sz);
            await sdk.waitForTicks(3);
            const d = (await sdk.scanNearbyLocs(5)).find(l => l.x === x && l.z === z && /door/i.test(l.name));
            if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await sdk.sendInteractLoc(x, z, d.id, d.optionsWithIndex.find(o => /open/i.test(o.text))!.opIndex);
            else if (!d) console.log(`no door at ${x},${z} (id ${id})`);
            await sdk.waitForTicks(3);
            await sdk.sendWalk(ex, ez);
            await sdk.waitForTicks(3);
        }
        console.log('left manor:', h.pos());
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 12); },

        async morgan() { await h.walk(MORGAN, 'morgan'); await h.talk(/^morgan$/i, CHOICES); },

        async hammer() {
            if (h.has(/^hammer$/i)) return;
            await h.walk(STORE, 'varrock store');
            console.log('shop:', (await bot.openShop(/shop ?keeper|shop assistant/i)).message);
            console.log('buy hammer:', (await bot.buyFromShop(/^hammer$/i, 1)).success);
            await bot.closeShop();
        },

        async harlow() {
            if (h.has(/^stake$/i)) return;
            await h.walk(JOLLY_BOAR, 'jolly boar');
            if (!h.has(/^beer$/i)) await h.talk(/bartender/i, [/i'll have a beer please/i]);
            console.log('beer:', h.has(/^beer$/i));
            await h.talk(/harlow/i, CHOICES);
            if (!h.has(/^stake$/i)) await h.talk(/harlow/i, CHOICES);   // first chat may stop at the beer request
            console.log('stake:', h.has(/^stake$/i));
        },

        async count() {
            if (!h.has(/^stake$/i) || !h.has(/^hammer$/i)) { console.log('need stake + hammer first'); return; }
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            if (!inCrypt()) {
                await h.walk(MANOR_DOOR, 'manor door', 1);
                const front = (await sdk.scanNearbyLocs(4)).find(l => /door/i.test(l.name) && l.optionsWithIndex.some(o => /open/i.test(o.text)));
                if (front) await bot.openDoor(front);
                await h.walk(MANOR_STAIRS, 'crypt stairs', 1);
                await h.climb('down', /stair/i);
            }
            await h.walk(COFFIN, 'coffin', 1);
            const coffin = (await sdk.scanNearbyLocs(5)).find(l => /coffin/i.test(l.name));
            if (!coffin) { await h.scan('no coffin'); return; }
            await bot.interactLoc(coffin, /open/i);
            await sdk.waitForCondition(s => s.nearbyNpcs.some(n => /count draynor/i.test(n.name)), 10_000).catch(() => {});
            for (let i = 0; i < 10 && completes() === before; i++) {
                const count = sdk.findNearbyNpc(/count draynor/i);
                if (!count) break;
                await bot.attack(count);
                await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === count.index && n.hp !== 0) || h.messages().filter(t => /quest complete/i.test(t)).length > before, 30_000).catch(() => {});
            }
            await sdk.waitForCondition(() => completes() > before, 10_000).catch(() => {});
            await bot.closeInterface();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
            await h.climb('up', /stair/i);
            await leaveManor();
        },
    };

    const order = STEP === 'all' ? ['morgan', 'hammer', 'harlow', 'count'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 30 * 60_000 });
