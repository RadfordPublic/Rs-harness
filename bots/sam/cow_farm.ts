import { runScript } from '../../sdk/runner';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { helpers } from './lib';

// Kills Lumbridge cows until GOAL kills (default 2000), burying bones on the spot and
// banking cowhides + raw beef at Draynor. Progress is kept in cow_progress.json so a
// restart picks up the count. Trains the lowest of Attack/Strength/Defence until most kills
// take one hit (ONE_SHOT_RATE of the last ONE_SHOT_WINDOW), then Defence only.
//   bun bots/sam/cow_farm.ts                 # run until the goal
//   MAX_MINUTES=5 bun bots/sam/cow_farm.ts   # short test run
const GOAL = Number(process.env.GOAL ?? 2000);
const MAX_MINUTES = Number(process.env.MAX_MINUTES ?? 0);
const PROGRESS = join(import.meta.dir, 'cow_progress.json');

const FIELD = { x: 3253, z: 3285 };
const GATE = { x: 3253, z: 3266 };
const BANK = { x: 3092, z: 3243 };            // Draynor
// Stay north of the Lumbridge dark wizards on the way west (learnings/walking.md).
const TO_BANK = [{ x: 3230, z: 3270 }, { x: 3150, z: 3250 }, BANK];
const TO_FIELD = [{ x: 3150, z: 3250 }, { x: 3230, z: 3270 }, GATE, FIELD];
const SKILLS = ['Attack', 'Strength', 'Defence'] as const;
const LOOT = /^(cowhide|raw beef|bones)$/i;
const ONE_SHOT_WINDOW = 25;
const ONE_SHOT_RATE = 0.8;
const KEEP = /^(bronze sword|wooden shield)$/i;   // never banked; equipped at start

type Progress = {
    kills: number; bankedHides: number; bankedBeef: number; buried: number; trips: number;
    recentHits?: number[];       // hits each of the last ONE_SHOT_WINDOW kills took
    defenceFocus?: boolean;      // latched once we one-shot consistently
};

