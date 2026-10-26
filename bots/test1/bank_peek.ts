import { runScript } from '../../sdk/runner';

// Opens the nearest bank, deposits the inventory, and prints the bank contents.
await runScript(async ({ bot, sdk }) => {
    await bot.walkTo(3253, 3420, 3);
    const r = await bot.openBank();
    if (!r.success) throw new Error(r.message);
    for (const i of [...new Set(sdk.getInventory().map(i => i.name))]) await bot.depositItem(new RegExp(`^${i}$`, 'i'), -1);
    console.log(sdk.getBankItems().map(i => `${i.name} x${i.count}`).join('\n'));
    await bot.closeBank();
}, { timeout: 120_000 });
