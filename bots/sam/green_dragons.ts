import { runScript } from '../../sdk/runner';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { helpers } from './lib';

// Wilderness green dragons (~level 37 Wilderness, members). Only five spawn on this server, all at
// (3078..3118, 3810..3821), respawn 60 ticks. Level 79, 75 HP, weakest to stab (stab def 20, slash/crush 40).
// The anti-dragon shield ("Dragonfire shield", antidragonbreathshield) caps the fire; without it the
// breath can hit 50. Every kill drops dragon bones + a hide (plain "Dragonhide" here): bury the bones, bank the hides.
// Protect from Melee only while fighting; prayer is topped up at the Edgeville monastery altar each trip.
// Banks at Edgeville. Leaves when food runs low or the inventory fills. Progress in dragon_progress.json.
//   FOOD=18 TRIPS=1 bun bots/sam/green_dragons.ts
const FOOD = Number(process.env.FOOD ?? 18);
const TRIPS = Number(process.env.TRIPS ?? 1);
const EAT_AT = Number(process.env.EAT_AT ?? 50);
const LEAVE_FOOD = 3;

const BANK = { x: 3094, z: 3492 };                     // Edgeville
// Monastery altar upstairs (3051, 3498, L1): ladder (3057, 3483). Joining the order (Prayer 31) is asked at the ladder.
const MONASTERY_LADDER = { x: 3057, z: 3484 };
const ALTAR = { x: 3052, z: 3497 };
const LAIR = { x: 3098, z: 3814 };
const ROUTE_OUT = [{ x: 3094, z: 3530 }, { x: 3090, z: 3620 }, { x: 3092, z: 3720 }, LAIR];
const ROUTE_BACK = [{ x: 3092, z: 3720 }, { x: 3090, z: 3620 }, { x: 3094, z: 3530 }, BANK];
const inLair = (x: number, z: number) => x >= 3065 && x <= 3130 && z >= 3800 && z <= 3835;

const SHIELD = /^(dragonfire|anti-dragon) shield$/i;
const KEEP = /^(dragonfire shield|anti-dragon shield|silverlight|.*longsword|.*scimitar|lobster)$/i;
// Hides and anything worth more than a few gp from the drop table; bones are buried straight away.
const LOOT = /^(dragon bones|dragonhide|.*rune$|nature rune|law rune|rune dagger|adamant full helm|mithril kiteshield|steel platelegs|grimy .*|uncut .*|coins)$/i;