const inPen = (x: number, z: number) => x >= 3242 && x <= 3265 && z >= 3255 && z <= 3298;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const p: Progress = existsSync(PROGRESS)
        ? JSON.parse(readFileSync(PROGRESS, 'utf-8'))
        : { kills: 0, bankedHides: 0, bankedBeef: 0, buried: 0, trips: 0 };
    const save = () => writeFileSync(PROGRESS, JSON.stringify(p, null, 2) + '\n');
    const lvl = (s: string) => sdk.getSkill(s)?.baseLevel ?? 1;
    const xp = (s: string) => sdk.getSkill(s)?.experience ?? 0;
    const combatXp = () => SKILLS.reduce((n, s) => n + xp(s), 0);
    const me = () => sdk.getState()!.player;
    const hp = () => me().hp;
    const report = () => `kills ${p.kills}/${GOAL} | ${SKILLS.map(s => `${s[0]}${lvl(s)}`).join(' ')} HP ${hp()}/${lvl('Hitpoints')}`
        + ` Pray ${lvl('Prayer')}${p.defenceFocus ? ' [defence focus]' : ''} | banked ${p.bankedHides} hides ${p.bankedBeef} beef | buried ${p.buried} | free ${h.freeSlots()}`;
    p.recentHits ??= [];
    const deadline = MAX_MINUTES ? Date.now() + MAX_MINUTES * 60_000 : Infinity;

    async function walkPath(path: { x: number; z: number }[], label: string) {
        for (const pt of path) {
            for (let i = 0; i < 3; i++) {
                const r = await bot.walkTo(pt.x, pt.z, 3);
                if (r.success) break;
                console.log(`walk ${label} (${pt.x},${pt.z}) try ${i + 1}: ${r.message} at ${h.pos()}`);
                // The pen gate is the usual blocker; open it and retry.
                const gate = sdk.getState()!.nearbyLocs.find(l => /gate/i.test(l.name) && l.optionsWithIndex.some(o => /^open$/i.test(o.text)));
                if (gate) await bot.openDoor(gate);
            }
        }
    }

    async function buryBones() {
        for (const b of sdk.getInventory().filter(i => /^bones$/i.test(i.name))) {
            const opt = b.optionsWithIndex.find(o => /bury/i.test(o.text));
            if (!opt) continue;
            const before = xp('Prayer');
            await sdk.sendUseItem(b.slot, opt.opIndex);
            await sdk.waitForCondition(() => xp('Prayer') > before, 4_000).catch(() => {});
            if (xp('Prayer') > before) p.buried++;
        }
    }

    async function setup() {
        for (const re of [/^bronze sword$/i, /^wooden shield$/i]) {
            if (sdk.findInventoryItem(re)) console.log(`equip ${re}:`, (await bot.equipItem(re)).success);
        }
    }

    async function bankTrip() {
        console.log('bank trip:', report());
        await walkPath(TO_BANK, 'to bank');
        const o = await bot.openBank();
        if (!o.success) { console.log('open bank failed:', o.message); return false; }
        const hides = h.count(/^cowhide$/i), beef = h.count(/^raw beef$/i);
        // Bank everything except the combat gear, including leftover starter-kit items.
        const names = [...new Set(sdk.getInventory().filter(i => !KEEP.test(i.name)).map(i => i.name))];
        for (const n of names) await bot.depositItem(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), -1);
        await sdk.waitForTicks(1);
        p.bankedHides += hides - h.count(/^cowhide$/i);
        p.bankedBeef += beef - h.count(/^raw beef$/i);
        p.trips++;
        save();
        await bot.closeBank();
        console.log(`banked ${hides} hides, ${beef} beef`);
        await walkPath(TO_FIELD, 'to field');
        return true;
    }

    async function loot(x: number, z: number) {
        const near = (g: { x: number; z: number; name: string }) => LOOT.test(g.name) && Math.abs(g.x - x) <= 1 && Math.abs(g.z - z) <= 1;
        // Drops land a tick or two after the death animation.
        await sdk.waitForCondition(s => s.groundItems.some(near), 5_000).catch(() => {});
        for (let i = 0; i < 4; i++) {
            // Bones first: burying frees the slot again straight away.
            const item = sdk.getState()!.groundItems.filter(near)
                .sort((a, b) => Number(/bones/i.test(b.name)) - Number(/bones/i.test(a.name)))[0];
            if (!item || h.freeSlots() === 0) break;
            await bot.pickupItem(item);
            if (/bones/i.test(item.name)) await buryBones();
        }
    }

    async function pickStyle() {
        const skill = p.defenceFocus ? 'Defence' : [...SKILLS].sort((a, b) => lvl(a) - lvl(b))[0];
        const cs = sdk.getState()?.combatStyle;
        const style = cs?.styles.find(c => c.trainsSkills.includes(skill));
        if (style && cs?.currentStyle !== style.index) { await sdk.sendSetCombatStyle(style.index); await sdk.waitForTicks(1); }
    }

    function recordHits(hits: number) {
        p.recentHits!.push(hits);
        if (p.recentHits!.length > ONE_SHOT_WINDOW) p.recentHits!.shift();
        const oneShots = p.recentHits!.filter(n => n === 1).length;
        if (!p.defenceFocus && p.recentHits!.length === ONE_SHOT_WINDOW && oneShots >= ONE_SHOT_RATE * ONE_SHOT_WINDOW) {
            p.defenceFocus = true;
            console.log(`one-shot ${oneShots}/${ONE_SHOT_WINDOW} cows: switching to Defence only`);
        }
    }

    await bot.closeInterface();
    await setup();
    console.log('start:', report());
    if (!inPen(me().worldX, me().worldZ)) await walkPath([GATE, FIELD], 'to field');

    let misses = 0;
    while (p.kills < GOAL && Date.now() < deadline && misses < 30) {
        if (me().isDead) { await sdk.waitForCondition(s => !s.player.isDead, 30_000).catch(() => {}); await walkPath(TO_FIELD, 'respawn'); continue; }
        if (h.freeSlots() < 2) { if (!(await bankTrip())) { misses++; await sdk.waitForTicks(5); } continue; }
        if (hp() <= 4) { console.log('HP low, resting'); await sdk.waitForCondition(() => hp() >= lvl('Hitpoints') - 1, 120_000).catch(() => {}); continue; }
        if (!inPen(me().worldX, me().worldZ)) { await walkPath([GATE, FIELD], 'back to pen'); continue; }
        await buryBones();
        await pickStyle();

        const cow = sdk.getNearbyNpcs()
            .filter(n => /^cow$/i.test(n.name) && inPen(n.x, n.z) && !n.inCombat && n.hp !== 0)
            .sort((a, b) => a.distance - b.distance)[0];
        if (!cow) { misses++; await sdk.waitForTicks(3); continue; }

        const xp0 = combatXp();
        const r = await bot.attack(cow);
        if (!r.success) { misses++; await sdk.waitForTicks(1); continue; }
        // Follow the fight, remembering where the cow stands so we know where the drops land.
        let tx = cow.tileX ?? cow.x, tz = cow.tileZ ?? cow.z, maxHp = cow.maxHp ?? 8;
        // Every damaging hit gives Hitpoints xp, so its changes count our hits on this cow.
        let hpXp = xp('Hitpoints'), hits = 0;
        await sdk.waitForCondition(s => {
            const now = s.skills.find(k => k.name === 'Hitpoints')?.experience ?? hpXp;
            if (now > hpXp) { hits++; hpXp = now; }
            const c = s.nearbyNpcs.find(n => n.index === cow.index);
            if (c && c.hp !== 0) { tx = c.tileX ?? c.x; tz = c.tileZ ?? c.z; maxHp = c.maxHp ?? maxHp; return false; }
            return true;
        }, 60_000).catch(() => {});
        if (process.env.DEBUG) console.log(`fight: gained ${combatXp() - xp0} xp, ${hits} hits, maxHp ${maxHp}, cow`, JSON.stringify(sdk.getState()!.nearbyNpcs.find(n => n.index === cow.index) ?? null));
        // 4 melee xp per damage: only count the kill as ours if we dealt most of its HP.
        if (combatXp() - xp0 >= 4 * maxHp * 0.6) {
            p.kills++;
            misses = 0;
            recordHits(hits);
            await loot(tx, tz);
            save();
            if (p.kills % 10 === 0) console.log(report());
        }
    }
    save();
    console.log(p.kills >= GOAL ? 'GOAL REACHED' : 'stopped', report());
}, { timeout: MAX_MINUTES ? (MAX_MINUTES + 5) * 60_000 : 7 * 24 * 3600_000 });
