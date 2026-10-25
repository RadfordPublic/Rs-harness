import { runScript } from '../../sdk/runner';
import { helpers } from './lib';

// Dragon Slayer, phase A (more steps get added as each part is worked out). STEP=<name>:
//   guildmaster | oziach | shield | scan
// quest_dragon + guild_master.rs2, oziach.rs2, duke_horacio.rs2. Oziach hands over the Melzar's
// Maze key when asked about the first map piece; asking about all three pieces and the shield
// sets the flags the Duke and the Oracle check.
const STEP = process.env.STEP ?? 'all';

const GUILDMASTER = { x: 3190, z: 3361 };    // Champions' Guild (32 QP to enter)
const OZIACH = { x: 3068, z: 3516 };         // Edgeville hut
const CASTLE_STAIRS = { x: 3206, z: 3209 };  // Lumbridge castle staircase (3204, 3207)
const DUKE = { x: 3210, z: 3220 };           // L1

const CHOICES = [
    /rune plate mail body/i, /can you sell me some rune plate mail/i, /guildmaster of the champions' guild told me/i,
    /so how am i meant to prove that/i, /a dragon sounds like fun/i,
    /where is the first piece/i, /where is the second piece/i, /where is the third piece/i,
    /where can i get an antidragon shield/i, /i'll try and get everything together/i,
    /seek a shield that will protect me from the dragon's breath/i,
];

await runScript(async ({ bot, sdk }) => {
    const h = helpers(bot, sdk);
    const level = () => sdk.getState()!.player.level;

    const steps: Record<string, () => Promise<void>> = {
        async scan() { await h.scan('here', 12); },

        async guildmaster() { await h.walk(GUILDMASTER, 'champions guild'); await h.talk(/guild ?master/i, CHOICES); },

        async oziach() {
            await h.walk(OZIACH, 'oziach');
            await h.talk(/oziach/i, CHOICES);
            // chat() takes the first option that matches any pattern, and the shield question is listed
            // first, so ask about each map piece on its own. The first piece's answer is the maze key.
            for (const q of [/first piece/i, /second piece/i, /third piece/i]) {
                await h.talk(/oziach/i, [q, /i'll try and get everything together/i]);
            }
            console.log('maze key:', h.has(/maze key/i), sdk.getInventory().filter(i => /key/i.test(i.name)).map(i => i.name));
        },

        async shield() {
            if (h.has(/anti-dragon|antidragon|dragonfire shield/i)) return;   // it's called "Dragonfire shield" here
            await h.walk(CASTLE_STAIRS, 'castle stairs');
            if (level() === 0) await h.climb('up', /^staircase$/i);
            await h.walk(DUKE, 'duke');
            await h.talk(/duke/i, CHOICES);
            console.log('shield:', h.has(/dragonfire shield/i));
            await h.walk({ x: 3205, z: 3209 }, 'stairs L1');
            await h.climb('down', /^staircase$/i);
        },
    };

    const order = STEP === 'all' ? ['guildmaster', 'oziach', 'shield'] : [STEP];
    for (const s of order) { console.log(`=== ${s} ===`); await steps[s](); }
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name}${i.count > 1 ? ' x' + i.count : ''}`).join(', '), '| at', h.pos());
}, { timeout: 30 * 60_000 });
