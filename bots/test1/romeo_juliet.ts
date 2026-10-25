import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Romeo & Juliet. Run all, or one step with STEP=<name>:
//   juliet | romeo | lawrence | berries | apothecary | potion | finish | scan
const STEP = process.env.STEP ?? 'all';

const JULIET_HOUSE = { x: 3159, z: 3434 };    // ground floor, stairs up to Juliet
const JULIET = { x: 3158, z: 3425 };          // L1
const ROMEO = { x: 3211, z: 3424 };           // Varrock Square
const LAWRENCE = { x: 3254, z: 3480 };        // chapel, north-east Varrock
const APOTHECARY = { x: 3195, z: 3404 };
const CADAVA = { x: 3272, z: 3370 };          // cadava berry ground spawns, south-east Varrock

const CHOICES = [
    /i guess i could find him/i, /certainly, i will do so/i, /can i help find her/i,
    /yes, i will tell her/i, /he sent me to the apothecary/i, /always looking for a quest/i,
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);

    async function openDoorAt(x: number, z: number) {
        const d = (await sdk.scanNearbyLocs(10)).find(l => l.name === 'Door' && l.x === x && l.z === z);
        if (d?.optionsWithIndex.some(o => /open/i.test(o.text))) await bot.openDoor(d);
    }

    async function visitJuliet() {
        if (sdk.getState()!.player.level === 0) {
            // The SDK pathfinder can't reach the stairs (3156, 3435) directly. Walking at them lands
            // near (3162, 3439); from there open the door at (3160, 3440) and the stairs are reachable.
            await bot.walkTo(JULIET_HOUSE.x, JULIET_HOUSE.z, 0);
            await openDoorAt(3160, 3440);
            const stairs = (await sdk.scanNearbyLocs(10)).find(l => /staircase/i.test(l.name) && l.x === 3156 && l.z === 3435);
            if (stairs) {
                await bot.interactLoc(stairs, /climb-up/i);
                await sdk.waitForCondition(s => s.player.level === 1, 10_000).catch(() => {});
                await sdk.waitForTicks(2);
            }
            console.log('upstairs:', h.pos());
        }
        await h.walk(JULIET, 'juliet');
        await h.talk(/^juliet$/i, CHOICES);
        await h.climb('down', /staircase/i);
        // The SDK pathfinder can't route out of this house (it dead-ends in the kitchen at 3163,3429),
        // but with the north door open the client's own walk to the east side gets out.
        await openDoorAt(3160, 3440);
        for (let i = 0; i < 3 && sdk.getState()!.player.worldX < 3164; i++) {
            await sdk.sendWalk(3165, 3438);
            await sdk.waitForCondition(s => s.player.worldX >= 3164, 10_000).catch(() => {});
        }
        console.log('left house:', h.pos());
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 15); },

        async juliet() { await visitJuliet(); console.log('message:', h.has(/message/i)); },

        async romeo() { await h.walk(ROMEO, 'romeo'); await h.talk(/^romeo$/i, CHOICES); },

        async lawrence() { await h.walk(LAWRENCE, 'lawrence'); await h.talk(/father lawrence/i, CHOICES); },

        async berries() {
            if (h.has(/cadava berries/i)) return;
            await h.walk(CADAVA, 'cadava bushes');
            // In this revision the berries are ground spawns (map m51_52: 3266,3361 / 3273,3375 / 3277,3370), not bushes.
            const berries = sdk.findGroundItem(/cadava berries/i);
            if (!berries) { await h.scan('no cadava berries on the ground', 20); return; }
            await bot.pickupItem(berries);
            await sdk.waitForCondition(() => h.has(/cadava berries/i), 8_000).catch(() => {});
            console.log('berries:', h.has(/cadava berries/i));
        },

        async apothecary() {
            await h.walk(APOTHECARY, 'apothecary');
            await h.talk(/apothecary/i, CHOICES);
            await h.talk(/apothecary/i, CHOICES);   // first chat may only be the briefing
            console.log('potion:', h.has(/cadava potion/i));
        },

        async potion() { await visitJuliet(); },

        async finish() {
            await h.walk(ROMEO, 'romeo');
            // Chat history keeps earlier quests' "Quest complete!", so only count new ones.
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            await h.talk(/^romeo$/i, CHOICES);
            await sdk.waitForTicks(3);
            await bot.closeInterface();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    const order = STEP === 'all' ? ['juliet', 'romeo', 'lawrence', 'berries', 'apothecary', 'potion', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => i.name).join(', '), '| at', h.pos());
}, { timeout: 20 * 60_000 });
