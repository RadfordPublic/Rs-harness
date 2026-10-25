import { runScript } from '../../sdk/runner';

// Scratch diagnostic: talk to NPC (regex) and print every dialog page, picking option PICK (regex) when offered.
//   NPC=gypsy PICK="here you go" bun bots/sam/talk_diag.ts
const NPC = new RegExp(process.env.NPC ?? 'gypsy', 'i');
const PICK = process.env.PICK ? new RegExp(process.env.PICK, 'i') : null;
await runScript(async ({ bot, sdk }) => {
    console.log('talk:', (await bot.talkTo(NPC)).message);
    for (let i = 0, closed = 0; i < 60 && closed < 5; i++) {
        const d = sdk.getState()!.dialog;
        if (!d.isOpen) { closed++; await sdk.waitForTicks(1); continue; }
        closed = 0;
        if (d.isWaiting) { await sdk.waitForTicks(1); continue; }
        console.log(`  > ${(d.text ?? '').replace(/\s+/g, ' ').slice(0, 140)} | ${d.options.map(o => `${o.index}:${o.text}`).join(' | ')}`);
        const pick = (PICK && d.options.find(o => PICK.test(o.text))) || d.options[0];
        await sdk.sendClickDialog(pick?.index ?? 0);
        await sdk.waitForTicks(1);
    }
    console.log(sdk.getState()!.gameMessages.slice(-3).map(m => m.text));
}, { timeout: 90_000 });
