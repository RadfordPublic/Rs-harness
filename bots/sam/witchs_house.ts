import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Witch's House (Taverley). Run all, or one step with STEP=<name>:
//   cheese | key | magnet | mouse | shedkey | shed | ball | finish | scan
// quest_ball. Needs leather gloves (worn, for the basement gate) and cheese (for the mouse).
// Nora T. Hagg patrols the garden: within 3 tiles with line of sight she teleports you out and
// undoes the mouse door, so garden moves wait until she's well away.
const STEP = process.env.STEP ?? 'all';

const BOY = { x: 2928, z: 3455 };
const POT = { x: 2900, z: 3474 };            // key under the flower pot
const FRONT_DOOR = { x: 2901, z: 3473 };
const CELLAR = { x: 2907, z: 3476 };         // ladder down; cellar ladder up is (2907, 9876)
const MAGNET_CB = { x: 2898, z: 9873 };      // behind the shock gate (2902, 9873/9874)
const MOUSE_HOLE = { x: 2903, z: 3466 };
const BACK_DOOR = { x: 2901, z: 3465 };
const FOUNTAIN = { x: 2909, z: 3470 };
const SHED_DOOR = { x: 2934, z: 3463 };
const BALL = { x: 2935, z: 3460 };
const WYDIN = { x: 3014, z: 3205 };          // Port Sarim food store sells cheese

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const me = () => sdk.getState()!.player;
    const inCellar = () => me().worldZ > 9000;
    const witch = () => sdk.findNearbyNpc(/nora|witch/i);
    const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

    async function locAt(x: number, z: number, opt?: RegExp) {
        return (await sdk.scanNearbyLocs(10)).find(l => l.x === x && l.z === z && (!opt || l.optionsWithIndex.some(o => opt.test(o.text))));
    }

    // Wait until the witch is at least `gap` tiles from `spot` (and from us).
    async function waitForWitch(spot: { x: number; z: number }, gap = 7) {
        for (let i = 0; i < 60; i++) {
            const w = witch();
            if (!w || (dist(w, spot) >= gap && dist(w, { x: me().worldX, z: me().worldZ }) >= gap - 2)) return;
            await sdk.waitForTicks(1);
        }
        console.log('witch never moved away from', spot);
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 12); },

        async key() {
            if (h.has(/^door key$/i)) return;
            await h.walk(POT, 'flower pot', 1);
            const pot = await locAt(POT.x, POT.z);
            if (pot) await bot.interactLoc(pot, new RegExp(pot.optionsWithIndex[0].text, 'i'));
            await sdk.waitForTicks(3);
            await h.chat();
            console.log('door key:', h.has(/door key/i));
        },

        async magnet() {
            if (h.has(/^magnet$/i)) return;
            if (h.has(/leather gloves/i)) await bot.equipItem(/leather gloves/i);
            if (!inCellar()) {
                await h.walk(FRONT_DOOR, 'front door', 1);
                const door = await locAt(FRONT_DOOR.x, FRONT_DOOR.z);
                if (door) await bot.useItemOnLoc(/door key/i, door);
                await sdk.waitForTicks(3);
                await h.walk(CELLAR, 'cellar ladder', 1);
                await h.climb('down', /ladder/i);
            }
            const gate = (await sdk.scanNearbyLocs(8)).find(l => /^gate$/i.test(l.name) && l.x === 2902);
            if (gate) { await bot.interactLoc(gate, new RegExp(gate.optionsWithIndex[0].text, 'i')); await sdk.waitForTicks(3); }
            await h.walk(MAGNET_CB, 'cupboard', 1);
            for (let i = 0; i < 3 && !h.has(/^magnet$/i); i++) {
                const cb = (await sdk.scanNearbyLocs(4)).find(l => /cupboard/i.test(l.name));
                if (!cb) break;
                const op = cb.optionsWithIndex.find(o => /search/i.test(o.text)) ?? cb.optionsWithIndex.find(o => /open/i.test(o.text))!;
                await bot.interactLoc(cb, new RegExp(op.text, 'i'));
                await sdk.waitForTicks(3);
                await h.chat();
            }
            console.log('magnet:', h.has(/^magnet$/i));
            // back through the gate and up
            const g2 = (await sdk.scanNearbyLocs(8)).find(l => /^gate$/i.test(l.name) && l.x === 2902);
            if (g2) { await bot.interactLoc(g2, new RegExp(g2.optionsWithIndex[0].text, 'i')); await sdk.waitForTicks(3); }
            await h.walk({ x: 2907, z: 9875 }, 'cellar ladder', 1);
            await h.climb('up', /ladder/i);
        },

        async cheese() {
            if (h.count(/^cheese$/i) >= 2) return;
            await h.walk(WYDIN, 'wydin');
            await bot.openShop(/wydin/i);
            console.log('buy cheese:', (await bot.buyFromShop(/^cheese$/i, 3 - h.count(/^cheese$/i))).success, h.count(/^cheese$/i));
            await bot.closeShop();
        },

        // The mouse hole is a few tiles from the witch's patrol, and she can see in through the wall.
        // If she spots you she undoes the mouse door, so only act while she's far off.
        async mouse() {
            await h.walk({ x: 2902, z: 3467 }, 'mouse hole', 0);
            await waitForWitch(MOUSE_HOLE, 8);
            const hole = await locAt(MOUSE_HOLE.x, MOUSE_HOLE.z);
            if (hole) await bot.useItemOnLoc(/^cheese$/i, hole);
            await sdk.waitForCondition(s => s.nearbyNpcs.some(n => /mouse/i.test(n.name)), 6_000).catch(() => {});
            await h.chat();
            const mouse = sdk.findNearbyNpc(/mouse/i);
            if (!mouse) { await h.scan('no mouse'); return; }
            await bot.useItemOnNpc(/^magnet$/i, mouse);
            await sdk.waitForTicks(3);
            await h.chat();
            console.log('magnet used:', !h.has(/^magnet$/i));
            // Straight through the back door before she wanders back.
            await waitForWitch(BACK_DOOR, 6);
            const door = await locAt(BACK_DOOR.x, BACK_DOOR.z);
            if (door) await bot.interactLoc(door, /open/i);
            await sdk.waitForTicks(3);
            await h.chat();
            console.log('back door:', h.messages().slice(-2), h.pos());
        },

        async shedkey() {
            if (h.has(/^key$/i)) return;
            if (me().worldZ >= 3466) {   // still in the house
                await h.walk({ x: 2901, z: 3466 }, 'back door', 0);
                await waitForWitch(BACK_DOOR);
                const door = await locAt(BACK_DOOR.x, BACK_DOOR.z);
                if (door) await bot.interactLoc(door, /open/i);
                await sdk.waitForTicks(3);
            }
            await waitForWitch(FOUNTAIN);
            await h.walk(FOUNTAIN, 'fountain', 1);
            const f = await locAt(FOUNTAIN.x, FOUNTAIN.z);
            const op = f?.optionsWithIndex.find(o => /check|search/i.test(o.text));
            if (f && op) await bot.interactLoc(f, new RegExp(op.text, 'i'));
            await sdk.waitForTicks(3);
            await h.chat();
            console.log('shed key:', h.has(/^key$/i), h.pos());
        },

        async shed() {
            await waitForWitch(SHED_DOOR);
            await h.walk({ x: 2933, z: 3463 }, 'shed door', 0);
            const door = await locAt(SHED_DOOR.x, SHED_DOOR.z);
            if (door) await bot.useItemOnLoc(/^key$/i, door);
            await sdk.waitForTicks(3);
            await h.chat();
            console.log('in shed?', h.pos());
        },

        // The shapeshifter goes glob -> spider -> bear -> wolf; kill each form, then take the ball.
        async ball() {
            for (let i = 0; i < 12 && !h.has(/^ball$/i); i++) {
                if (me().hp < 40 && h.has(/cooked meat/i)) { await bot.eatFood(/cooked meat/i); continue; }
                const shifter = sdk.getNearbyNpcs().find(n => /shapeshifter/i.test(n.name) && n.hp !== 0);
                if (shifter) {
                    await bot.attack(shifter);
                    await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === shifter.index && n.hp !== 0) || s.player.hp < 30, 40_000).catch(() => {});
                    continue;
                }
                const ball = sdk.findGroundItem(/^ball$/i);
                if (ball) await bot.pickupItem(ball);
                await sdk.waitForTicks(2);
            }
            console.log('ball:', h.has(/^ball$/i));
        },

        // After the shapeshifter is dead the witch can still take the ball, but the shed now opens
        // without the key and the ball can be picked up again. Re-enter through the house.
        // Her patrol is the row z=3463 from x=2904 to x=2930 (witches_house.npc), and witch.rs2 only
        // catches you when you're north or south of her within 3 tiles: on her own row you're safe.
        // So: leave/enter the back door only while she's at the far end, travel along z=3463, and
        // wait inside the shed until she's at the west end before coming out.
        async reball() {
            const witchX = () => witch()?.x ?? -1;   // -1 = not in view
            const waitWitch = async (ok: (x: number) => boolean, what: string) => {
                for (let i = 0; i < 400 && !(witchX() > 0 && ok(witchX())); i++) { if (i % 25 === 0) console.log(`  witch x=${witchX()}`); await sdk.waitForTicks(1); }
                console.log(`witch at x=${witchX()} (${what})`);
            };
            const rowWalk = async (x: number) => { await bot.walkTo(x, 3463, 0); console.log('row ->', h.pos()); };
            if (!h.has(/^ball$/i)) {
                if (me().worldZ >= 3466 || me().worldX < 2900 || me().worldZ < 3459) {
                    await h.walk({ x: 2901, z: 3474 }, 'front door', 0);
                    const front = await locAt(FRONT_DOOR.x, FRONT_DOOR.z, /open/i);
                    if (front) { await bot.useItemOnLoc(/door key/i, front); await sdk.waitForTicks(3); }
                    await h.walk({ x: 2901, z: 3466 }, 'back door', 0);
                    await waitWitch(x => x >= 2915, 'far east before the back door');
                    const back = await locAt(BACK_DOOR.x, BACK_DOOR.z, /open/i);
                    if (back) { await bot.interactLoc(back, /open/i); await sdk.waitForTicks(3); }
                    await rowWalk(2903);
                }
                await rowWalk(2933);
                const shed = await locAt(SHED_DOOR.x, SHED_DOOR.z, /open/i);
                if (shed) { await bot.interactLoc(shed, /open/i); await sdk.waitForTicks(3); }
                const ball = sdk.findGroundItem(/^ball$/i);
                if (ball) await bot.pickupItem(ball);
                console.log('ball again:', h.has(/^ball$/i), h.pos());
            }
            if (!h.has(/^ball$/i)) return;
            await waitWitch(x => x <= 2912, 'far west before leaving the shed');
            const shed = await locAt(SHED_DOOR.x, SHED_DOOR.z, /open/i);
            if (shed) { await bot.interactLoc(shed, /open/i); await sdk.waitForTicks(2); }
            await rowWalk(2920);
            await waitWitch(x => x >= 2915, 'east again before the back door');
            await rowWalk(2903);
            const back = await locAt(BACK_DOOR.x, BACK_DOOR.z, /open/i);
            if (back) await bot.interactLoc(back, /open/i);
            await sdk.waitForTicks(3);
            await h.walk({ x: 2901, z: 3472 }, 'front door', 0);
            const front = await locAt(FRONT_DOOR.x, FRONT_DOOR.z, /open/i);
            if (front) { await bot.interactLoc(front, /open/i); await sdk.waitForTicks(3); }
            console.log('out with ball:', h.has(/^ball$/i), h.pos());
        },

        async finish() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            // Out of the shed, back through the house (the witch takes the ball if she sees you).
            if (me().worldX >= 2930 && me().worldZ >= 3459 && me().worldZ <= 3466) {
                await waitForWitch(SHED_DOOR, 12);   // she has to be well clear: the walk out passes her patrol
                const shed = await locAt(SHED_DOOR.x, SHED_DOOR.z, /open/i);
                if (shed) { await bot.interactLoc(shed, /open/i); await sdk.waitForTicks(3); }
            }
            if (me().worldZ < 3466 && me().worldX < 2932) {
                await waitForWitch(BACK_DOOR);
                await h.walk({ x: 2901, z: 3464 }, 'back door', 0);
                const back = await locAt(BACK_DOOR.x, BACK_DOOR.z, /open/i);
                if (back) { await bot.interactLoc(back, /open/i); await sdk.waitForTicks(3); }
                await h.walk({ x: 2901, z: 3472 }, 'front door', 0);
                const front = await locAt(FRONT_DOOR.x, FRONT_DOOR.z, /open/i);
                if (front) { await bot.interactLoc(front, /open/i); await sdk.waitForTicks(3); }
            }
            console.log('ball still held:', h.has(/^ball$/i), h.pos());
            await h.walk(BOY, 'boy');
            await h.talk(/^boy$/i, [/^yes|i've got it|here/i]);
            await sdk.waitForCondition(() => completes() > before, 10_000).catch(() => {});
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    const order = STEP === 'all' ? ['cheese', 'key', 'magnet', 'mouse', 'shedkey', 'shed', 'ball', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 30 * 60_000 });
