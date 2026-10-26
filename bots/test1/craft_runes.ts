import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Crafts runes from banked rune essence: bank -> Mysterious ruins (use the talisman) -> Altar
// -> Portal -> bank. Runs until the bank is out of essence, or until stopped: create
// bots/test1/STOP (checked between trips), or kill it.
//   RUNE=air|mind|water|earth|fire|body (default air). Optional LEVEL=<n> stops at Runecrafting n.
//   TARGET=<n> stops once the bank holds n of the rune (default 10,000; 0 = no limit).
const RUNE = (process.env.RUNE ?? 'air').toLowerCase();
const LEVEL = Number(process.env.LEVEL ?? 0) || Infinity;
const MAX_TRIPS = Number(process.env.TRIPS ?? 0) || Infinity;
const TARGET = Number(process.env.TARGET ?? 10_000) || Infinity;
const STOP_FILE = join(import.meta.dir, 'STOP');

// Ruins from the map files (see lab_log); each paired with the nearest bank.
const ROUTES: Record<string, { bank: { x: number, z: number }, ruins: { x: number, z: number } }> = {
    air:   { bank: { x: 3013, z: 3355 }, ruins: { x: 2983, z: 3288 } },   // Falador east bank
    mind:  { bank: { x: 3094, z: 3492 }, ruins: { x: 2981, z: 3510 } },   // Edgeville bank
    water: { bank: { x: 3092, z: 3245 }, ruins: { x: 3184, z: 3161 } },   // Draynor bank
    earth: { bank: { x: 3253, z: 3420 }, ruins: { x: 3305, z: 3470 } },   // Varrock east bank
    fire:  { bank: { x: 3269, z: 3167 }, ruins: { x: 3312, z: 3251 } },   // Al Kharid bank
    body:  { bank: { x: 3094, z: 3492 }, ruins: { x: 3052, z: 3441 } },   // Edgeville bank
};
if (!ROUTES[RUNE]) throw new Error(`unknown RUNE=${RUNE}`);
const { bank: BANK, ruins: RUINS } = ROUTES[RUNE];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const ESS = /^rune essence$/i;
    const TALISMAN = new RegExp(`^${RUNE} talisman$`, 'i');
    const RUNES = new RegExp(`^${RUNE} rune$`, 'i');
    const rc = () => sdk.getSkill('Runecraft')?.baseLevel ?? 1;   // the skill is "Runecraft" in this revision
    const at = (x0: number, x1: number, z0: number, z1: number) => {
        const p = sdk.getState()!.player; return p.worldX > x0 && p.worldX < x1 && p.worldZ > z0 && p.worldZ < z1;
    };
    const inAltar = () => at(2100, 2870, 4780, 4880);         // altar interiors sit in a row, air ~(2841, 4830) westwards
    const inEssMine = () => at(2880, 3000, 4780, 4900);       // in case the miner left us there
    let bankEss = -1, bankRunes = 0, crafted = 0;
    const started = Date.now();

    async function usePortal() {
        const portal = (await sdk.scanNearbyLocs(30)).filter(l => /portal/i.test(l.name)).sort((a, b) => a.distance - b.distance)[0];
        if (!portal) { await h.scan('no portal', 30); return false; }
        const inside = sdk.getState()!.player.worldZ;
        await bot.interactLoc(portal, portal.optionsWithIndex[0]?.text ?? 1);
        await sdk.waitForCondition(s => Math.abs(s.player.worldZ - inside) > 500, 20_000).catch(() => {});
        await sdk.waitForTicks(2);
        return Math.abs(sdk.getState()!.player.worldZ - inside) > 500;
    }

    async function bank() {
        await h.walk(BANK, 'bank');
        const o = await bot.openBank();
        if (!o.success) { console.log('openBank failed:', o.message); return false; }
        // Keep only the talisman; bank runes and anything else picked up along the way.
        for (const item of [...new Set(sdk.getInventory().map(i => i.name))]) {
            if (!TALISMAN.test(item)) await bot.depositItem(new RegExp(`^${item}$`, 'i'), -1);
        }
        const bankItems = () => sdk.getBankItems();
        if (!h.has(TALISMAN)) {
            const t = bankItems().find(i => TALISMAN.test(i.name));
            if (!t) { console.log(`no ${RUNE} talisman in bank or inventory!`); await bot.closeBank(); return false; }
            await bot.withdrawItem(t, 1);
            await sdk.waitForCondition(() => h.has(TALISMAN), 5_000).catch(() => {});
        }
        bankEss = bankItems().filter(i => ESS.test(i.name)).reduce((n, i) => n + i.count, 0);
        if (bankEss > 0) {
            await bot.withdrawItem(ESS, Math.min(h.freeSlots(), bankEss));
            await sdk.waitForCondition(() => h.has(ESS), 5_000).catch(() => {});
            bankEss -= h.count(ESS);
        }
        const runes = bankRunes = bankItems().find(i => RUNES.test(i.name))?.count ?? 0;
        await bot.closeBank();
        const mins = ((Date.now() - started) / 60_000).toFixed(1);
        console.log(`BANK: ${bankEss} essence left, ${runes} ${RUNE} runes | Runecrafting ${rc()} | crafted ${crafted} ess | ${mins} min`);
        return true;
    }

    async function enterAltar() {
        await h.walk(RUINS, 'ruins');
        const ruins = (await sdk.scanNearbyLocs(10)).find(l => /mysterious ruins/i.test(l.name));
        if (!ruins) { await h.scan('no ruins', 10); return false; }
        await bot.useItemOnLoc(TALISMAN, ruins);
        await sdk.waitForCondition(() => inAltar(), 15_000).catch(() => {});
        await sdk.waitForTicks(2);
        return inAltar();
    }

    async function craft() {
        const altar = (await sdk.scanNearbyLocs(20)).find(l => /^altar$/i.test(l.name));
        if (!altar) { await h.scan('no altar', 20); return false; }
        const before = h.count(ESS);
        for (let i = 0; i < 3 && h.has(ESS); i++) {
            await bot.interactLoc(altar, /craft-rune/i);
            await sdk.waitForCondition(() => !h.has(ESS), 10_000).catch(() => {});
            await bot.dismissBlockingUI();   // level-ups
        }
        crafted += before - h.count(ESS);
        return !h.has(ESS);
    }

    // Al Kharid (fire) is behind the 10gp toll gate; the bank and ruins are both inside, so this
    // only runs once per session. Fetches the coins from Varrock east bank.
    async function enterAlKharid() {
        if (RUNE !== 'fire' || sdk.getState()!.player.worldX >= 3268) return true;
        if (h.count(/^coins$/i) < 10) {
            await h.walk({ x: 3253, z: 3420 }, 'Varrock east bank');
            if (!(await bot.openBank()).success) return false;
            const gp = sdk.getBankItems().find(i => /^coins$/i.test(i.name));
            if (!gp || gp.count < 10) { console.log('no 10gp for the toll'); await bot.closeBank(); return false; }
            await bot.withdrawItem(gp, 10);
            await bot.closeBank();
        }
        return h.tollGate('east');
    }

    let failures = 0, stopReason = '';
    for (let step = 0; step < MAX_TRIPS * 4; step++) {
        const betweenTrips = !inAltar() && !inEssMine() && !h.has(ESS);
        if (betweenTrips && existsSync(STOP_FILE)) { stopReason = 'STOP file found'; rmSync(STOP_FILE, { force: true }); break; }
        if (betweenTrips && rc() >= LEVEL) { stopReason = `Runecrafting ${rc()} reached`; break; }
        if (betweenTrips && bankRunes >= TARGET) { stopReason = `${bankRunes} ${RUNE} runes banked`; break; }
        if (betweenTrips && bankEss === 0) { stopReason = 'out of essence'; break; }

        let ok: boolean;
        if (inEssMine()) ok = await usePortal();
        else if (inAltar()) ok = h.has(ESS) ? await craft() : await usePortal();
        else if (!(await enterAlKharid())) ok = false;
        else if (h.has(ESS) && h.has(TALISMAN)) ok = await enterAltar();
        else ok = await bank();

        failures = ok ? 0 : failures + 1;
        if (failures >= 5) { stopReason = `5 failures in a row at ${h.pos()}`; break; }
        if (!ok) await sdk.waitForTicks(10);
    }
    console.log(`DONE (${stopReason}): Runecrafting ${rc()}, crafted ${crafted} essence this run, ${bankEss} left in bank`);
}, { timeout: 7 * 24 * 60 * 60_000 });
