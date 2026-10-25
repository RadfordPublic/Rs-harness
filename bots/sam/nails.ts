import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Steel nails for the Lady Lumbridge (Dragon Slayer needs 12: 4 per plank). Nobody sells them, and
// smithing them needs Smithing 34 (2 per steel bar), so this trains Mining/Smithing on the way.
// Falador loop: Dwarven Mine ores -> Falador furnace -> Doric's anvils (Doric's Quest unlocks them).
//   STEP=bank | mine ORE=copper N=13 | smelt | smith ITEM=dagger | doric | loop | nails
//   STEP=loop TARGET=34 bun bots/sam/nails.ts   # bronze until Smithing 30, then steel
const STEP = process.env.STEP ?? 'loop';
const TARGET = Number(process.env.TARGET ?? 34);

const BANK = { x: 3013, z: 3356 };            // Falador east
const MINE_TOP = { x: 3019, z: 3451 };       // Ice Mountain trapdoor (3019, 3450); the Falador-side stairs wouldn't take us down
const MINE_STAIRS = { x: 3019, z: 9849 };    // ladder up (3019, 9850)
const ROCKS: Record<string, { x: number; z: number }> = {
    copper: { x: 3039, z: 9782 }, tin: { x: 3053, z: 9781 }, iron: { x: 3037, z: 9775 }, coal: { x: 3046, z: 9764 }, clay: { x: 3053, z: 9817 },
};
const FURNACE = { x: 2974, z: 3369 };         // Falador (2975, 3368)
const DORIC = { x: 2951, z: 3450 };           // Doric's house: anvils (2950, 3451/3452)

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const smithing = () => sdk.getSkill('Smithing')?.baseLevel ?? 1;
    const mining = () => sdk.getSkill('Mining')?.baseLevel ?? 1;
    const underground = () => sdk.getState()!.player.worldZ > 9000;

    async function toMine() {
        if (underground()) return;
        await h.walk(MINE_TOP, 'dwarven mine stairs', 2);
        await h.climb('down', /trapdoor|ladder|stair/i);
    }
    async function leaveMine() {
        if (!underground()) return;
        await h.walk(MINE_STAIRS, 'mine stairs', 2);
        await h.climb('up', /ladder|stair/i);
    }

    const steps: Record<string, () => Promise<void>> = {
        // Everything but coins/pickaxe/hammer into the bank (quest items stay too).
        async bank() {
            await leaveMine();
            await h.walk(BANK, 'falador bank');
            await bot.openBank();
            const keep = /^(coins|bronze pickaxe|hammer|crandor map|dragonfire shield|law rune|air rune|mind rune|.* nails|nails|steel bar)$/i;
            for (const n of [...new Set(sdk.getInventory().filter(i => !keep.test(i.name)).map(i => i.name))]) {
                await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
            }
            if (!h.has(/^hammer$/i)) console.log('hammer:', (await bot.withdrawItem(/^hammer$/i, 1)).success);
            await bot.closeBank();
            console.log('free slots', h.freeSlots());
        },

        async mine() {
            const ore = process.env.ORE ?? 'copper', n = Number(process.env.N ?? 13);
            await mineOre(ore, n);
        },

        async smelt() {
            await leaveMine();
            await h.walk(FURNACE, 'furnace', 2);
            const furnace = sdk.findNearbyLoc(/furnace/i, { withOption: /smelt/i }) ?? sdk.findNearbyLoc(/furnace/i);
            if (!furnace) { await h.scan('no furnace'); return; }
            for (let i = 0; i < 30; i++) {
                const steel = h.has(/^iron ore$/i) && h.count(/^coal$/i) >= 2 && smithing() >= 30;
                const ore = steel ? sdk.findInventoryItem(/^iron ore$/i) : (h.has(/^tin ore$/i) ? sdk.findInventoryItem(/^copper ore$/i) : null);
                if (!ore) break;
                const before = h.count(/ bar$/i);
                await sdk.sendUseItemOnLoc(ore.slot, furnace.x, furnace.z, furnace.id);
                await sdk.waitForTicks(2);
                const d = sdk.getState()!.dialog;
                if (d.isOpen) await sdk.clickDialogByText(steel ? /steel/i : /bronze/i).catch(() => sdk.sendClickDialog(0));
                await sdk.waitForCondition(() => h.count(/ bar$/i) > before, 8_000).catch(() => {});
                await bot.dismissBlockingUI();
            }
            console.log('bars:', sdk.getInventory().filter(i => / bar$/i.test(i.name)).map(i => i.name).join(', '), '| smithing', smithing());
        },

        async smith() {
            const item = process.env.ITEM ?? 'dagger';
            await leaveMine();
            await h.walk(DORIC, 'doric anvils', 1);
            for (let i = 0; i < 60 && h.has(/bronze bar/i); i++) {
                const r = await bot.smithAtAnvil(item, { barPattern: /bronze bar/i, timeout: 10_000 });
                // Every other call reports the interface not opening (the last smith is still animating): just retry.
                if (!r.success) { await bot.closeInterface(); await sdk.waitForTicks(2); }
            }
            // The smithed items are worthless here; drop them to free the slots.
            for (const it of sdk.getInventory().filter(i => /^bronze /i.test(i.name) && !/bar|pickaxe/i.test(i.name))) { await sdk.sendDropItem(it.slot); await sdk.waitForTicks(1); }
            console.log('smithing', smithing());
        },

        // Doric's Quest: 6 clay, 4 copper ore, 2 iron ore. Unlocks his anvils (and 1 QP).
        async doric() {
            await h.walk(DORIC, 'doric');
            await h.talk(/^doric$/i, [/i wanted to use your anvils/i, /yes, i will get you materials/i, /^yes/i]);
        },

        async nails() {
            await leaveMine();
            await h.walk(DORIC, 'doric anvils', 1);
            for (let i = 0; i < 25 && h.has(/steel bar/i) && h.count(/nails/i) < 12; i++) {
                const r = await bot.smithAtAnvil('nails', { barPattern: /steel bar/i, timeout: 10_000 });
                if (!r.success) { await bot.closeInterface(); await sdk.waitForTicks(2); }
            }
            console.log('nails:', h.count(/nails/i));
        },

        // Bronze until Smithing 30 (one batch = half the free slots each of copper and tin), then steel bars and nails.
        async loop() {
            for (let round = 0; round < 8 && smithing() < 30; round++) {
                await mineOre('copper', Math.floor(h.freeSlots() / 2));
                await mineOre('tin', h.count(/^copper ore$/i));
                await steps.smelt();
                await steps.smith();
                console.log(`round ${round}: smithing ${smithing()}, mining ${mining()}`);
            }
            if (smithing() >= 30 && h.count(/nails/i) < 12) {
                if (h.count(/steel bar/i) < 6) {
                    await mineOre('iron', 7);
                    await mineOre('coal', 14);
                    await steps.smelt();
                }
                if (smithing() >= TARGET) await steps.nails();
                else console.log(`smithing ${smithing()} < ${TARGET}: smelt/smith more steel first`);
            }
        },
    };

    async function mineOre(ore: string, n: number) {
        const item = ore === 'clay' ? /^clay$/i : new RegExp(`^${ore}( ore)?$`, 'i');
        await toMine();
        await h.walk(ROCKS[ore], `${ore} rocks`, 3);
        // Pick the rock ourselves: mineRock's own choice kept landing on one it couldn't walk to.
        // Rotate past rocks that fail (depleted or unreachable) and come back to them later.
        let fails = 0;
        const skip = new Map<string, number>();
        while (h.count(item) < n && h.freeSlots() > 0 && fails < 20) {
            const rocks = (await sdk.scanNearbyLocs(14)).filter(l => new RegExp(`${ore}`, 'i').test(l.name) && l.reachable !== false
                && (skip.get(`${l.x},${l.z}`) ?? 0) < Date.now()).sort((a, b) => a.distance - b.distance);
            if (!rocks.length) { fails++; await sdk.waitForTicks(5); continue; }
            const r = await bot.mineRock(rocks[0], { timeout: 20_000 });
            if (!r.success) { fails++; skip.set(`${rocks[0].x},${rocks[0].z}`, Date.now() + 30_000); console.log(`  ${rocks[0].x},${rocks[0].z}: ${r.reason} ${r.message ?? ""}`); }
        }
        console.log(`${ore}: ${h.count(item)} | mining ${mining()}`);
    }

    await steps[STEP]();
}, { timeout: 90 * 60_000 });
