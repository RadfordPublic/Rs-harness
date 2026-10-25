import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Trains Attack/Strength/Defence on Lumbridge cows, always the lowest of the three,
// until each reaches TARGET (default 20). Stops early if HP gets low.
const TARGET = Number(process.env.TARGET ?? 20);
const FIELD = { x: 3253, z: 3280 };
const SKILLS = ['Attack', 'Strength', 'Defence'] as const;

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const lvl = (s: string) => sdk.getSkill(s)?.baseLevel ?? 1;
    const hp = () => sdk.getSkill('Hitpoints')?.level ?? 10;
    const report = () => SKILLS.map(s => `${s} ${lvl(s)}`).join(', ') + ` | HP ${hp()}/${lvl('Hitpoints')}`;

    await h.walk(FIELD, 'cow field');
    console.log('start:', report());
    let kills = 0, misses = 0;
    while (SKILLS.some(s => lvl(s) < TARGET) && misses < 20) {
        if (hp() <= 4) { console.log('HP low, resting'); await sdk.waitForTicks(100); continue; }

        const skill = [...SKILLS].sort((a, b) => lvl(a) - lvl(b))[0];
        const style = sdk.getState()?.combatStyle?.styles.find(c => c.trainsSkills.includes(skill));
        if (style && sdk.getState()?.combatStyle?.currentStyle !== style.index) {
            await sdk.sendSetCombatStyle(style.index);
            await sdk.waitForTicks(1);
        }

        const cow = sdk.getNearbyNpcs().filter(n => /^cow$/i.test(n.name))
            .sort((a, b) => Math.hypot(a.x - sdk.getState()!.player.worldX, a.z - sdk.getState()!.player.worldZ)
                          - Math.hypot(b.x - sdk.getState()!.player.worldX, b.z - sdk.getState()!.player.worldZ))[0];
        if (!cow) { misses++; await h.walk(FIELD, 'cow field'); await sdk.waitForTicks(5); continue; }

        const r = await bot.attack(cow);
        if (!r.success) { misses++; await sdk.waitForTicks(2); continue; }
        // Fight until this cow is gone or we've stopped fighting for a few ticks.
        await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === cow.index), 40_000).catch(() => {});
        misses = 0;
        if (++kills % 5 === 0) console.log(`kills ${kills}: ${report()}`);
    }
    console.log('done:', report(), `kills ${kills}`);
}, { timeout: 30 * 60_000 });
