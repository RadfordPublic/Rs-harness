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

## Session 3 (2026-10-25): Rune Mysteries, Romeo & Juliet, essence

### Observations
- DIED at combat 4 standing by Aubury's shop: a Mugger (lvl 6) roams there and is aggressive to
  low levels. Lost everything but 3 items; the drop was gone by the time I ran back.
  Fixed by `train_combat.ts` (cows, 25x XP): Attack 21 / Strength 20 / Defence 20 in 12 kills.
- Bob's Axes: sold the bronze axe, bought a bronze pickaxe (1gp).
- Wizards' Tower: walking "near" the basement ladder lands outside the west wall. Enter by the east
  door (3109, 3166), then the inner door (3107, 3162); open both again on the way out.
  Sedridor re-issues a lost research package. Aubury's notes are called "Notes".
- Juliet's house: the SDK pathfinder can't route in or out (dead-ends in the kitchen at 3163,3429).
  In: walkTo the stairs, open the door at (3160, 3440), then climb (3156, 3435).
  Out: open (3160, 3440), then `sdk.sendWalk(3165, 3438)` (the client's own pathing).
- Cadava berries are ground spawns here, not bushes: 3266,3361 / 3273,3375 / 3277,3370.
- Chat history keeps old "Quest complete!" lines; count new ones rather than searching.
- Dialog pages can be 1-2 ticks apart; `lib.ts` chat() waits 4 quiet ticks before giving up.
- Essence: Aubury "Teleport" -> mine -> nearest Portal -> Varrock east bank. ~2.4 min/trip.
  Level-ups (constant at 25x) interrupt mining; poll and re-click. Mining 1 -> 28 in 50 essence.
- Runecrafting 50 = 101,333 XP. Air rune 5 XP x 25 = 125 XP/essence, so 811 essence.

## Session 4 (2026-10-25): Runecrafting
- Mined 3,015 essence total (Mining 1 -> 84) before switching over; stopped the miner with the STOP file.
- `craft_runes.ts`: Falador east bank (3013, 3355) -> Mysterious ruins (use Air talisman; exit lands
  at 2983, 3288) -> Altar "Craft-rune" -> Portal "Use". ~78 tiles each way, under a minute per trip.
- The miner banks the talisman with everything else, so craft_runes withdraws it first.
- The skill is named "Runecraft" in getSkill(), not "Runecrafting".
- 27 essence per trip (talisman takes a slot). 54 essence took Runecraft 1 -> 28.
- Extra air runes per essence every 11 levels (server multiplier 11).
- Crafted all 3,015 essence in ~96 min: Runecraft 1 -> 84, 20,682 air runes banked at Falador east.
- XP: the SDK's `experience` is the engine's raw value / 10. Raw XP per essence (mined or crafted)
  is 50 x 25 = 1,250. The engine's level table (Player.ts levelExperience) is not the standard one:
  raw 3,768,750 = level 84, level 99 starts at raw 9,984,580. So 99 from 84 = ~4,973 more essence,
  for Mining and Runecraft alike (both get the same XP per essence).

## GOAL (set 2026-10-26): 10,000 of every rune
- Craftable here: air, mind, water, earth, fire, body, cosmic, chaos, nature, law.
  Death: impossible (death ruins loc 2462 isn't placed in any map).
- At Runecraft 99, essence per 10k: mind 1,250, water 1,667, earth 2,500, fire 3,334, body 3,334,
  cosmic/chaos/nature 5,000, law 10,000 (~37k essence). Air: done (63k+).
- Phases: (1) F2P talismans by killing: earth (Men), mind (Imps), water+fire (Dark wizards),
  body (Guards). (2) Mine + craft mind/water/earth/fire/body. (3) Nature/chaos talismans
  (rare drop table). (4) Lost City -> Zanaris cosmic altar, cosmic talisman from big-net caskets.
  (5) Death Plateau -> Troll Stronghold -> law talisman; Entrana allows no weapons/armour.
- Progress:
  - [x] air
  - talismans: [x] mind [x] water [x] earth [x] fire [x] body (phase 1 done)
  - runes: [ ] mind  [ ] water  [ ] earth  [ ] fire  [ ] body
  - [ ] cosmic  [ ] chaos  [ ] nature  [ ] law

## Session 5: Mining + Runecraft to 99
- Plan: `TARGET=4980 bun bots/test1/mine_essence.ts`, then `LEVEL=99 bun bots/test1/craft_runes.ts`.
  ~178 mining trips (~2.2 min) then ~185 crafting trips (~0.8 min): roughly 9 hours total.
- DONE 2026-10-26: Mining 99 (4,984 essence, 387 min), Runecraft 99 (161 min). 64,809 air runes
  banked at Falador east. Both scripts ran unattended with no failures beyond the odd retry.
- Next: `hunt_talismans.ts` (Men/Women/Imps in Lumbridge for earth + mind talismans).

## Session 6: Talismans (goal phase 1)
- Lumbridge Men/Women/Imps: Mind talisman early, Earth talisman at kill 58. The first run stalled
  at 37 kills on Men indoors behind doors; now prefers `reachable` NPCs and skips failures for 60s.
- Blocking with the pickaxe the whole time took Defence to 60 (HP 46, combat 39), so weak NPCs
  barely hurt: HP went up during the hunt.
- Talismans held: air, mind, earth. Next: water (Wizards, lvl 9, Wizards' Tower ground floor),
  fire (Dark wizards, Varrock stone circle 3225,3374), body (Guards, Falador north 3006,3321).
- Wizards (lvl 9) cast spells: HP 46 -> 9 in 6 kills despite Defence 60, so hunts need food.
- User: don't sell air runes for money (sold 200 to Betty first: 48gp, then 0gp - her stock is full).
  Food instead comes from `supplies.ts`: small net from Gerrant (5gp), net shrimps/anchovies at
  Draynor (3087, 3227), cook on the Lumbridge castle Cooking range (0 burnt at Cooking 30).
  The Draynor fireplace (3100, 3256) is in a wall: "I can't reach that!". One inventory took
  Fishing 1 -> 34 (~10 min). `hunt_talismans.ts` now eats at EAT_AT.
- With food: 10 Wizard kills ate all 23 shrimps/anchovies (~10 HP per kill). Kills are slow at
  Attack 21 / Strength 20 with a pickaxe, so the Wizards get many casts in. Training Attack +
  Strength to 45 on cows (`TARGET=45 MINUTES=90 train_combat.ts`) before retrying.
- After training (48 cows, Attack/Strength 45, Defence 63): ~27 Wizard kills per 23 food.
  WATER TALISMAN at total ~62 Wizard kills (3 food loads). Fishing reached 55 along the way.
- Skeletons (fire) and Hill giants (body) are in Edgeville dungeon (~3114, 9910); trying Falador
  Guards for body first since they're melee and near the Draynor food loop.
- BODY TALISMAN after 68 Falador Guard kills (AREA=2966,3385 RADIUS=40), ~35 kills per 22 food.
- Fire: Dark wizards next to the Draynor fishing spots (3084, 3236). FIRE TALISMAN after ~386 kills
  over 6 food rounds (drop table: young lvl 7 = 1/128, bearded lvl 20 = 2/128; 5 extra water
  talismans meanwhile). Fishing reached 70. All six F2P talismans held: phase 1 done.
- Phase 2: mine ~12,100 essence (`TARGET=12100 mine_essence.ts`), then `RUNE=x craft_runes.ts` for
  mind, water, earth, fire, body.
- Mysterious ruins (from `server/content/maps/*.jm2`, loc ids 2453-2461, tile = map*64 + local):
  mind (2981, 3513) N of Falador; water (3184, 3164) Lumbridge swamp; earth (3305, 3473) NE of
  Varrock; fire (3312, 3254) Al Kharid; body (3052, 3444) S of Edgeville; cosmic (3175, 9496)
  underground (m49_148); law (2857, 3380) Entrana; nature (2868, 3018) Karamja;
  chaos (3059, 3590) Wilderness.

## GOAL CHANGE (2026-10-26): 10k runes cancelled -> run samwood's yew longbow alch loop
- User cancelled the runes goal. Stopped at 6,832 essence banked (mining had reached 6,300/12,100).
- New goal: test1 runs its own `seers.ts` (copy of bots/samwood/seers.ts). Gaps: Magic 1 -> 66,
  Woodcutting 1 -> 60, Fletching 1 -> 70, no axe/knife, 76gp. Strength is 94 from the hunts.
- test1 makes its own runes instead of buying staffs: 1,296 mind runes (Wind Strike with its
  64k air runes), 6,000 fire runes (high alch takes 5 fire + 1 nature; ~1,200 casts).
- Al Kharid toll gate (3268, 3227-3228; x >= 3268 is inside) costs 10gp each way; talk via the gate's
  Open, pick "Yes, ok.". The bank and fire ruins are both inside, so fire crafting crosses once.
  `lib.ts tollGate(side)` checks the side after walking up: the walk can already land inside.
- Plan: `RUNE=fire TARGET=6000 craft_runes.ts` -> `train_magic.ts` (cows, Magic 66) ->
  `seers.ts` (setup: knife spawn + bronze axe from Bob; travel; fletch to 70 with a Woodcutting gate
  per recipe; Yanille: alch the training bows to bootstrap nature-rune gp; loop).

### Possible SDK Bugs or Improvements:
- walkTo with tolerance can stop on the far side of a wall (Wizards' Tower west wall).
- Pathfinder has no route in/out of Juliet's house; the client's own walk does.
- `useItemOnLoc` returned success for an item-on-loc sent right after a plane change that the
  server never applied.
