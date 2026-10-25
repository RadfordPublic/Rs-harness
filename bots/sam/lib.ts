// Shared helpers for test1's quest and skilling scripts.
import type { BotActions } from '../../sdk/actions';
import type { BotSDK } from '../../sdk';

export type Pt = { x: number; z: number };

export function helpers(bot: BotActions, sdk: BotSDK) {
    const pos = () => { const p = sdk.getState()!.player; return `(${p.worldX}, ${p.worldZ}, L${p.level})`; };
    const count = (re: RegExp) => sdk.getInventory().filter(i => re.test(i.name)).reduce((n, i) => n + i.count, 0);
    const has = (re: RegExp) => count(re) > 0;
    const freeSlots = () => 28 - sdk.getInventory().length;
    const messages = () => sdk.getState()!.gameMessages.map(m => m.text);

    async function walk(t: Pt, label: string, tolerance = 3) {
        const r = await bot.walkTo(t.x, t.z, tolerance);
        console.log(`walk ${label}: ${r.success ? 'ok' : r.message} now ${pos()}`);
        return r.success;
    }

    // Click through a dialog, picking the first option matching any of `prefer`.
    async function chat(prefer: RegExp[] = []) {
        let closedFor = 0;
        for (let i = 0; i < 80; i++) {
            const d = sdk.getState()?.dialog;
            // Pages can be a tick or two apart (mesbox, inv changes), so only stop after a quiet spell.
            if (!d?.isOpen) { if (++closedFor >= 4) return; await sdk.waitForTicks(1); continue; }
            closedFor = 0;
            if (d.isWaiting) { await sdk.waitForTicks(1); continue; }
            const pick = d.options.length > 1 && prefer.length
                ? d.options.find(o => prefer.some(p => p.test(o.text)))
                : undefined;
            if (pick) console.log(`  * ${pick.text}`);
            else if (d.options.length > 1) console.log(`  ? options: ${d.options.map(o => o.text).join(' | ')}`);
            await sdk.sendClickDialog(pick ? pick.index : d.options[0]?.index ?? 0);
            await sdk.waitForTicks(1);
        }
    }

    async function talk(npc: RegExp, prefer: RegExp[] = []) {
        const r = await bot.talkTo(npc);
        console.log(`talk ${npc}: ${r.success ? 'ok' : r.message}`);
        // talkTo can give up just before a slow dialog opens, so give it a few more ticks.
        const opened = r.success || await sdk.waitForCondition(s => s.dialog.isOpen, 3_000).then(() => true, () => false);
        if (opened) await chat(prefer);
        return opened;
    }

    async function climb(dir: 'up' | 'down', name = /ladder|staircase/i) {
        const opt = dir === 'up' ? /(climb|walk)[- ]up/i : /(climb|walk)[- ]down/i;
        const locs = await sdk.scanNearbyLocs(15);
        // Nearest reachable one first; a closer staircase behind a wall is a common trap.
        const stairs = locs.filter(l => name.test(l.name) && l.optionsWithIndex.some(o => opt.test(o.text)))
            .sort((a, b) => Number(b.reachable !== false) - Number(a.reachable !== false) || a.distance - b.distance)[0];
        if (!stairs) { console.log(`nothing to climb ${dir}`); return false; }
        const before = sdk.getState()!.player;
        await bot.interactLoc(stairs, opt);
        // Basements are a z offset of ~6400 on the same level, so watch both.
        await sdk.waitForCondition(s => s.player.level !== before.level || Math.abs(s.player.worldZ - before.worldZ) > 1000, 10_000).catch(() => {});
        await sdk.waitForTicks(2);   // uses sent straight after a plane change can be dropped
        console.log(`climb ${dir} ${stairs.name}: ${pos()}`);
        return true;
    }

    async function scan(label: string, radius = 12) {
        const locs = await sdk.scanNearbyLocs(radius);
        const names = [...new Set(locs.filter(l => l.optionsWithIndex.length).map(l => `${l.name}@${l.x},${l.z}`))];
        console.log(`${label} ${pos()} locs:`, names.slice(0, 30).join('  '));
        console.log('npcs:', sdk.getNearbyNpcs().map(n => `${n.name}@${n.x},${n.z}`).slice(0, 20).join(', '));
    }

    return { pos, count, has, freeSlots, messages, walk, chat, talk, climb, scan };
}
