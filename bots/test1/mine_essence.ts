import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Mines rune essence via Aubury's teleport and banks it at Varrock east bank.
// Runs until stopped: create bots/test1/STOP (checked after each bank visit), or kill it.
// Optional TARGET=<n> stops once the bank holds n essence (811 = Runecrafting 50 at the
// air altar: 5 XP x the server's 25x rate = 125 XP each, 101,333 XP total).

const TARGET = Number(process.env.TARGET ?? 0) || Infinity;
const MAX_TRIPS = Number(process.env.TRIPS ?? 0) || Infinity;
const STOP_FILE = join(import.meta.dir, 'STOP');

const AUBURY = { x: 3253, z: 3401 };
const BANK = { x: 3253, z: 3420 };            // Varrock east bank

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const ESS = /^rune essence$/i;
    const inMine = () => { const p = sdk.getState()!.player; return p.worldX > 2800 && p.worldX < 3000 && p.worldZ > 4700 && p.worldZ < 4900; };
    let banked = -1;
    const started = Date.now();

    async function bank() {
        await h.walk(BANK, 'bank');
        const o = await bot.openBank();
        if (!o.success) { console.log('openBank failed:', o.message); return false; }
        // Bank everything but the pickaxe (coins, talisman...) so all 28 slots take essence.
        for (const item of [...new Set(sdk.getInventory().map(i => i.name))]) {
            if (!/pickaxe/i.test(item)) await bot.depositItem(new RegExp(`^${item}$`, 'i'), -1);
        }
        banked = sdk.getBankItems().filter(i => ESS.test(i.name)).reduce((n, i) => n + i.count, 0);
        await bot.closeBank();
        const mins = ((Date.now() - started) / 60_000).toFixed(1);
        console.log(`BANKED ${banked}${TARGET < Infinity ? `/${TARGET}` : ''} essence | Mining ${sdk.getSkill('Mining')?.baseLevel} | ${mins} min`);
        return true;
    }

    async function teleport() {
        await h.walk(AUBURY, 'aubury');
        const aubury = sdk.findNearbyNpc(/aubury/i);
        if (!aubury) { console.log('no Aubury'); return false; }
        await bot.interactNpc(aubury, /teleport/i);
        await sdk.waitForCondition(() => inMine(), 15_000).catch(() => {});
        await sdk.waitForTicks(2);
        console.log('teleported:', inMine(), h.pos());
        return inMine();
    }

    async function mine() {
        let stalls = 0;
        while (h.freeSlots() > 0 && stalls < 6) {
            const rock = (await sdk.scanNearbyLocs(20))
                .filter(l => /rune essence|essence/i.test(l.name) && l.optionsWithIndex.some(o => /mine/i.test(o.text)))
                .sort((a, b) => a.distance - b.distance)[0];
            if (!rock) { await h.scan('no essence rock', 20); return; }
            const before = h.count(ESS);
            await bot.interactLoc(rock, /mine/i);
            // Essence never depletes, so mining continues until the inventory fills, unless a level-up
            // dialog (frequent at 25x XP) or anything else stops it. Poll, and re-click as soon as it does.
            let idle = 0, last = h.count(ESS);
            while (h.freeSlots() > 0) {
                await sdk.waitForTicks(3);
                if (sdk.getState()?.dialog.isOpen) { await bot.dismissBlockingUI(); break; }
                const now = h.count(ESS);
                idle = now === last && sdk.getState()!.player.animId === -1 ? idle + 1 : 0;
                last = now;
                if (idle >= 2) break;
            }
            stalls = h.count(ESS) > before ? 0 : stalls + 1;
        }
        console.log(`mined: ${h.count(ESS)} essence`);
    }

    async function leaveMine() {
        const portal = (await sdk.scanNearbyLocs(30))
            .filter(l => /portal/i.test(l.name)).sort((a, b) => a.distance - b.distance)[0];
        if (!portal) { await h.scan('no portal', 30); return false; }
        const opt = portal.optionsWithIndex[0]?.text ?? 1;
        await bot.interactLoc(portal, opt);
        await sdk.waitForCondition(() => !inMine(), 20_000).catch(() => {});
        await sdk.waitForTicks(2);
        console.log('left mine:', !inMine(), h.pos());
        return !inMine();
    }

    // Wield the pickaxe (needs Attack ~1 for bronze) so it doesn't take an inventory slot.
    if (sdk.findInventoryItem(/pickaxe/i)) await bot.equipItem(/pickaxe/i);
    if (!inMine() && !await bank()) return;     // learn the current bank count first
    let failures = 0, stopRequested = false;
    for (let step = 0; step < MAX_TRIPS * 3 && banked < TARGET; step++) {
        // Only stop between trips (inventory banked), so a stop never strands essence in the mine.
        if (!inMine() && !h.has(ESS) && existsSync(STOP_FILE)) { stopRequested = true; break; }
        let ok: boolean;
        if (inMine()) {
            if (h.freeSlots() > 0) await mine();
            ok = await leaveMine();
        } else if (h.has(ESS)) ok = await bank();
        else ok = await teleport();
        // A long unattended run will hit the odd hiccup (busy NPC, missed click): retry a few times.
        failures = ok ? 0 : failures + 1;
        if (failures >= 5) { console.log('5 failures in a row, giving up at', h.pos()); break; }
        if (!ok) await sdk.waitForTicks(10);
    }
    if (stopRequested) rmSync(STOP_FILE, { force: true });
    console.log(banked >= TARGET ? `TARGET REACHED: ${banked} essence banked`
        : `${stopRequested ? 'STOP file found, ' : ''}stopped at ${banked} banked`);
}, { timeout: 7 * 24 * 60 * 60_000 });
