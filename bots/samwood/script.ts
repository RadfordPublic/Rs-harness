import { runScript } from '../../sdk/runner';
import { helpers, type Pt } from './lib';

// Sam Wood: trains Attack/Strength/Defence on Lumbridge cows until each reaches
// COMBAT_TARGET (default 20) so Draynor's dark wizards leave him alone, then chops
// trees around Draynor Village and banks the logs at Draynor bank.
//   STEP=all (default) | combat | chop
const STEP = process.env.STEP ?? 'all';
const COMBAT_TARGET = Number(process.env.COMBAT_TARGET ?? 20);
const COW_FIELD = { x: 3253, z: 3280 };
const DRAYNOR_BANK = { x: 3092, z: 3245 };
const SKILLS = ['Attack', 'Strength', 'Defence'] as const;

// Best tree first; each has a patch near Draynor bank to walk to when none are in view.
const TREES: { name: RegExp; level: number; spot: Pt; label: string }[] = [
    { name: /^willow( tree)?$/i, level: 30, spot: { x: 3087, z: 3235 }, label: 'willows south of the bank' },
    { name: /^oak( tree)?$/i, level: 15, spot: { x: 3102, z: 3243 }, label: 'oaks east of the bank' },
    { name: /^tree$/i, level: 1, spot: { x: 3098, z: 3260 }, label: 'trees north of the bank' },
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const lvl = (s: string) => sdk.getSkill(s)?.baseLevel ?? 1;
    const hp = () => sdk.getSkill('Hitpoints')?.level ?? 10;
    const me = () => sdk.getState()!.player;
    const dist = (p: Pt) => Math.hypot(p.x - me().worldX, p.z - me().worldZ);
    const report = () => SKILLS.map(s => `${s} ${lvl(s)}`).join(', ')
        + ` | WC ${lvl('Woodcutting')} | HP ${hp()}/${lvl('Hitpoints')} | combat ${me().combatLevel}`;

    await bot.skipTutorial();
    for (const gear of [/bronze sword/i, /wooden shield/i]) {
        if (h.has(gear)) console.log((await bot.equipItem(gear)).message);
    }
    console.log('start:', report());

    async function trainCombat() {
        if (SKILLS.every(s => lvl(s) >= COMBAT_TARGET)) return;
        await h.walk(COW_FIELD, 'cow field');
        let kills = 0, misses = 0;
        while (SKILLS.some(s => lvl(s) < COMBAT_TARGET) && misses < 20) {
            if (hp() <= 4) { console.log('HP low, resting'); await sdk.waitForTicks(100); continue; }

            const skill = [...SKILLS].sort((a, b) => lvl(a) - lvl(b))[0];
            const style = sdk.getState()?.combatStyle?.styles.find(c => c.trainsSkills.includes(skill));
            if (style && sdk.getState()?.combatStyle?.currentStyle !== style.index) {
                await sdk.sendSetCombatStyle(style.index);
                await sdk.waitForTicks(1);
            }

            const cow = sdk.getNearbyNpcs().filter(n => /^cow$/i.test(n.name)).sort((a, b) => dist(a) - dist(b))[0];
            if (!cow) { misses++; await h.walk(COW_FIELD, 'cow field'); await sdk.waitForTicks(5); continue; }

            const r = await bot.attack(cow);
            if (!r.success) { misses++; await sdk.waitForTicks(2); continue; }
            // Fight until this cow is gone.
            await sdk.waitForCondition(s => !s.nearbyNpcs.some(n => n.index === cow.index), 40_000).catch(() => {});
            misses = 0;
            if (++kills % 5 === 0) console.log(`kills ${kills}: ${report()}`);
        }
        console.log('combat done:', report(), `kills ${kills}`);
    }

    async function bankLogs() {
        await h.walk(DRAYNOR_BANK, 'Draynor bank');
        const open = await bot.openBank();
        if (!open.success) { console.log(`bank: ${open.message}`); return; }
        // Keep the axe if it couldn't be wielded; bank everything else.
        for (const item of sdk.getInventory().filter(i => !/(^|\s)axe$/i.test(i.name))) {
            await bot.depositItem(item, -1);
        }
        await bot.closeBank();
        console.log(`banked, inventory ${sdk.getInventory().length}/28`);
    }

    async function chop() {
        if (!h.has(/axe/i) && !sdk.getState()!.equipment.some(e => /axe/i.test(e.name))) {
            console.log('no axe! stopping');
            return;
        }
        // Wield the axe (replaces the sword) so all 28 slots are free for logs,
        // then clear out the starter kit.
        const axe = sdk.getInventory().find(i => /(^|\s)axe$/i.test(i.name));
        if (axe) console.log((await bot.equipItem(axe)).message);
        if (sdk.getInventory().length > 0) await bankLogs();
        let logs = 0, misses = 0;
        while (misses < 30) {
            if (h.freeSlots() === 0) { await bankLogs(); continue; }
            if (hp() < lvl('Hitpoints') / 2) {
                console.log(`HP ${hp()}, retreating to the bank to recover`);
                await h.walk(DRAYNOR_BANK, 'Draynor bank');
                await sdk.waitForCondition(() => hp() >= lvl('Hitpoints') - 2, 120_000).catch(() => {});
                continue;
            }

            const options = TREES.filter(t => t.level <= lvl('Woodcutting'));
            let target: { tree: NonNullable<ReturnType<typeof sdk.findNearbyLoc>>; kind: typeof TREES[number] } | undefined;
            for (const kind of options) {
                const tree = sdk.getNearbyLocs().filter(l => kind.name.test(l.name)).sort((a, b) => dist(a) - dist(b))[0];
                if (tree && dist(tree) < 20) { target = { tree, kind }; break; }
            }
            if (!target) {
                misses++;
                await h.walk(options[0].spot, options[0].label);
                await sdk.waitForTicks(2);
                continue;
            }

            const r = await bot.chopTree(target.tree);
            if (r.success) {
                misses = 0;
                if (++logs % 10 === 0) console.log(`${logs} logs (${target.kind.label}): ${report()}`);
            } else {
                misses++;
                await sdk.waitForTicks(1);
            }
        }
        console.log(`chop stopped after ${logs} logs:`, report());
    }

    if (STEP === 'all' || STEP === 'combat') await trainCombat();
    if (STEP === 'all' || STEP === 'chop') await chop();
}, { timeout: 6 * 60 * 60_000 });
