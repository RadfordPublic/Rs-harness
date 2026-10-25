import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Demon Slayer. Run all, or one step with STEP=<name>:
//   gypsy | prysin | rovin | drain | traiborn | bones | silverlight | delrith | scan
// quest_demon + gypsy/sir_prysin/captain_rovin/traiborn.rs2. Three keys: Captain Rovin,
// the palace kitchen drain (pour a bucket of water, then fetch it from the sewer), and
// Traiborn (25 bones, handed over one at a time). The incantation is fixed in delrith.rs2.
const STEP = process.env.STEP ?? 'all';

const ARIS = { x: 3203, z: 3424 };           // Gypsy Aris, Varrock square
const STORE = { x: 3216, z: 3414 };          // Varrock general store (bucket)
const SINK = { x: 3224, z: 3493 };           // palace kitchen sink, next to the drain
const PRYSIN = { x: 3204, z: 3472 };         // palace, ground floor
const ROVIN = { x: 3204, z: 3496 };          // palace, L2
const SPIRAL = { x: 3203, z: 3496 };         // spiral stairs (3202, 3497), L0 -> L1 -> L2
const DRAIN = { x: 3225, z: 3494 };          // palace kitchen
const MANHOLE = { x: 3237, z: 3459 };
const SEWER_KEY = { x: 3225, z: 9897 };
const SEWER_LADDER = { x: 3237, z: 9859 };   // under the manhole
const TRAIBORN = { x: 3112, z: 3162 };       // Wizards' Tower, L1
const COWS = { x: 3253, z: 3285 };
const BANK = { x: 3092, z: 3243 };           // Draynor
const DELRITH = { x: 3229, z: 3370 };        // stone circle south of Varrock