const PROGRESS = join(import.meta.dir, 'dragon_progress.json');
type Progress = { kills: number; hides: number; buried: number; trips: number; deaths: number };

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const me = () => sdk.getState()!.player;
    const xp = (s: string) => sdk.getSkill(s)?.experience ?? 0;
    const p: Progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf-8')) : { kills: 0, hides: 0, buried: 0, trips: 0, deaths: 0 };
    const save = () => writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
    const report = () => `${p.kills} kills, ${p.hides} hides banked, ${p.buried} bones buried, ${p.deaths} deaths | hp ${me().hp} food ${h.count(/^lobster$/i)}`;

    async function walkRoute(route: { x: number; z: number }[], label: string) {
        for (const pt of route) {
            if (me().hp < EAT_AT && h.has(/^lobster$/i)) await bot.eatFood(/^lobster$/i);
            if (!(await h.walk(pt, `${label} ${pt.x},${pt.z}`, 3))) return false;
        }
        return true;
    }

    async function buryBones() {
        for (const b of sdk.getInventory().filter(i => /bones$/i.test(i.name))) {
            const opt = b.optionsWithIndex.find(o => /bury/i.test(o.text));
            if (!opt) continue;
            const before = xp('Prayer');
            await sdk.sendUseItem(b.slot, opt.opIndex);
            await sdk.waitForCondition(() => xp('Prayer') > before, 4_000).catch(() => {});
            if (xp('Prayer') > before) p.buried++;
        }
    }

    // Every kill's drop spot stays here until it's picked clean, so a dragon that jumps sam mid-loot
    // doesn't cost the drop: huntLoop comes back to it before picking a new fight.
    const drops: { x: number; z: number }[] = [];
    const isDrop = (g: { x: number; z: number; name: string }) =>
        LOOT.test(g.name) && drops.some(d => Math.abs(g.x - d.x) <= 3 && Math.abs(g.z - d.z) <= 3);

    async function loot() {
        for (let i = 0, fails = 0; i < 30 && fails < 5; i++) {
            const item = sdk.getState()!.groundItems.filter(isDrop)
                .sort((a, b) => Number(/bones/i.test(b.name)) - Number(/bones/i.test(a.name)))[0];
            if (!item) break;
            if (me().isDead) return;
            if (me().combat.inCombat) await protect(true);
            if (me().hp < EAT_AT && h.has(/^lobster$/i)) await bot.eatFood(/^lobster$/i);
            // Make room by eating a lobster; a hide is worth more than a lobster.
            if (h.freeSlots() === 0 && h.has(/^lobster$/i)) await bot.eatFood(/^lobster$/i);
            if (h.freeSlots() === 0) { console.log(`inventory full, leaving ${item.name}`); break; }
            const n = sdk.getInventory().reduce((t, i) => t + i.count, 0);
            const r = await bot.pickupItem(item);
            if (!r.success || sdk.getInventory().reduce((t, i) => t + i.count, 0) === n) fails++;
            if (/bones/i.test(item.name)) await buryBones();
        }
        const left = sdk.getState()!.groundItems.filter(isDrop);
        if (left.length) console.log('loot left:', left.map(g => g.name).join(', '));
        drops.length = 0;
    }

    async function bank() {
        // Long walk if sam starts far away (walkTo gives up after 2 minutes).
        for (let i = 0; i < 10 && !(await h.walk(BANK, 'edgeville bank')); i++);
        const o = await bot.openBank();
        if (!o.success) { console.log('bank failed:', o.message); return false; }
        const hides = h.count(/^dragonhide$/i);
        for (const n of [...new Set(sdk.getInventory().filter(i => !KEEP.test(i.name)).map(i => i.name))]) {
            await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
        }
        p.hides += hides - h.count(/^dragonhide$/i);
        if (!h.has(SHIELD) && !sdk.getEquipment().some(e => SHIELD.test(e.name))) await bot.withdrawItem(SHIELD, 1).catch(() => {});
        const need = FOOD - h.count(/^lobster$/i);
        if (need > 0) await bot.withdrawItem(/^lobster$/i, need).catch(() => {});
        await bot.closeBank();
        save();
        const inBank = sdk.getBankItems().filter(i => /^lobster$/i.test(i.name)).reduce((n, i) => n + i.count, 0);
        console.log(`banked ${hides} hides | food ${h.count(/^lobster$/i)}, lobsters in bank ${inBank} | ${report()}`);
        return true;
    }

    const prayer = () => sdk.getSkill('Prayer')!;
    async function protect(on: boolean) {
        if (on && prayer().level === 0) return;
        for (let i = 0; i < 4 && sdk.isPrayerActive('protect_from_melee') !== on; i++) {
            await sdk.sendTogglePrayer('protect_from_melee');
            await sdk.waitForTicks(1);
        }
    }

    // Top up prayer at the Edgeville monastery altar.
    async function recharge() {
        if (prayer().level >= prayer().baseLevel) return;
        await h.walk(MONASTERY_LADDER, 'monastery ladder', 1);
        for (let i = 0; i < 3 && me().level === 0; i++) {
            const ladder = (await sdk.scanNearbyLocs(4)).find(l => /ladder/i.test(l.name) && l.optionsWithIndex.some(o => /climb/i.test(o.text)));
            if (!ladder) { await h.scan('no monastery ladder'); return; }
            await bot.interactLoc(ladder, /climb[- ]up/i);
            await sdk.waitForCondition(s => s.player.level === 1 || s.dialog.isOpen, 6_000).catch(() => {});
            if (sdk.getState()!.dialog.isOpen) await h.chat([/can i join your order/i]);   // first visit: join the order
        }
        if (me().level !== 1) { console.log('could not get up the monastery ladder'); return; }
        await h.walk(ALTAR, 'altar', 1);
        const altar = (await sdk.scanNearbyLocs(5)).find(l => /altar/i.test(l.name) && l.optionsWithIndex.some(o => /pray/i.test(o.text)));
        if (altar) await bot.interactLoc(altar, /pray/i);
        await sdk.waitForCondition(() => prayer().level >= prayer().baseLevel, 8_000).catch(() => {});
        console.log(`prayer ${prayer().level}/${prayer().baseLevel}`);
        await h.walk(MONASTERY_LADDER, 'ladder top', 1);
        await h.climb('down', /ladder/i);
    }

    async function gearUp() {
        if (h.has(SHIELD)) console.log('shield:', (await bot.equipItem(SHIELD)).success);
        for (const w of [/^silverlight$/i, /longsword$/i, /scimitar$/i]) if (sdk.findInventoryItem(w)) { await bot.equipItem(w); break; }
        // Stab is their weak side: use a stab style if the weapon has one.
        const cs = sdk.getState()?.combatStyle;
        const stab = cs?.styles.find(s => /stab|lunge/i.test(s.name));   // longsword: Lunge
        if (stab && cs?.currentStyle !== stab.index) await sdk.sendSetCombatStyle(stab.index);
    }

    async function hunt() {
        try { return await huntLoop(); } finally { await protect(false); }
    }

    async function huntLoop() {
        let misses = 0;
        while (misses < 40) {
            if (me().isDead) return 'dead';
            if (me().hp < EAT_AT) {
                if (!h.has(/^lobster$/i)) return 'no food';
                await bot.eatFood(/^lobster$/i);
                continue;
            }
            if (drops.length) await loot();   // finish an interrupted loot before the next fight or leaving
            if (h.count(/^lobster$/i) < LEAVE_FOOD && !me().combat.inCombat) return 'food low';
            if (h.freeSlots() === 0 && !h.has(/^lobster$/i)) return 'full';
            if (!inLair(me().worldX, me().worldZ)) { await h.walk(LAIR, 'lair', 4); continue; }

            const fighting = sdk.getNearbyNpcs().find(n => /green dragon/i.test(n.name) && n.targetIndex !== undefined && n.inCombat && n.distance <= 2);
            const d = fighting ?? sdk.getNearbyNpcs()
                .filter(n => /^green dragon$/i.test(n.name) && !n.inCombat && n.hp !== 0 && inLair(n.x, n.z) && n.reachable !== false)
                .sort((a, b) => a.distance - b.distance)[0];
            if (!d) { misses++; await sdk.waitForTicks(5); continue; }
            await protect(true);
            const r = await bot.attack(d);
            if (!r.success) { misses++; await sdk.waitForTicks(2); continue; }
            misses = 0;

            let tx = d.x, tz = d.z, dead = false;
            await sdk.waitForCondition(s => {
                if (s.player.hp < EAT_AT || s.player.isDead) return true;
                const c = s.nearbyNpcs.find(n => n.index === d.index);
                if (c && c.hp !== 0) { tx = c.x; tz = c.z; return false; }
                dead = true;
                return true;
            }, 90_000).catch(() => {});
            // Off between fights so the points last the trip.
            if (dead || !me().combat.inCombat) await protect(false);
            if (dead) {
                p.kills++;
                drops.push({ x: tx, z: tz });
                await sdk.waitForCondition(st => st.groundItems.some(isDrop), 6_000).catch(() => {});
                await loot();
                save();
                console.log(`kill ${p.kills}: hp ${me().hp}, food ${h.count(/^lobster$/i)}, hides ${h.count(/^dragonhide$/i)}, prayer ${prayer().level}`);
            }
        }
        return 'no dragons';
    }

    console.log('start:', report());
    for (let trip = 0; trip < TRIPS; trip++) {
        if (!inLair(me().worldX, me().worldZ)) {
            await gearUp();   // swap the staff out first so the bank keeps it out of the Wilderness
            if (!(await bank())) break;
            await recharge();
            await gearUp();
            if (!sdk.getEquipment().some(e => SHIELD.test(e.name))) { console.log('no anti-dragon shield worn: not going'); break; }
            if (h.count(/^lobster$/i) < 6) { console.log('not enough lobsters banked'); break; }
            if (!(await walkRoute(ROUTE_OUT, 'out'))) { await h.scan('stuck on the way out'); break; }
        }
        const why = await hunt();
        console.log(`trip ${trip} over: ${why} | ${report()}`);
        if (why === 'dead') {
            p.deaths++; save();
            await sdk.waitForCondition(s => !s.player.isDead, 30_000).catch(() => {});
            break;
        }
        await walkRoute(ROUTE_BACK, 'back');
        p.trips++;
        await bank();
    }
    save();
    console.log('done:', report());
}, { timeout: 180 * 60_000 });
