import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Druidic Ritual. Run all, or one step with STEP=<name>:
//   meats | kaqemeex | sanfew | cauldron | give | finish | scan
// quest_druid, kaqemeex.rs2, sanfew.rs2. Dip raw beef, rat, bear and chicken in the Cauldron of
// Thunder (Taverley Dungeon), give them to Sanfew, then report to Kaqemeex.
const STEP = process.env.STEP ?? 'all';

const MEATS: { item: RegExp; npc: RegExp; at: { x: number; z: number } }[] = [
    { item: /^raw beef$/i, npc: /^cow$/i, at: { x: 3253, z: 3285 } },
    { item: /^raw chicken$/i, npc: /^chicken$/i, at: { x: 3228, z: 3298 } },
    { item: /^raw rat meat$/i, npc: /^giant rat$/i, at: { x: 3195, z: 3204 } },
    { item: /^raw bear meat$/i, npc: /bear/i, at: { x: 3168, z: 3228 } },
];
const KAQEMEEX = { x: 2924, z: 3485 };       // stone circle north of Taverley
const SANFEW = { x: 2897, z: 3426 };         // house in Taverley, L1
const DUNGEON = { x: 2884, z: 3398 };        // ladder down at (2884, 3397)
const CAULDRON = { x: 2893, z: 9830 };

const CHOICES = [/in search of a quest/i, /ok, i will try and help/i, /ok, i'll do that then/i, /i have the ingredients/i, /i've got the ingredients/i];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const underground = () => sdk.getState()!.player.worldZ > 9000;

    async function kill(npcRe: RegExp, item: RegExp) {
        for (let i = 0; i < 10 && !h.has(item); i++) {
            const drop = sdk.getState()!.groundItems.find(g => item.test(g.name) && g.distance <= 10);
            if (drop) { await bot.pickupItem(drop); continue; }
            const npc = sdk.getNearbyNpcs().filter(n => npcRe.test(n.name) && !n.inCombat && n.hp !== 0 && n.reachable !== false)
                .sort((a, b) => a.distance - b.distance)[0];
            if (!npc) { await sdk.waitForTicks(5); continue; }
            if (!(await bot.attack(npc)).success) continue;
            await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === npc.index && n.hp !== 0), 30_000).catch(() => {});
            await sdk.waitForCondition(s => s.groundItems.some(g => item.test(g.name)), 4_000).catch(() => {});
        }
        return h.has(item);
    }

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 12); },

        async meats() {
            for (const m of MEATS) {
                if (h.has(m.item)) continue;
                await h.walk(m.at, `${m.npc.source} spot`, 4);
                console.log(`${m.item.source}:`, await kill(m.npc, m.item));
            }
        },

        async kaqemeex() { await h.walk(KAQEMEEX, 'kaqemeex'); await h.talk(/kaqemeex/i, CHOICES); },

        async sanfew() {
            await h.walk(SANFEW, 'sanfew house');
            if (sdk.getState()!.player.level === 0) await h.climb('up', /stair|ladder/i);
            await h.walk(SANFEW, 'sanfew', 2);
            await h.talk(/sanfew/i, CHOICES);
            if (sdk.getState()!.player.level > 0) await h.climb('down', /stair|ladder/i);
        },

        async cauldron() {
            if (!underground()) {
                await h.walk(DUNGEON, 'dungeon ladder', 1);
                await h.climb('down', /ladder/i);
            }
            const walked = await h.walk(CAULDRON, 'cauldron', 2);
            if (!walked) await h.scan('cauldron path', 12);
            const cauldron = (await sdk.scanNearbyLocs(8)).find(l => /cauldron/i.test(l.name));
            if (!cauldron) { await h.scan('no cauldron'); return; }
            for (const m of MEATS) {
                for (let i = 0; i < 3 && h.has(m.item); i++) {
                    await sdk.waitForTicks(1);
                    await bot.useItemOnLoc(m.item, cauldron);
                    await sdk.waitForCondition(() => !h.has(m.item), 4_000).catch(() => {});
                }
            }
            console.log('enchanted:', sdk.getInventory().filter(i => /enchanted/i.test(i.name)).map(i => i.name).join(', '));
            await h.walk({ x: 2884, z: 9797 }, 'dungeon ladder', 2);
            await h.climb('up', /ladder/i);
        },

        async give() { await steps.sanfew(); },

        async finish() {
            const completes = () => h.messages().filter(t => /quest complete/i.test(t)).length;
            const before = completes();
            await steps.kaqemeex();
            await sdk.waitForCondition(() => completes() > before, 10_000).catch(() => {});
            await bot.closeInterface();
            console.log(completes() > before ? 'QUEST COMPLETE' : 'not complete?');
        },
    };

    const order = STEP === 'all' ? ['meats', 'kaqemeex', 'sanfew', 'cauldron', 'give', 'finish'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 45 * 60_000 });
