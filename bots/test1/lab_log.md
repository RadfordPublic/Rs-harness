# test1 Lab Log

## Session 1 (2026-10-25, local server)

### Goals
- Skip tutorial, complete Cook's Assistant.

### Observations
- Starter kit already has a Bucket and a Pot, so no shopping needed for Cook's Assistant.
- There's no "Dairy cow" NPC in this revision: use the bucket on any `Cow` (field at ~3253,3274).
- Egg is on the ground in the chicken pen at ~3229,3299.
- Windmill: wheat at ~3161,3295, mill ladder at 3164,3307. Hopper + Hopper controls on L2,
  Flour bin on L0 ("Empty" option, or use the pot on it).
- Using grain on the hopper right after climbing reported success but did nothing; a second
  try a few ticks later worked. The script now waits 2 ticks after each climb and retries.
- Quest complete: Cooking 1 -> 30 (7,500 XP).

### Next Steps
- `cooks_assistant.ts` runs all steps or one with `STEP=start|supplies|flour|egg|milk|finish|scan`.
- Use the Lumbridge castle Cooking range now that the quest is done.

## Session 2 (2026-10-25, local server, watched in the browser client)

### Goals
- Complete Sheep Shearer.

### Observations
- No coins in the starter kit: sold the Shortbow to the Lumbridge general store (20gp), bought Shears (1gp).
- Fred the Farmer at ~3189,3273; dialog: "I'm looking for a quest." -> "Yes okay. I can do that."
- Unshorn sheep are npc id 43, shorn are 42. About 1 in 4 shears fails ("gets away").
- Only ~11 free slots, so it took two batches of shear -> spin -> hand in.
- Castle staircase is at (3204, 3207); the far ladder at (3229, 3213) is a trap for "nearest climbable".
- Spinning wheel at (3209, 3212) on L1 only works from its south tile (3209, 3211); otherwise "I can't reach that!".
- Fred takes one ball per tick, so wait for the count to settle before closing the dialog.
- Quest complete: +60gp, Crafting 1 -> 25 (3,750 XP).

### Next Steps
- `sheep_shearer.ts` runs all steps, or one with `STEP=shears|start|shear|spin|give|scan`.

### Possible SDK Bugs or Improvements:
- `useItemOnLoc` returned success for an item-on-loc sent right after a plane change that the
  server never applied.
