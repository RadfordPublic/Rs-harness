import { runScript } from '../../sdk/runner';
import { Spells } from '../../sdk/spells';
import { helpers } from './lib';

// Dragon Slayer. STEP=<name>:
//   phase A: guildmaster | oziach | shield
//   phase B (map parts 2 and 3): mindbomb | bank | clay | lobsterpot | wormbrain | bowl | silk | oracle | door
//   phase C (ship and Elvarg): prep | ship | repair | ned | sail | elvarg
//   scan
// Map part 1 is melzars_maze.ts.
// quest_dragon + guild_master.rs2, oziach.rs2, duke_horacio.rs2. Oziach hands over the Melzar's
// Maze key when asked about the first map piece; asking about all three pieces and the shield
// sets the flags the Duke and the Oracle check.
const STEP = process.env.STEP ?? 'all';

const GUILDMASTER = { x: 3190, z: 3361 };    // Champions' Guild (32 QP to enter)
const OZIACH = { x: 3068, z: 3516 };         // Edgeville hut
const CASTLE_STAIRS = { x: 3206, z: 3209 };  // Lumbridge castle staircase (3204, 3207)
const DUKE = { x: 3210, z: 3220 };           // L1
const BARMAID = { x: 2957, z: 3371 };        // Rising Sun, Falador: "I'll try the Mind Bomb."
const FALADOR_BANK = { x: 3013, z: 3356 };   // east bank (the bank is shared, so it holds the cow-farm loot)
const CLAY = { x: 2986, z: 3240 };           // Rimmington mine clay rocks (2986, 3239 / 2987, 3240)
const SINK = { x: 2966, z: 3208 };           // Hetty's house
const GERRANT = { x: 3013, z: 3224 };        // Port Sarim fishing shop (lobster pot)
const JAIL = { x: 3013, z: 3189 };           // outside Wormbrain's cell (3014, 3186)
const WHEEL = { x: 3086, z: 3409 };          // Barbarian Village potter's wheel (3087, 3409)
const THESSALIA = { x: 3205, z: 3417 };      // Varrock clothes shop (silk)
const ORACLE = { x: 3015, z: 3503 };         // Ice Mountain summit
const TRAPDOOR = { x: 3019, z: 3451 };       // Dwarven Mine (3019, 3450) -> ladder (3019, 9850)
const MAGIC_DOOR = { x: 3050, z: 9840 };     // (3051, 9840); the map chest is at (3057, 9841)
const EDGE_BANK = { x: 3094, z: 3492 };
const RANGE = { x: 3018, z: 3237 };          // Port Sarim range (3019, 3237)
const KLARENSE = { x: 3046, z: 3203 };       // Port Sarim docks, next to the Lady Lumbridge
const NED = { x: 3100, z: 3257 };            // Draynor
const TELEGRAB = 1168;                       // Telekinetic Grab spell component (between Lumbridge Teleport 1167 and Fire Bolt 1169)