const CHOICES = [
    /ok, here you go/i, /very interesting/i, /who's delrith/i, /i'll kill him for you/i, /i'll do my best/i,
    /gypsy aris said i should come/i, /i need to find silverlight/i, /unfortunately i've got to deal with him/i, /so give me the keys/i, /can you give me your key/i, /i'd better go key hunting/i,
    /demon who wants to invade/i, /but this is important/i,
    /key given to you by sir prysin/i, /have you got any keys knocking around/i, /i'll get the bones for you/i,
];
const INCANTATION = /carlem aber camerinthum purchai gabindo/i;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const level = () => sdk.getState()!.player.level;
    const inSewer = () => sdk.getState()!.player.worldZ > 9000;
    // All three Silverlight keys are just called "Key".
    const keyCount = () => sdk.getInventory().filter(i => /^key$/i.test(i.name)).length;

    // The pathfinder won't route out of the tower's stair room, so open both doors on the way out.
    async function leaveTower() {
        const p = sdk.getState()!.player;
        if (p.worldX < 3100 || p.worldX > 3118 || p.worldZ < 3150 || p.worldZ > 3166) return;
        for (const [x, z, wx, wz] of [[3107, 3162, 3108, 3163], [3109, 3166, 3109, 3168]]) {
            const d = (await sdk.scanNearbyLocs(8)).find(l => l.name === 'Door' && l.x === x && l.z === z);
            if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(d);
            await bot.walkTo(wx, wz, 1);
        }
    }

    async function climbTo(target: number) {
        for (let i = 0; i < 4 && level() !== target; i++) await h.climb(level() < target ? 'up' : 'down', /stair/i);
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 12); },

        async gypsy() { await climbTo(0); await h.walk(ARIS, 'gypsy'); await h.talk(/^gypsy|aris/i, CHOICES); },

        async prysin() { await climbTo(0); await h.walk(PRYSIN, 'prysin'); await h.talk(/prysin/i, CHOICES); },

        // Rovin's floor is only reached by the spiral stairs in the palace's north-west corner.
        async rovin() {
            await climbTo(0);
            await h.walk(SPIRAL, 'spiral stairs', 1);
            await climbTo(2);
            await h.walk(ROVIN, 'rovin');
            await h.talk(/rovin/i, CHOICES);
            console.log('keys:', keyCount());
            await climbTo(0);
        },

        async drain() {
            if (inSewer()) { await h.walk(SEWER_LADDER, 'sewer ladder', 1); await h.climb('up', /ladder/i); }
            if (!h.has(/bucket/i)) {
                await h.walk(STORE, 'varrock store');
                await bot.openShop(/shop ?keeper|shop assistant/i);
                console.log('buy bucket:', (await bot.buyFromShop(/^bucket$/i, 1)).success);
                await bot.closeShop();
            }
            if (!h.has(/bucket of water/i)) {
                await h.walk(SINK, 'sink', 1);
                const f = (await sdk.scanNearbyLocs(6)).find(l => /sink|fountain/i.test(l.name));
                if (!f) { await h.scan('no sink'); return; }
                for (let i = 0; i < 3 && !h.has(/bucket of water/i); i++) {
                    const r = await bot.useItemOnLoc(/^bucket$/i, f);
                    await sdk.waitForCondition(() => h.has(/bucket of water/i), 6_000).catch(() => {});
                    console.log(`fill bucket at ${f.x},${f.z}: ${r.success} ${r.message ?? ''} -> ${h.has(/bucket of water/i)}`);
                }
                if (!h.has(/bucket of water/i)) return;
            }
            await h.walk(DRAIN, 'drain', 1);
            const drain = (await sdk.scanNearbyLocs(6)).find(l => /drain/i.test(l.name));
            if (!drain) { await h.scan('no drain'); return; }
            const before = keyCount();
            await bot.useItemOnLoc(/bucket of water/i, drain);
            await sdk.waitForCondition(() => h.messages().slice(-4).some(t => /washed the key down/i.test(t)), 6_000).catch(() => {});
            // Key 3 lands in the sewer below and despawns in a couple of minutes, so go straight there.
            await h.walk(MANHOLE, 'manhole', 1);
            for (let i = 0; i < 4 && !inSewer(); i++) {
                const hole = (await sdk.scanNearbyLocs(5)).find(l => /^manhole$/i.test(l.name));
                if (!hole) break;
                const op = hole.optionsWithIndex.find(o => /open|climb/i.test(o.text))!;
                await bot.interactLoc(hole, new RegExp(op.text, 'i'));
                await sdk.waitForCondition(() => inSewer(), 8_000).catch(() => {});
            }
            await h.walk(SEWER_KEY, 'sewer key', 1);
            const key = sdk.findGroundItem(/^key$/i);
            if (key) await bot.pickupItem(key);
            await sdk.waitForCondition(() => keyCount() > before, 5_000).catch(() => {});
            console.log('drain key:', keyCount() > before, 'keys', keyCount());
            await h.walk(SEWER_LADDER, 'sewer ladder', 1);
            await h.climb('up', /ladder/i);
        },

        // Clear the inventory at Draynor so the bone runs need fewer trips.
        async bank() {
            await climbTo(0);
            await h.walk(BANK, 'draynor bank');
            console.log('open bank:', (await bot.openBank()).success);
            const keep = /^(coins|key|silverlight|.*goblin mail)$/i;
            for (const n of [...new Set(sdk.getInventory().filter(i => !keep.test(i.name)).map(i => i.name))]) {
                await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
            }
            await bot.closeBank();
            console.log('free slots:', h.freeSlots());
        },

        async traiborn() {
            if (level() === 0) {
                // Same way in as test1's rune_mysteries.ts: east door, then the inner door; the
                // spiral stairs (3103, 3159) are just past it. Walking "near" them lands outside the wall.
                await h.walk({ x: 3110, z: 3168 }, 'tower door');
                for (const [x, z, wx, wz] of [[3109, 3166, 3109, 3164], [3107, 3162, 3106, 3161]]) {
                    const d = (await sdk.scanNearbyLocs(15)).find(l => l.name === 'Door' && l.x === x && l.z === z);
                    if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(d);
                    await bot.walkTo(wx, wz, 1);
                }
            }
            await climbTo(1);
            await h.walk(TRAIBORN, 'traiborn', 2);
            await h.talk(/traiborn/i, CHOICES);
        },

        // Traiborn counts bones one at a time, so fetch whatever fits, hand it in, repeat.
        async bones() {
            const given = () => h.messages().filter(t => /you give traiborn a set of bones/i.test(t)).length;
            for (let trip = 0; trip < 4 && keyCount() < 3; trip++) {
                const need = 25 - given();
                await climbTo(0);
                await leaveTower();
                if (!(await h.walk(COWS, 'cows'))) { console.log('cannot reach the cows'); return; }
                while (h.freeSlots() > 0 && h.count(/^bones$/i) < need) {
                    const bone = sdk.getState()!.groundItems.find(g => /^bones$/i.test(g.name) && g.distance <= 8);
                    if (bone) { await bot.pickupItem(bone); continue; }
                    const cow = sdk.getNearbyNpcs().filter(n => /^cow$/i.test(n.name) && !n.inCombat && n.hp !== 0).sort((a, b) => a.distance - b.distance)[0];
                    if (!cow) { await sdk.waitForTicks(3); continue; }
                    if (!(await bot.attack(cow)).success) continue;
                    await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === cow.index && n.hp !== 0), 20_000).catch(() => {});
                    await sdk.waitForTicks(2);
                }
                console.log('bones:', h.count(/^bones$/i), 'given so far', given());
                await steps.traiborn();
                await sdk.waitForCondition(() => !h.has(/^bones$/i) || keyCount() >= 3, 40_000).catch(() => {});
                await h.chat(CHOICES);
                console.log('given', given(), 'keys', keyCount());
            }
            console.log('keys:', keyCount());
        },

        async silverlight() { await steps.prysin(); console.log('silverlight:', h.has(/silverlight/i)); },

        async delrith() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            if (h.has(/^silverlight$/i)) console.log('wield:', (await bot.equipItem(/^silverlight$/i)).success);
            await h.walk(DELRITH, 'delrith');
            for (let i = 0; i < 10 && completes() === before; i++) {
                const d = sdk.getState()!.dialog;
                if (d.isOpen) {
                    const pick = d.options.find(o => INCANTATION.test(o.text));
                    if (pick) { console.log('  * incantation'); await sdk.sendClickDialog(pick.index); }
                    else await h.chat([INCANTATION]);
                    await sdk.waitForTicks(2);
                    continue;
                }
                const delrith = sdk.findNearbyNpc(/delrith/i);
                if (!delrith) { await sdk.waitForTicks(5); continue; }
                await bot.attack(delrith);
                await sdk.waitForCondition(s => s.dialog.isOpen || !s.nearbyNpcs.some(n => n.index === delrith.index), 40_000).catch(() => {});
            }
            await h.chat();
            await bot.closeInterface();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    const order = STEP === 'all' ? ['gypsy', 'prysin', 'rovin', 'drain', 'traiborn', 'bones', 'silverlight', 'delrith'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 45 * 60_000 });
