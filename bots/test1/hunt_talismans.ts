import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Kills NPCs around an area and picks up talisman drops until every wanted talisman is held.
//   NPCS='^(man|woman|imp)$' WANT='earth,mind' AREA=3222,3218 bun bots/test1/hunt_talismans.ts
// Eats cooked food from the inventory when HP falls to EAT_AT; stops if HP reaches MIN_HP with
// nothing left to eat. Make food with supplies.ts.
const NPCS = new RegExp(process.env.NPCS ?? '^(man|woman|imp)$', 'i');
const WANT = (process.env.WANT ?? 'earth,mind').split(',').map(s => s.trim().toLowerCase());
const [AX, AZ] = (process.env.AREA ?? '3222,3218').split(',').map(Number);
const MIN_HP = Number(process.env.MIN_HP ?? 8);
const RADIUS = Number(process.env.RADIUS ?? 25);
const EAT_AT = Number(process.env.EAT_AT ?? 25);
const FOOD = /^(shrimps|anchovies|sardine|herring|trout|salmon|bread|cake|meat|cooked chicken)$/i;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const talisman = (t: string) => new RegExp(`^${t} talisman$`, 'i');
    const missing = () => WANT.filter(t => !h.has(talisman(t)));
    const hp = () => sdk.getSkill('Hitpoints')?.level ?? 10;
    const me = () => sdk.getState()!.player;
    const dist = (x: number, z: number) => Math.hypot(x - me().worldX, z - me().worldZ);

    async function eat() {
        const food = sdk.getInventory().find(i => FOOD.test(i.name));
        if (!food) return false;
        await bot.eatFood(food);
        await sdk.waitForTicks(2);
        return true;
    }

    async function lootTalismans() {
        if (h.freeSlots() === 0) await eat();   // make room for the drop
        for (let i = 0; i < 5; i++) {
            const drop = (await sdk.scanGroundItems(12)).find(g => /talisman$/i.test(g.name));
            if (!drop) return;
            const r = await bot.pickupItem(drop);
            console.log(`picked up ${drop.name}: ${r.success}`);
        }
    }

    await h.walk({ x: AX, z: AZ }, 'hunting area');
    let kills = 0, misses = 0;
    const skip = new Map<number, number>();   // npc index -> skip until (ms)
    console.log('wanted:', missing().join(', '));
    while (missing().length && misses < 30) {
        while (hp() <= EAT_AT && await eat()) {}
        if (hp() <= MIN_HP) { console.log(`HP ${hp()} and no food, stopping to stay safe`); break; }
        // Lots of Lumbridge's Men/Women are indoors behind closed doors: prefer reachable ones and
        // skip any that just failed for a minute instead of retrying the same one.
        const now = Date.now();
        const candidates = sdk.getNearbyNpcs()
            .filter(n => NPCS.test(n.name) && Math.hypot(n.x - AX, n.z - AZ) < RADIUS && (skip.get(n.index) ?? 0) < now)
            .sort((a, b) => Number((b as any).reachable !== false) - Number((a as any).reachable !== false) || dist(a.x, a.z) - dist(b.x, b.z));
        const target = candidates[0];
        if (!target) { misses++; await h.walk({ x: AX, z: AZ }, 'hunting area'); await sdk.waitForTicks(5); continue; }
        const r = await bot.attack(target);
        if (!r.success) { skip.set(target.index, now + 60_000); misses++; await sdk.waitForTicks(2); continue; }
        misses = 0;
        // Wait for the kill, eating mid-fight if needed.
        const fightEnd = Date.now() + 30_000;
        while (Date.now() < fightEnd && sdk.getNearbyNpcs().some(n => n.index === target.index)) {
            if (hp() <= EAT_AT) await eat();
            await sdk.waitForTicks(1);
        }
        await sdk.waitForTicks(2);   // let the drop appear
        await lootTalismans();
        if (++kills % 10 === 0) console.log(`kills ${kills}, HP ${hp()}, food ${sdk.getInventory().filter(i => FOOD.test(i.name)).length}, still need: ${missing().join(', ') || 'nothing'}`);
    }
    console.log(missing().length ? `stopped after ${kills} kills, still need: ${missing().join(', ')}` : `GOT ALL (${WANT.join(', ')}) after ${kills} kills`);
}, { timeout: 4 * 60 * 60_000 });
