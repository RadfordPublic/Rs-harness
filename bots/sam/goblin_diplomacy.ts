import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Goblin Diplomacy. Run all, or one step with STEP=<name>:
//   onions | woad | start | mail | berries | dyes | dye | finish | scan
// Dialog from quest_gobdip, aggie.rs2, wyson_the_gardener.rs2. Goblins drop goblin mail
// 5/128 (drop tables/goblin.rs2); we need 3 (orange, dark blue, plain brown).
const STEP = process.env.STEP ?? 'all';

const ONIONS = { x: 2946, z: 3249 };       // Rimmington field
const WYSON = { x: 3027, z: 3378 };        // Falador park
const GENERALS = { x: 2957, z: 3513 };     // Goblin Village
const BERRIES = { x: 3271, z: 3369 };      // ground spawns SE of Varrock (3267,3371 / 3271,3366 / 3278,3374)
const AGGIE = { x: 3086, z: 3258 };        // Draynor
const BARTENDER = { x: 3045, z: 3256 };    // Rusty Anchor, Port Sarim

const CHOICES = [
    /looking for woad leaves/i, /how about 20 coins/i,
    /can you make dyes/i, /okay, make me some (red|yellow|blue) dye/i,
    /do you want me to pick an armour colour/i, /i have some orange armour/i, /i have some (dark )?blue armour/i,
    /i have some brown armour/i, /^yes/i,
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const mails = () => h.count(/^goblin mail$/i) + h.count(/orange goblin mail/i) + h.count(/blue goblin mail/i);

    async function pickLoc(re: RegExp, want: RegExp, n: number) {
        for (let i = 0; i < n * 3 && h.count(want) < n; i++) {
            const loc = sdk.findNearbyLoc(re);
            if (!loc) { await h.scan(`no ${re}`); return; }
            const before = h.count(want);
            await bot.interactLoc(loc, /pick/i);
            await sdk.waitForCondition(() => h.count(want) > before, 6_000).catch(() => {});
        }
    }

    // Aggie picks the dye from a second menu, so ask once per colour.
    async function aggieDye(colour: 'red' | 'yellow' | 'blue') {
        const before = h.count(new RegExp(`^${colour} dye$`, 'i'));
        await h.talk(/^aggie$/i, [/can you make dyes/i, new RegExp(`what do you need to make ${colour} dye`, 'i'), new RegExp(`make me some ${colour} dye`, 'i')]);
        console.log(`${colour} dye:`, h.count(new RegExp(`^${colour} dye$`, 'i')) > before);
    }

    async function enterHut() {
        await h.walk(GENERALS, 'generals');
        // The generals' hut has a large double door on its south side (2957/2958, 3509).
        const door = (await sdk.scanNearbyLocs(8)).find(l => /large door/i.test(l.name) && l.optionsWithIndex.some(o => /^open$/i.test(o.text)));
        if (door) await bot.openDoor(door);
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 15); },

        async onions() {
            if (h.has(/yellow dye|orange dye/i)) return;
            await h.walk(ONIONS, 'onions');
            await pickLoc(/^onion$/i, /^onion$/i, 2);
            console.log('onions:', h.count(/^onion$/i));
        },

        async woad() {
            if (h.count(/woad leaf/i) >= 2 || h.has(/blue dye/i)) return;
            await h.walk(WYSON, 'wyson');
            await h.talk(/wyson/i, CHOICES);
            console.log('woad:', h.count(/woad leaf/i), 'coins', h.count(/^coins$/i));
        },

        // The quest starts with the Rusty Anchor bartender; finish asks the generals the colour question.
        async start() {
            await h.walk(BARTENDER, 'rusty anchor');
            await h.talk(/bartender/i, [/not very busy in here/i]);
        },

        async mail() {
            await h.walk(GENERALS, 'goblin village');
            let kills = 0;
            while (mails() < 3 && kills < 200) {
                const drop = sdk.getState()!.groundItems.find(g => /^goblin mail$/i.test(g.name) && g.distance <= 12);
                if (drop) { await bot.pickupItem(drop); console.log('  goblin mail', mails()); continue; }
                const gob = sdk.getNearbyNpcs().filter(n => /^goblin$/i.test(n.name) && !n.inCombat && n.hp !== 0 && n.reachable !== false)
                    .sort((a, b) => a.distance - b.distance)[0];
                if (!gob) { await sdk.waitForTicks(5); await h.walk(GENERALS, 'goblin village'); continue; }
                if (!(await bot.attack(gob)).success) { await sdk.waitForTicks(1); continue; }
                await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === gob.index && n.hp !== 0), 20_000).catch(() => {});
                await sdk.waitForTicks(2);
                if (++kills % 20 === 0) console.log(`  kills ${kills}, mail ${mails()}`);
            }
            console.log('goblin mail:', mails(), 'after', kills, 'kills');
        },

        async berries() {
            if (h.count(/^redberries$/i) >= 3 || h.has(/red dye|orange dye/i)) return;
            await h.walk(BERRIES, 'redberries', 2);
            for (let i = 0; i < 20 && h.count(/^redberries$/i) < 3; i++) {
                const b = sdk.findGroundItem(/^redberries$/i);
                if (!b) { await sdk.waitForTicks(10); continue; }   // ground spawns come back after a while
                await bot.pickupItem(b);
            }
            console.log('redberries:', h.count(/^redberries$/i));
        },

        async dyes() {
            await h.walk(AGGIE, 'aggie');
            if (!h.has(/red dye|orange dye/i)) await aggieDye('red');
            if (!h.has(/yellow dye|orange dye/i)) await aggieDye('yellow');
            if (!h.has(/blue dye/i) && !h.has(/blue goblin mail/i)) await aggieDye('blue');
        },

        async dye() {
            if (!h.has(/orange dye/i) && !h.has(/orange goblin mail/i)) {
                const red = sdk.findInventoryItem(/^red dye$/i), yellow = sdk.findInventoryItem(/^yellow dye$/i);
                if (red && yellow) await sdk.sendUseItemOnItem(red.slot, yellow.slot);
                await sdk.waitForCondition(() => h.has(/orange dye/i), 4_000).catch(() => {});
            }
            for (const [dye, out] of [[/^orange dye$/i, /orange goblin mail/i], [/^blue dye$/i, /blue goblin mail/i]] as const) {
                if (h.has(out)) continue;
                const d = sdk.findInventoryItem(dye), m = sdk.findInventoryItem(/^goblin mail$/i);
                if (!d || !m) { console.log('missing', dye, 'or plain mail'); continue; }
                await sdk.sendUseItemOnItem(d.slot, m.slot);
                await sdk.waitForCondition(() => h.has(out), 4_000).catch(() => {});
            }
            console.log('mail:', sdk.getInventory().filter(i => /goblin mail/i.test(i.name)).map(i => i.name).join(', '));
        },

        async finish() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            await enterHut();
            // First chat agrees on a new colour, then one armour per chat: orange, dark blue, brown.
            for (let i = 0; i < 6 && completes() === before; i++) await h.talk(/general (wartface|bentnoze)/i, CHOICES);
            await bot.closeInterface();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    const order = STEP === 'all' ? ['onions', 'woad', 'mail', 'start', 'berries', 'dyes', 'dye', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 60 * 60_000 });
