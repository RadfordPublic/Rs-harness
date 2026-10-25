import { runScript } from '../../sdk/runner';

// Skips the tutorial if needed, then prints position and inventory.
await runScript(async ({ bot, sdk }) => {
    const r = await bot.skipTutorial();
    console.log('skipTutorial:', r.success, r.message);
    const p = sdk.getState()!.player;
    console.log(`Position: (${p.worldX}, ${p.worldZ}) level ${p.level}`);
    console.log('Inventory:', sdk.getInventory().map(i => `${i.name} x${i.count}`).join(', '));
}, { timeout: 60_000 });
