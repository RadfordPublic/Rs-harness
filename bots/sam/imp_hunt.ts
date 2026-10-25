import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Loops round the imp spawns between Rimmington and Lumbridge killing imps (and one rat)
// until we hold everything Witch's Potion and Imp Catcher still need: the four beads,
// burnt meat and a rat's tail. Imp drop table: 5/128 per bead colour, 4/128 burnt meat
// (server/content/scripts/drop tables/scripts/imp.rs2).
//   MAX_MINUTES=30 bun bots/sam/imp_hunt.ts
const MAX_MINUTES = Number(process.env.MAX_MINUTES ?? 45);

// Imp spawns from the map files, in walking order (bots/sam/find_spawn.ts npc ^imp$).
const STOPS = [
    { x: 2941, z: 3236 },                  // Rimmington
    { x: 3012, z: 3311 },                  // south of Falador
    { x: 3073, z: 3250 },                  // Draynor
    { x: 3215, z: 3225, rats: true },      // Lumbridge castle courtyard (rats too)
    { x: 3214, z: 3281 },                  // north of Lumbridge
    { x: 3240, z: 3307 },                  // cow field north
];
const WANT = [/^black bead$/i, /^red bead$/i, /^white bead$/i, /^yellow bead$/i, /^burnt meat$/i, /^rat's tail$/i];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const deadline = Date.now() + MAX_MINUTES * 60_000;
    const missing = () => WANT.filter(re => !h.has(re));
    const wanted = (name: string) => missing().some(re => re.test(name));
    const needRat = () => missing().some(re => re.source.includes('rat'));
    let kills = 0;

    async function lootNear() {
        for (const g of sdk.getState()!.groundItems.filter(g => wanted(g.name) && g.distance <= 10)) {
            const r = await bot.pickupItem(g);
            console.log(`  picked ${g.name}: ${r.success}`);
        }
    }

    async function fight(re: RegExp) {
        const npc = sdk.getNearbyNpcs().filter(n => re.test(n.name) && !n.inCombat && n.hp !== 0 && n.reachable !== false)
            .sort((a, b) => a.distance - b.distance)[0];
        if (!npc) return false;
        const r = await bot.attack(npc);
        if (!r.success) return false;
        await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === npc.index && n.hp !== 0), 20_000).catch(() => {});
        kills++;
        await sdk.waitForTicks(2);
        await lootNear();
        return true;
    }

    while (missing().length && Date.now() < deadline) {
        for (const stop of STOPS) {
            if (!missing().length || Date.now() > deadline) break;
            if (!stop.rats && !missing().some(re => !re.source.includes('rat'))) continue;
            await h.walk(stop, `stop ${stop.x},${stop.z}`, 4);
            // Hang around a little for imps to wander in.
            for (let i = 0; i < 6; i++) {
                await lootNear();
                const got = await fight(/^imp$/i) || (stop.rats && needRat() && await fight(/^rat$/i));
                if (!got) await sdk.waitForTicks(4);
            }
            console.log(`kills ${kills}, still need: ${missing().map(r => r.source.replace(/[\^$\\]/g, '')).join(', ') || 'nothing'}`);
        }
    }
    console.log(missing().length ? 'out of time' : 'GOT EVERYTHING', '| inv:', sdk.getInventory().map(i => i.name).join(', '));
}, { timeout: (MAX_MINUTES + 5) * 60_000 });