const CHOICES = [
    /rune plate mail body/i, /can you sell me some rune plate mail/i, /guildmaster of the champions' guild told me/i,
    /so how am i meant to prove that/i, /a dragon sounds like fun/i,
    /where is the first piece/i, /where is the second piece/i, /where is the third piece/i,
    /where can i get an antidragon shield/i, /i'll try and get everything together/i,
    /seek a shield that will protect me from the dragon's breath/i,
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const level = () => sdk.getState()!.player.level;

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 12); },

        async guildmaster() { await h.walk(GUILDMASTER, 'champions guild'); await h.talk(/guild ?master/i, CHOICES); },

        async oziach() {
            await h.walk(OZIACH, 'oziach');
            await h.talk(/oziach/i, CHOICES);
            // chat() takes the first option that matches any pattern, and the shield question is listed
            // first, so ask about each map piece on its own. The first piece's answer is the maze key.
            for (const q of [/first piece/i, /second piece/i, /third piece/i]) {
                await h.talk(/oziach/i, [q, /i'll try and get everything together/i]);
            }
            console.log('maze key:', h.has(/maze key/i), sdk.getInventory().filter(i => /key/i.test(i.name)).map(i => i.name));
        },

        async shield() {
            if (h.has(/anti-dragon|antidragon|dragonfire shield/i)) return;   // it's called "Dragonfire shield" here
            await h.walk(CASTLE_STAIRS, 'castle stairs');
            if (level() === 0) await h.climb('up', /^staircase$/i);
            await h.walk(DUKE, 'duke');
            await h.talk(/duke/i, CHOICES);
            console.log('shield:', h.has(/dragonfire shield/i));
            await h.walk({ x: 3205, z: 3209 }, 'stairs L1');
            await h.climb('down', /^staircase$/i);
        },

        async mindbomb() {
            if (h.has(/mind bomb/i)) return;
            await h.walk(BARMAID, 'rising sun');
            await h.talk(/barmaid|emily|kaylee|tina/i, [/what ales are you serving/i, /try the mind bomb/i]);
            console.log('mind bomb:', h.has(/mind bomb/i));
        },

        // Pickaxe and bucket out, food and junk in.
        async bank() {
            await h.walk(FALADOR_BANK, 'falador bank');
            console.log('open bank:', (await bot.openBank()).success);
            for (const n of ['Bronze sword', 'Raw beef', 'Bones']) await bot.depositItem(new RegExp(`^${n}$`, 'i'), -1).catch(() => {});
            for (const n of ['Bronze pickaxe', 'Bucket']) if (!h.has(new RegExp(`^${n}$`, 'i'))) console.log(`${n}:`, (await bot.withdrawItem(new RegExp(`^${n}$`, 'i'), 1)).success);
            await bot.closeBank();
        },

        async clay() {
            if (h.has(/soft clay|unfired bowl/i)) return;
            if (!h.has(/^clay$/i)) {
                await h.walk(CLAY, 'clay rocks', 2);
                for (let i = 0; i < 10 && !h.has(/^clay$/i); i++) {
                    const rock = (await sdk.scanNearbyLocs(5)).find(l => /rocks?/i.test(l.name) && [2986, 2987].includes(l.x) && [3239, 3240].includes(l.z));
                    if (!rock) { await h.scan('no clay rock', 6); return; }
                    await bot.interactLoc(rock, /mine/i);
                    await sdk.waitForCondition(() => h.has(/^clay$/i), 8_000).catch(() => {});
                }
            }
            await h.walk(SINK, 'sink', 1);
            const sink = (await sdk.scanNearbyLocs(5)).find(l => /sink/i.test(l.name));
            if (sink && !h.has(/bucket of water/i)) await bot.useItemOnLoc(/^bucket$/i, sink);
            await sdk.waitForCondition(() => h.has(/bucket of water/i), 5_000).catch(() => {});
            const water = sdk.findInventoryItem(/bucket of water/i), clay = sdk.findInventoryItem(/^clay$/i);
            if (water && clay) await sdk.sendUseItemOnItem(water.slot, clay.slot);
            await sdk.waitForCondition(() => h.has(/soft clay/i), 5_000).catch(() => {});
            console.log('soft clay:', h.has(/soft clay/i));
        },

        async lobsterpot() {
            if (h.has(/lobster pot/i)) return;
            await h.walk(GERRANT, 'gerrant');
            await bot.openShop(/gerrant/i);
            console.log('lobster pot:', (await bot.buyFromShop(/^lobster pot$/i, 1)).success);
            await bot.closeShop();
        },

        // Kill him through the bars with Wind Strike, then Telekinetic Grab the map part off the cell floor.
        async wormbrain() {
            if (h.has(/map part/i) && sdk.getInventory().filter(i => /map part/i.test(i.name)).length >= 2) return;
            await h.walk(JAIL, 'jail', 1);
            for (let i = 0; i < 20; i++) {
                const worm = sdk.findNearbyNpc(/wormbrain/i);
                if (!worm || worm.hp === 0) break;
                await bot.castSpell(worm, Spells.WIND_STRIKE);
                await sdk.waitForTicks(3);
            }
            await sdk.waitForCondition(s => s.groundItems.some(g => /map part/i.test(g.name)), 8_000).catch(() => {});
            const part = sdk.findGroundItem(/map part/i);
            if (!part) { await h.scan('no map part on the floor', 6); return; }
            const before = sdk.getInventory().filter(i => /map part/i.test(i.name)).length;
            for (let i = 0; i < 3; i++) {
                const p = sdk.findGroundItem(/map part/i);
                if (!p) break;
                const r = await sdk.sendSpellOnGroundItem(p.x, p.z, p.id, TELEGRAB);
                await sdk.waitForCondition(() => sdk.getInventory().filter(it => /map part/i.test(it.name)).length > before, 8_000).catch(() => {});
                console.log('telegrab:', r.success, sdk.getInventory().filter(it => /map part/i.test(it.name)).length, h.messages().slice(-2));
                if (sdk.getInventory().filter(it => /map part/i.test(it.name)).length > before) break;
            }
        },

        async bowl() {
            if (h.has(/unfired bowl/i)) return;
            await h.walk(WHEEL, 'potters wheel', 1);
            const wheel = (await sdk.scanNearbyLocs(5)).find(l => /potter/i.test(l.name));
            if (!wheel) { await h.scan('no wheel'); return; }
            await bot.useItemOnLoc(/soft clay/i, wheel);
            await sdk.waitForTicks(3);
            const d = sdk.getState()!.dialog;
            if (d.isOpen) await sdk.clickDialogByText(/bowl/i).catch(() => {});
            await sdk.waitForCondition(() => h.has(/unfired bowl/i), 8_000).catch(() => {});
            console.log('unfired bowl:', h.has(/unfired bowl/i), d.options.map(o => o.text));
        },

        async silk() {
            if (h.has(/^silk$/i)) return;
            await h.walk(THESSALIA, 'thessalia');
            await bot.openShop(/thessalia/i);
            console.log('silk:', (await bot.buyFromShop(/^silk$/i, 1)).success);
            await bot.closeShop();
        },

        // Phase C: everything for the trip out of the bank, then food cooked on the Port Sarim range.
        async prep() {
            await h.walk(EDGE_BANK, 'edgeville bank');
            await bot.openBank();
            for (const n of ['Coins', 'Hammer', 'Nails', 'Crandor map', 'Dragonfire shield']) {
                if (!h.has(new RegExp(`^${n}$`, 'i'))) console.log(`${n}:`, (await bot.withdrawItem(new RegExp(`^${n}$`, 'i'), -1)).success);
            }
            const beef = Math.max(0, h.freeSlots() - 2);
            console.log('raw beef:', (await bot.withdrawItem(/^raw beef$/i, beef)).success, h.count(/^raw beef$/i));
            await bot.closeBank();
            await h.walk(RANGE, 'port sarim range', 1);
            const range = (await sdk.scanNearbyLocs(6)).find(l => /^range$/i.test(l.name));
            for (let i = 0; i < 40 && range && h.has(/^raw beef$/i); i++) {
                const n = h.count(/^raw beef$/i);
                await bot.useItemOnLoc(/^raw beef$/i, range);
                await sdk.waitForCondition(() => h.count(/^raw beef$/i) < n, 6_000).catch(() => {});
            }
            console.log('food:', h.count(/cooked meat/i), '| coins', h.count(/^coins$/i), 'nails', h.count(/nails/i), 'planks', h.count(/^plank$/i));
        },

        async ship() {
            await h.walk(KLARENSE, 'klarense');
            await h.talk(/klarense/i, [/i don't suppose i could buy it/i, /yep, sounds good/i]);
            console.log('coins after:', h.count(/^coins$/i));
        },

        // Board, go down to the hold, and patch the hole with planks (4 nails each, hammer).
        async repair() {
            if (sdk.getState()!.player.level === 0 && sdk.getState()!.player.worldZ < 9000) {
                await h.walk({ x: 3047, z: 3204 }, 'gangplank', 1);
                const plank = (await sdk.scanNearbyLocs(5)).find(l => /gangplank/i.test(l.name));
                if (plank) await bot.interactLoc(plank, new RegExp(plank.optionsWithIndex[0].text, 'i'));
                await sdk.waitForTicks(4);
            }
            if (sdk.getState()!.player.worldZ < 9000) await h.climb('down', /ladder/i);
            for (let i = 0; i < 6 && h.has(/^plank$/i); i++) {
                const hole = (await sdk.scanNearbyLocs(6)).find(l => /hole/i.test(l.name));
                if (!hole) { await h.scan('no hole'); break; }
                await bot.useItemOnLoc(/^plank$/i, hole);
                await sdk.waitForTicks(3);
                await h.chat();
            }
            console.log('planks left:', h.count(/^plank$/i), h.messages().slice(-2));
            await h.climb('up', /ladder/i);
        },

        async ned() {
            if (sdk.getState()!.player.level === 1) {   // still on deck: gangplank off at (3047, 3206)
                const off = (await sdk.scanNearbyLocs(6)).find(l => /gangplank/i.test(l.name));
                if (off) await bot.interactLoc(off, new RegExp(off.optionsWithIndex[0].text, 'i'));
                await sdk.waitForCondition(s => s.player.level === 0, 6_000).catch(() => {});
            }
            await h.walk(NED, 'ned');
            // His house door is often shut.
            const door = (await sdk.scanNearbyLocs(6)).filter(l => /door/i.test(l.name) && l.optionsWithIndex.some(o => /^open$/i.test(o.text)))
                .sort((a, b) => a.distance - b.distance)[0];
            if (door && sdk.findNearbyNpc(/^ned$/i)?.reachable === false) { await bot.openDoor(door); await sdk.waitForTicks(2); }
            await h.talk(/^ned$/i, [/could you take me to the island of crandor/i, /^yes/i, /you're a sailor/i]);
        },

        async sail() {
            await h.walk({ x: 3047, z: 3204 }, 'gangplank', 1);
            const plank = (await sdk.scanNearbyLocs(5)).find(l => /gangplank/i.test(l.name));
            if (plank && sdk.getState()!.player.level === 0) await bot.interactLoc(plank, new RegExp(plank.optionsWithIndex[0].text, 'i'));
            await sdk.waitForTicks(4);
            await h.talk(/^ned$/i, [/yep lets go/i]);
            await sdk.waitForCondition(s => s.player.worldX < 2900, 30_000).catch(() => {});
            await h.chat();
            console.log('arrived?', h.pos());
        },

        async elvarg() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            if (h.has(/dragonfire shield/i)) await bot.equipItem(/dragonfire shield/i);
            if (sdk.getState()!.player.worldZ < 9000) {
                await h.walk({ x: 2834, z: 3256 }, 'rock opening', 1);
                const rock = (await sdk.scanNearbyLocs(5)).find(l => l.x === 2833 && l.z === 3255);
                if (rock) await bot.interactLoc(rock, new RegExp(rock.optionsWithIndex[0].text, 'i'));
                await sdk.waitForCondition(s => s.player.worldZ > 9000, 10_000).catch(() => {});
            }
            await h.walk({ x: 2845, z: 9636 }, 'elvarg gate', 1);
            const gate = (await sdk.scanNearbyLocs(5)).find(l => /gate/i.test(l.name) && l.x === 2847);
            if (gate) { await bot.interactLoc(gate, /open/i); await sdk.waitForTicks(3); }
            // Elvarg's melee is the bigger threat once the shield takes the fire (max 10, elvarg.rs2).
            if (!sdk.isPrayerActive('protect_from_melee')) await sdk.sendTogglePrayer('protect_from_melee');
            for (let i = 0; i < 40 && completes() === before; i++) {
                if (sdk.getState()!.player.hp < 45 && h.has(/cooked meat/i)) { await bot.eatFood(/cooked meat/i); continue; }
                const e = sdk.findNearbyNpc(/elvarg/i);
                if (!e) { await sdk.waitForTicks(3); continue; }
                if (!sdk.getState()!.player.combat.inCombat) await bot.attack(e);
                await sdk.waitForTicks(3);
            }
            await sdk.waitForCondition(() => completes() > before, 15_000).catch(() => {});
            await h.chat();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?', 'hp', sdk.getState()!.player.hp, 'food', h.count(/cooked meat/i));
        },

        async oracle() { await h.walk(ORACLE, 'oracle'); await h.talk(/oracle/i, [/seek a piece of the map/i]); },

        async door() {
            if (sdk.getState()!.player.worldZ < 9000) {
                await h.walk(TRAPDOOR, 'dwarven mine', 1);
                await h.climb('down', /trapdoor|ladder/i);
            }
            await h.walk(MAGIC_DOOR, 'magic door', 1);
            const door = (await sdk.scanNearbyLocs(5)).find(l => /door/i.test(l.name) && l.x === 3051);
            if (door) await bot.interactLoc(door, new RegExp(door.optionsWithIndex[0].text, 'i'));
            await sdk.waitForTicks(4);
            await bot.walkTo(3056, 9841, 1);
            for (let i = 0; i < 3 && sdk.getInventory().filter(it => /map part/i.test(it.name)).length < 3; i++) {
                const chest = (await sdk.scanNearbyLocs(5)).find(l => /chest/i.test(l.name));
                if (!chest) break;
                const op = chest.optionsWithIndex.find(o => /search/i.test(o.text)) ?? chest.optionsWithIndex[0];
                await bot.interactLoc(chest, new RegExp(op.text, 'i'));
                await sdk.waitForTicks(3);
            }
            console.log('map parts:', sdk.getInventory().filter(it => /map part/i.test(it.name)).length);
        },
    };

    const order = STEP === 'all' ? ['guildmaster', 'oziach', 'shield'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 30 * 60_000 });
