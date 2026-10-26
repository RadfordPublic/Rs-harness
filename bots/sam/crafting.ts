import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Crafting 34 -> 63 (dragonhide bodies) on the ~490 banked cowhides, all in Al Kharid:
// bank -> tanner (hard leather, 3gp/hide) -> needle on hard leather = hard leather body (35xp, x25)
// -> sell the bodies at the general store to pay for the next batch. Thread lasts 5 crafts.
//   STEP=loop TARGET=63 bun bots/sam/crafting.ts   | STEP=batch (one inventory) | STEP=supplies
const STEP = process.env.STEP ?? 'loop';
const TARGET = Number(process.env.TARGET ?? 63);

const GATE = { x: 3266, z: 3228 };            // Lumbridge side of the toll gate (3268, 3227/3228)
const BANK = { x: 3269, z: 3167 };
const DRAYNOR_BANK = { x: 3092, z: 3245 };    // coins for the 10gp toll on the way in
const TANNER = { x: 3275, z: 3192 };          // Ellis
const DOMMIK = { x: 3321, z: 3194 };          // crafting shop: needle, thread
const STORE = { x: 3315, z: 3183 };           // general store
const TAN_HARD_ALL = 8690;                    // tanner:com_98, "tan all" hard leather
const KEEP = /^(coins|needle|thread)$/i;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const crafting = () => sdk.getSkill('Crafting')?.baseLevel ?? 1;
    const coins = () => h.count(/^coins$/i);
    let hidesLeft = Infinity;

    async function toKharid() {
        if (sdk.getState()!.player.worldX >= 3268) return;
        if (coins() < 300) {
            for (let i = 0; i < 6 && !(await h.walk(DRAYNOR_BANK, 'draynor bank')); i++);
            await bank(false, DRAYNOR_BANK);
        }
        // Long walk from wherever sam is; walkTo times out after 2 minutes, so keep going.
        for (let i = 0; i < 6 && !(await h.walk(GATE, 'toll gate', 1)); i++);
        const gate = (await sdk.scanNearbyLocs(5)).find(l => /gate/i.test(l.name) && l.x === 3268);
        if (!gate) { await h.scan('no toll gate'); throw new Error('toll gate not found'); }
        await bot.interactLoc(gate, 1);
        await sdk.waitForCondition(s => s.dialog.isOpen, 5_000).catch(() => {});
        await h.chat([/^yes, ok/i]);
        await sdk.waitForCondition(s => s.player.worldX >= 3268, 10_000).catch(() => {});
        console.log('through the gate:', h.pos(), '| coins', coins());
        if (sdk.getState()!.player.worldX < 3268) throw new Error('still outside Al Kharid');
    }

    async function bank(withdrawHides: boolean, at = BANK) {
        await h.walk(at, 'bank');
        await bot.openBank();
        for (const n of [...new Set(sdk.getInventory().filter(i => !KEEP.test(i.name)).map(i => i.name))]) {
            await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
        }
        if (coins() < 300) await bot.withdrawItem(/^coins$/i, -1);
        hidesLeft = sdk.getBankItems().filter(i => /^cowhide$/i.test(i.name)).reduce((n, i) => n + i.count, 0);
        if (withdrawHides && hidesLeft) await bot.withdrawItem(/^cowhide$/i, Math.min(hidesLeft, h.freeSlots()));
        await bot.closeBank();
        console.log(`bank: hides in bank ${hidesLeft - h.count(/^cowhide$/i)}, carrying ${h.count(/^cowhide$/i)} | coins ${coins()}`);
    }

    const steps: Record<string, () => Promise<void>> = {
        async supplies() {
            await toKharid();
            if (h.has(/^needle$/i) && h.count(/^thread$/i) >= 10) return;
            if (coins() < 100) await bank(false);
            await h.walk(DOMMIK, 'dommik', 2);
            const o = await bot.openShop(/^dommik$/i);
            if (!o.success) throw new Error(`dommik shop: ${o.message}`);
            if (!h.has(/^needle$/i)) console.log('needle:', (await bot.buyFromShop(/^needle$/i, 1)).success);
            console.log('thread:', (await bot.buyFromShop(/^thread$/i, 40)).success, h.count(/^thread$/i));
            await bot.closeShop();
        },

        async batch() {
            await steps.supplies();
            await bank(true);
            const hides = h.count(/^cowhide$/i);
            if (!hides) return;
            // Tan
            await h.walk(TANNER, 'tanner', 2);
            const t = await bot.interactNpc(/^(ellis|tanner)$/i, /trade/i);
            if (!t.success) throw new Error(`tanner: ${t.message}`);
            await sdk.waitForCondition(s => !!s.interface?.isOpen, 5_000).catch(() => {});
            await sdk.sendClickComponent(TAN_HARD_ALL);
            await sdk.waitForCondition(() => h.has(/^hard leather$/i), 5_000).catch(() => {});
            await bot.closeInterface();
            console.log(`tanned ${h.count(/^hard leather$/i)}/${hides} | coins ${coins()}`);
            // Craft: one body per use, no interface.
            for (let i = 0; i < 40 && h.has(/^hard leather$/i); i++) {
                if (!h.has(/^thread$/i)) await steps.supplies();
                const needle = sdk.findInventoryItem(/^needle$/i), leather = sdk.findInventoryItem(/^hard leather$/i);
                if (!needle || !leather) break;
                const n = h.count(/^hard leather$/i);
                await sdk.sendUseItemOnItem(needle.slot, leather.slot);
                await sdk.waitForCondition(() => h.count(/^hard leather$/i) < n, 6_000).catch(() => {});
                await bot.dismissBlockingUI();   // level-up messages
            }
            console.log(`bodies ${h.count(/^hard ?leather body$/i)} | crafting ${crafting()} | thread ${h.count(/^thread$/i)}`);
            // Sell the bodies for next batch's tanning money.
            await h.walk(STORE, 'general store', 2);
            const s = await bot.openShop(/shop ?keeper|shop assistant/i);
            if (s.success) {
                const before = coins();
                const r = await bot.sellToShop(/^hard ?leather body$/i, 'all');
                await bot.closeShop();
                console.log(`sold bodies: ${r.success} +${coins() - before}gp`);
            } else console.log('store failed:', s.message);
        },

        async loop() {
            for (let round = 0; round < 40 && crafting() < TARGET && hidesLeft > 0; round++) {
                await steps.batch();
                console.log(`round ${round}: crafting ${crafting()}, hides left ${hidesLeft} | coins ${coins()}`);
            }
            await bank(false);
            console.log('done: crafting', crafting(), '| hides left', hidesLeft);
        },
    };

    await steps[STEP]();
}, { timeout: 120 * 60_000 });
