import { runScript } from '../../sdk/runner';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { helpers } from './lib';

// Wilderness green dragons (~level 37 Wilderness, members). Only five spawn on this server, all at
// (3078..3118, 3810..3821), respawn 60 ticks. Level 79, 75 HP, weakest to stab (stab def 20, slash/crush 40).
// The anti-dragon shield ("Dragonfire shield", antidragonbreathshield) caps the fire; without it the
// breath can hit 50. Every kill drops dragon bones + a green dragonhide: bury the bones, bank the hides.
// Banks at Edgeville. Leaves when food runs low or the inventory fills. Progress in dragon_progress.json.
//   FOOD=18 TRIPS=1 bun bots/sam/green_dragons.ts
const FOOD = Number(process.env.FOOD ?? 18);
const TRIPS = Number(process.env.TRIPS ?? 1);
const EAT_AT = Number(process.env.EAT_AT ?? 50);
const LEAVE_FOOD = 3;

const BANK = { x: 3094, z: 3492 };                     // Edgeville
const LAIR = { x: 3098, z: 3814 };
const ROUTE_OUT = [{ x: 3094, z: 3530 }, { x: 3090, z: 3620 }, { x: 3092, z: 3720 }, LAIR];
const ROUTE_BACK = [{ x: 3092, z: 3720 }, { x: 3090, z: 3620 }, { x: 3094, z: 3530 }, BANK];
const inLair = (x: number, z: number) => x >= 3065 && x <= 3130 && z >= 3800 && z <= 3835;

const SHIELD = /^(dragonfire|anti-dragon) shield$/i;
const KEEP = /^(dragonfire shield|anti-dragon shield|silverlight|.*longsword|.*scimitar|lobster)$/i;
// Hides and anything worth more than a few gp from the drop table; bones are buried straight away.
const LOOT = /^(dragon bones|green dragonhide|.*rune$|nature rune|law rune|rune dagger|adamant full helm|mithril kiteshield|steel platelegs|grimy .*|uncut .*|coins)$/i;

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

    async function loot(x: number, z: number) {
        const near = (g: { x: number; z: number; name: string }) => LOOT.test(g.name) && Math.abs(g.x - x) <= 3 && Math.abs(g.z - z) <= 3;
        await sdk.waitForCondition(s => s.groundItems.some(near), 6_000).catch(() => {});
        for (let i = 0; i < 6; i++) {
            const item = sdk.getState()!.groundItems.filter(near)
                .sort((a, b) => Number(/bones/i.test(b.name)) - Number(/bones/i.test(a.name)))[0];
            if (!item) break;
            // Make room for a hide by eating if need be.
            if (h.freeSlots() === 0 && h.has(/^lobster$/i) && me().hp < me().maxHp - 12) await bot.eatFood(/^lobster$/i);
            if (h.freeSlots() === 0) break;
            await bot.pickupItem(item);
            if (/bones/i.test(item.name)) await buryBones();
        }
    }

    async function bank() {
        await h.walk(BANK, 'edgeville bank');
        const o = await bot.openBank();
        if (!o.success) { console.log('bank failed:', o.message); return false; }
        const hides = h.count(/green dragonhide/i);
        for (const n of [...new Set(sdk.getInventory().filter(i => !KEEP.test(i.name)).map(i => i.name))]) {
            await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
        }
        p.hides += hides - h.count(/green dragonhide/i);
        if (!h.has(SHIELD) && !sdk.getEquipment().some(e => SHIELD.test(e.name))) await bot.withdrawItem(SHIELD, 1).catch(() => {});
        const need = FOOD - h.count(/^lobster$/i);
        if (need > 0) await bot.withdrawItem(/^lobster$/i, need).catch(() => {});
        await bot.closeBank();
        save();
        console.log(`banked ${hides} hides | food ${h.count(/^lobster$/i)} | ${report()}`);
        return true;
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
        let misses = 0;
        while (misses < 40) {
            if (me().isDead) return 'dead';
            if (me().hp < EAT_AT) {
                if (!h.has(/^lobster$/i)) return 'no food';
                await bot.eatFood(/^lobster$/i);
                continue;
            }
            if (h.count(/^lobster$/i) < LEAVE_FOOD && !me().combat.inCombat) return 'food low';
            if (h.freeSlots() === 0 && !h.has(/^lobster$/i)) return 'full';
            if (!inLair(me().worldX, me().worldZ)) { await h.walk(LAIR, 'lair', 4); continue; }

            const fighting = sdk.getNearbyNpcs().find(n => /green dragon/i.test(n.name) && n.targetIndex !== undefined && n.inCombat && n.distance <= 2);
            const d = fighting ?? sdk.getNearbyNpcs()
                .filter(n => /^green dragon$/i.test(n.name) && !n.inCombat && n.hp !== 0 && inLair(n.x, n.z) && n.reachable !== false)
                .sort((a, b) => a.distance - b.distance)[0];
            if (!d) { misses++; await sdk.waitForTicks(5); continue; }
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
            if (dead) {
                p.kills++;
                await loot(tx, tz);
                save();
                console.log(`kill ${p.kills}: hp ${me().hp}, food ${h.count(/^lobster$/i)}, hides ${h.count(/green dragonhide/i)}`);
            }
        }
        return 'no dragons';
    }

    console.log('start:', report());
    for (let trip = 0; trip < TRIPS; trip++) {
        if (!inLair(me().worldX, me().worldZ)) {
            if (!(await bank())) break;
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
