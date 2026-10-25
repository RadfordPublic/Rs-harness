import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Melzar's Maze (Dragon Slayer map piece 1), Rimmington. STEP=<name>:
//   enter | floor | climb | scan
// melzars_maze.rs2: each colour's keeper drops its key when killed and the key disintegrates in its
// door. Order: giant rat (red, L0) -> ghost (orange, L1) -> skeleton (yellow, L2) -> cellar:
// zombie (blue) -> Melzar (magenta) -> lesser demon (green) -> chest with the map part.
//   STEP=floor NPC="giant rat" KEY=red bun bots/sam/melzars_maze.ts   # kill, take key, open door
//   STEP=climb X=2928 Z=3256 DIR=up bun bots/sam/melzars_maze.ts      # use one specific ladder
// Every key drops as plain "Key" and every keeper drops one each kill, so a wrong door only costs a kill.
// Route that worked (2026-10-26):
//   enter -> red key, DOOR=2926,3253 -> climb up 2928,3256 (L1) -> ghost orange key ->
//   (the first orange door 2931,3250 leads to a dead end; via ladder 2929,3245 and door 2928,3246 get
//   another ghost key for DOOR=2931,3253) -> climb up 2934,3254 (L2) -> skeleton yellow key,
//   DOOR=2924,3249 -> walk the west/south strip to 2939,3241 -> climb down 2940,3240 (L1) ->
//   climb down 2937,3240 (L0) -> climb down 2932,3240 ("funladdertop", drops into the cellar) ->
//   zombie blue DOOR=2931,9643 -> Melzar magenta DOOR=2929,9652 -> lesser demon green DOOR=2936,9655
//   -> chest (2935, 9657). Out: ladder 2939,9657, open 2938,3252, then the maze key on the front door.
const STEP = process.env.STEP ?? 'scan';
const DOOR = { x: 2941, z: 3248 };

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const eat = async () => { while (sdk.getState()!.player.hp < 45 && h.has(/cooked meat/i)) { await bot.eatFood(/cooked meat/i); await sdk.waitForTicks(2); } };

    const steps: Record<string, () => Promise<void>> = {
        async scan() {
            const locs = await sdk.scanNearbyLocs(10);
            console.log('at', h.pos());
            console.log(locs.filter(l => /door|ladder|chest|exit/i.test(l.name) && l.optionsWithIndex.length)
                .map(l => `${l.name}@${l.x},${l.z} r${l.reachable} [${l.optionsWithIndex.map(o => o.text)}]`).join('\n'));
            console.log('npcs:', sdk.getNearbyNpcs().map(n => `${n.name}@${n.x},${n.z}${n.reachable === false ? '(x)' : ''}`).join(', '));
            console.log('ground:', sdk.getState()!.groundItems.map(g => `${g.name}@${g.x},${g.z}`).join(', '));
        },

        async enter() {
            await h.walk({ x: DOOR.x + 1, z: DOOR.z }, 'maze door', 0);
            const door = (await sdk.scanNearbyLocs(4)).find(l => l.x === DOOR.x && l.z === DOOR.z);
            if (door) await bot.useItemOnLoc(/maze key/i, door);
            await sdk.waitForTicks(3);
            await steps.scan();
        },

        // Kill the floor's keeper until its key drops, pick it up, then use it on a reachable door of that colour.
        async floor() {
            const npcRe = new RegExp(`^${process.env.NPC ?? 'giant rat'}$`, 'i');
            const colour = process.env.KEY ?? 'red';
            const keyRe = /^key$/i;   // every colour drops as plain "Key"
            for (let i = 0; i < 8 && !h.has(keyRe); i++) {
                await eat();
                const key = sdk.findGroundItem(keyRe);
                if (key) { await bot.pickupItem(key); continue; }
                const npc = sdk.getNearbyNpcs().filter(n => npcRe.test(n.name) && n.hp !== 0 && n.reachable !== false).sort((a, b) => a.distance - b.distance)[0];
                if (!npc) { console.log('no reachable', npcRe.source); await steps.scan(); return; }
                await bot.attack(npc);
                await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === npc.index && n.hp !== 0) || s.player.hp < 35, 45_000).catch(() => {});
                await sdk.waitForCondition(s => s.groundItems.some(g => keyRe.test(g.name)), 4_000).catch(() => {});
            }
            console.log(`${colour} key:`, h.has(keyRe));
            // The coloured doors are all just named "Door", so try the reachable ones nearest first.
            // DOOR="x,z" picks a specific one (the wrong red door leads to a dead end).
            const want = process.env.DOOR?.split(',').map(Number);
            const doors = (await sdk.scanNearbyLocs(12)).filter(l => /door/i.test(l.name) && l.reachable !== false && (!want || (l.x === want[0] && l.z === want[1])));
            for (const d of doors.sort((a, b) => a.distance - b.distance)) {
                if (!h.has(keyRe)) break;
                await bot.useItemOnLoc(keyRe, d);
                await sdk.waitForTicks(3);
                if (!h.has(keyRe)) console.log(`${colour} door was ${d.x},${d.z}`);
            }
            await eat();
            await steps.scan();
        },

        // Depth-first search over ladders until NPC is reachable. Skips the trap ladder/exits (funladdertop,
        // funexit throw you out of the maze) and ladders already used. Broken ladders have no climb option.
        async explore() {
            const npcRe = new RegExp(`^${process.env.NPC ?? 'ghost'}$`, 'i');
            const traps = new Set(['2932,3240,0', '2938,3252,0']);
            const seen = new Set<string>();
            const key = (x: number, z: number) => `${x},${z},${sdk.getState()!.player.level}`;
            const found = () => sdk.getNearbyNpcs().some(n => npcRe.test(n.name) && n.reachable !== false);
            for (let hop = 0; hop < 20 && !found(); hop++) {
                const ladders = (await sdk.scanNearbyLocs(14)).filter(l => /ladder/i.test(l.name) && l.reachable !== false
                    && l.optionsWithIndex.some(o => /climb/i.test(o.text)) && !traps.has(key(l.x, l.z)) && !seen.has(key(l.x, l.z)))
                    .sort((a, b) => a.distance - b.distance);
                const lad = ladders[0];
                if (!lad) { console.log('dead end at', h.pos()); break; }
                const op = lad.optionsWithIndex.find(o => /climb/i.test(o.text))!;
                seen.add(key(lad.x, lad.z));
                const before = h.pos(), lvl = sdk.getState()!.player.level;
                await bot.interactLoc(lad, new RegExp(op.text, 'i'));
                await sdk.waitForCondition(s => s.player.level !== lvl, 6_000).catch(() => {});
                await sdk.waitForTicks(2);
                seen.add(key(lad.x, lad.z));   // the matching ladder on the new floor
                console.log(`${op.text} ${lad.x},${lad.z}: ${before} -> ${h.pos()}`);
            }
            console.log(found() ? `${npcRe.source} reachable` : 'not found');
            await steps.scan();
        },

        async climb() {
            const x = Number(process.env.X), z = Number(process.env.Z), dir = process.env.DIR ?? 'up';
            const op = process.env.OP ? new RegExp(process.env.OP, 'i') : new RegExp(`climb[- ]${dir}`, 'i');
            // A tile can hold a door and a ladder (2934, 3254 does): take the loc that has the option.
            const lad = (await sdk.scanNearbyLocs(12)).find(l => l.x === x && l.z === z && l.optionsWithIndex.some(o => op.test(o.text)));
            if (!lad) { console.log('no ladder there'); return; }
            await bot.interactLoc(lad, op);
            await sdk.waitForTicks(4);
            await steps.scan();
        },
    };

    await steps[STEP]();
}, { timeout: 10 * 60_000 });
