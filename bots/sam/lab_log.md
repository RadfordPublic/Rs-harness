# sam Lab Log

## Session 1 (2026-10-25, local server, watched in the browser client)

### Goals
- Run test1's quest scripts on a fresh account to check they work outside test1.
- Then kill 2000 Lumbridge cows: bury the bones, bank cowhides + raw beef (`cow_farm.ts`).

### Observations
- test1's scripts run on sam unchanged with `bun --env-file=bots/sam/bot.env bots/test1/<script>.ts`
  (env vars beat the sibling bot.env).
- `status.ts`: tutorial skip works.
- `cooks_assistant.ts`: **bug.** The grain went in the hopper, but the hopper-controls pull was sent
  during the fill animation and silently dropped, so the bin stayed empty ("The flour bin is
  already empty." x2) and the finish talk did nothing. Fixed in `bots/sam/cooks_assistant.ts`: wait
  2 ticks, retry the pull until "The grain slides down the chute", and retry the bin. New
  `STEP=mill` does only the hopper/bin part. Quest complete: Cooking 1 -> 30.
- `sheep_shearer.ts`: **two bugs**, both fixed in `bots/sam/sheep_shearer.ts`:
  - Its completion check matches any "Quest complete!" in chat history, so after Cook's Assistant
    it stopped right after starting the quest. Now it only counts completions after the script starts
    (same approach as test1's `romeo_juliet.ts`).
  - The spinning wheel (3209, 3212) can't be used from its south tile (3209, 3211): "I can't reach
    that!". The **north** tile (3209, 3213) works. Quest complete.
- `romeo_juliet.ts`: passed unchanged.
- `rune_mysteries.ts`: quest completes, but the log is misleading: it prints `notes: false` after
  Aubury (the notes come a moment later), and its final "QUEST COMPLETE" check would also match an
  older quest's message. Confirmed done because Aubury now offers the Rune Essence teleport.
- This server gives ~25x XP: a cow (8 HP) is 800 combat XP. ~3 kills/min while fighting.
- Draynor bank round trip from the cow pen works with the waypoints in `cow_farm.ts`.

### Next Steps
- `cow_farm.ts` runs until 2000 kills; progress is in `cow_progress.json`, so rerunning resumes.
  `MAX_MINUTES=5` for a short run, `DEBUG=1` logs every fight.
- It trains the lowest of Att/Str/Def until 80% of the last 25 kills took one hit, then Defence only.

### Possible SDK Bugs or Improvements:
- None filed; the failures above were script timing/position issues, not SDK bugs.

## Session 2 (2026-10-25): quest points toward Dragon Slayer and Lost City

### Goals
- 32 quest points (Champions' Guild, Dragon Slayer), then Lost City for the dragon longsword.
- Stopped the cow farm at 490 kills: Att/Str/Def 70, and hides/beef sell for 0gp.

### Observations
- Quest points come from `^<quest>_questpoints` constants under server/content (no SDK API for %qp).
  Running total: 8 -> Restless Ghost 9 -> Witch's Potion 10 -> Vampire Slayer 13.
- `find_spawn.ts` reads NPC/loc/obj spawns from the server map files. Use it before guessing coords:
  the wiki pages have no coordinates for most NPCs (e.g. Father Urhney is at (3235, 3153), not the swamp hut).
- Read the quest's .rs2 for dialog options; `chat()` just needs regexes for the right ones.
- Recurring pattern: a use/operate sent during an animation is dropped silently (hopper, coffin).
  Wait 2 ticks and retry until the inventory or a game message confirms it.
- `lib.ts` `climb` now prefers reachable stairs and accepts "Climb down"/"Walk-Down" style options.
- Restless Ghost: skull at (3120, 9567) in the Wizards' Tower basement; the ladder back is out of scan
  range from there, so walk to (3104, 9575) first.
- Witch's Potion: at Cooking 30+ beef never burns on a range. Imps drop burnt meat (4/128). The
  Rimmington rats are all in a locked house; Lumbridge castle rats work.
- Imp beads are 5/128 each and imps are spread out: 24 kills in 25 min gave red + white only.
  Imp Catcher is parked until black + yellow turn up.
- Goblin Diplomacy starts with the Rusty Anchor bartender (Port Sarim), not the generals. Goblin mail
  took 79 goblin kills for 3. Woad: Wyson, "How about 20 coins?" gives 2. Redberries are ground spawns SE
  of Varrock. Generals' hut has a large door on the south side.
- Vampire Slayer: Dr Harlow is in the Jolly Boar (3277, 3492), beer from its bartender. Manor crypt
  stairs are "Walk-Down" at (3115, 3357). Exit by the east wing doors.
- Demon Slayer: all keys are named "Key". Palace L2 (Rovin) is via the spiral stairs at (3202, 3497)
  from the ground floor. Fill the bucket at the palace kitchen sink (3224, 3494) beside the drain; the
  washed key despawns in ~2 min, so go straight down the manhole (3237, 3458). The Wizards' Tower
  stairs are past the east and inner doors; leaving needs both doors opened by hand.
- Black Knights' Fortress disguise: iron chainbody 210gp (Horvik / Wayne), bronze med helm (one lies
  on the floor in Draynor Manor). Money is the bottleneck for this and Dragon Slayer.
- Quest points: ... 13 -> Demon Slayer 16 -> Goblin Diplomacy 21 -> Druidic Ritual 25 ->
  Black Knights' Fortress 28 -> Witch's House **32**. Champions' Guild and Dragon Slayer are open.
- Demon Slayer bones: Traiborn counts them one at a time; Lumbridge cows, 22 + 3 in two trips.
- Druidic Ritual meats all come from around Lumbridge (cow, chicken pen, giant rats SW of the castle,
  bears at ~(3168, 3228)). The Taverley Dungeon cauldron is past the prison door; it worked first try.
- Black Knights' Fortress (`black_knights_fortress.ts`): the grill is reached via the secret wall at
  (3016, 3517), ladders up and over, the Sturdy door (3025, 3511) and the ladder down at (3021, 3510).
  **Don't open the Sturdy door from inside**: it aggros every knight; sam fell to 16 HP with no food.
  The cabbage hole is reached from the meeting room instead ("I don't care. I'm going in anyway."):
  ladder (3022, 3518) up, the L1 corridor east, then push the wall at (3030, 3510) from its north side.
  Reward 2500gp.
- Witch's House (`witchs_house.ts`): Nora T. Hagg patrols row z=3463 (x 2904..2930) and only catches
  you north/south of her within 3 tiles, so travel along her row and time the doors. She caught sam
  twice (once undoing the mouse door, once taking the ball). After the shapeshifter is dead the shed
  opens without the key and the ball can be picked up again (`STEP=reball`).
- Cooked beef from the banked raw beef is the food supply (`cook_food.ts`, Port Sarim range).

## Session 3 (2026-10-26): Dragon Slayer

### Observations
- Guildmaster is "Guild master". Oziach: `chat()` takes the first *option* that matches any pattern,
  and "Where can I get an antidragon shield?" is listed first, so ask about each map piece in its own
  chat. The first piece's answer hands over the Maze key. The shield is called "Dragonfire shield".
- Melzar's Maze: route in `melzars_maze.ts`. Keys all drop as plain "Key" and every keeper drops one
  per kill. `funladdertop` (2932, 3240) is the way into the cellar (+6400 z), not a trap. A tile can
  hold a door and a ladder, so pick the loc by its option.
- Wormbrain: wind strike through the bars, then Telekinetic Grab (spell component 1168, not in
  `sdk/spells.ts`) on the map part. Law runes aren't sold anywhere reachable (Magic Guild / Mage
  Arena); Taverley Dungeon chaos druids gave 4 in 18 kills.
- Magic 31 -> 33 took ~7 wind strikes on Port Sarim men (25x XP); I overbought runes (~90 casts left).
- Oracle door: mind bomb (Rising Sun barmaid, "I'll try the Mind Bomb."), silk (Thessalia), lobster
  pot (Gerrant), unfired bowl (clay from Rimmington mine, wet with a bucket from Hetty's sink, Barbarian
  Village potter's wheel; the Falador-south wheels are inside the Crafting Guild). Chest needed a few
  Search clicks. Parts combine into "Crandor map".
- Nails (`nails.ts`): Doric's Quest (6 clay, 4 copper, 2 iron, all in the Dwarven Mine; +1 QP, and
  its 25x Mining reward took Mining 6 -> 51) unlocks his anvils. Use the Ice Mountain trapdoor; the
  Falador-side stairs never took us down. `smithAtAnvil` fails every other call ("interface did not
  open"): just retry. Dwarven Mine coal kept failing; Barbarian Village coal works if you click Mine and
  wait ~30s (bronze pickaxe). Smithing 1 -> 39 on the way.
- Money (`money.ts`): men to Thieving 40 then Falador guards (30gp): 820 -> 2101gp in ~525 tries,
  Thieving 23 -> 56.
- Planks (`planks.ts`): the Wilderness spawns at (3154, 3659), (3154, 3670), (3148, 3671) all had
  planks; banked everything at Edgeville first. No trouble.
- Ship: Klarense "I don't suppose I could buy it?" / "Yep, sounds good." Board, ladder down, plank on
  the hole x3 (hammer + 4 nails each). Ned: ask, then *use the map on him*. His sailing copy is on
  level 3 of the ship (ladder down from (3049, 3208) lands there), "Yep lets go!".
- **Elvarg killed sam.** The shield worked (fire capped at 10), but cooked meat heals 3 and sam ran out
  of 18 of them. Kept iron chainbody, Silverlight, Ghostspeak amulet; lost the shield, helm, wooden
  shield, gloves, hammer, 101gp. Sailing resets the hull (`%dragonquestvar = 0`), so a second trip needs
  3 more planks + 12 more nails, re-hiring Ned ("Can you take me to Crandor again?"), and a new shield
  from the Duke. Next time: real food (lobsters/swordfish), better armour, and check the prayer is on.

## Session 4 (2026-10-26): lobsters, Crandor rebuild, green dragon plan

### Observations
- Lobsters (`lobsters.ts`): Catherby has Harry's shop (net, lobster pot), net and cage spots, a range
  and a bank all within ~40 tiles. Falador -> Catherby goes over White Wolf Mountain (route in the file).
  Fishing 1 -> 67 and 36 cooked lobsters in about an hour at 25x XP.
- Catherby has a net spot that can't be reached: filter on `reachable` and skip any spot that gave
  nothing in the last 60s, or the script clicks it forever.
- Fishing: `player.animId` flickers on and off while waiting on a lobster, so it doesn't show whether
  fishing has started. Check for the "You attempt to catch" message instead, then allow up to 45s for
  the catch. Clicking a spot from 8+ tiles away often does nothing, so walk next to it first.
- Mining with a bronze pickaxe: `mineRock` gives up on coal ("no ore") and gets "Mining operation was
  rejected" on iron. Clicking Mine and waiting up to 40s for the ore count to rise (`mineSlow` in
  `nails.ts`) works for both.
- **Dragon Slayer complete** on the second trip. The redo: new shield from the Duke, 3 planks, 12 nails,
  hammer and 21 lobsters from Draynor bank, patch the hull, then "Can you take me to Crandor again?".
  The sail step has to climb down the ladder at (3049, 3208) to find Ned on level 3. Elvarg went down
  with sam on 39 HP and 8 lobsters eaten. Protect from Melee was confirmed on (the retry loop) and the
  shield took every breath. The quest completes on the kill.
- Getting home from Elvarg (`STEP=home`): the pathfinder can't route out. Open the secret door at
  (2836, 9600), take the Karamja volcano rope at (2856, 9569), whose only option is "Climb", then the
  Musa Point customs officer: "Can I journey on this ship?", "Search away, I have nothing to hide.",
  "Ok.". That's 30gp and lands at Port Sarim (3029, 3217).
- Hammers: Arhein in Catherby (2803, 3430) sells them, as do the Falador general store and the
  Dwarven Mine shops.
- Green dragons (`green_dragons.ts`), from the server data: only 5 spawn, (3078, 3810), (3092, 3810),
  (3098, 3821), (3107, 3812) and (3118, 3820), around Wilderness level 37. Level 79, 75 HP, attack,
  strength and defence 68. Stab defence is 20 (slash and crush 40), so use a stab style. Respawn is
  60 ticks. Every kill drops dragon bones + a hide, whose item name is plain "Dragonhide" (the first
  trip missed every one because the loot regex said "green dragonhide").
- Green dragon trips (`green_dragons.ts`): Edgeville bank -> monastery altar -> straight north to the
  lair, no trouble on the way. Without prayer a kill costs ~4-5 lobsters; with Protect from Melee
  it cost 1. A full prayer (66) only lasts about one fight, though. Trip 2: 3 kills, 3 hides
  banked, 3 bones buried, 0 deaths on 12 lobsters. **Food is the limit:** about 7 kills so far on 30 lobsters.
- Edgeville monastery altar (3051, 3498, L1), up the ladder at (3057, 3483). The first climb asks
  you to join the order ("Well can I join your order?", Prayer 31+). It recharges to base + 2.
- Crafting 34 -> 65 in Al Kharid (`crafting.ts`), on 75 cowhides (3 inventories plus a test one,
  about 30 minutes):
  - Tanner: the Trade option opens the tanning screen; component 8690 tans every hide into hard leather.
  - Using the needle on hard leather makes a body straight away, with no menu. The item is named "Hardleather body".
  - A spool of thread lasts 5 bodies. Dommik sells thread and needles.
  - The toll gate costs 10gp, and sam once arrived with 0 coins, so the script banks at Draynor first.
  - walkTo from Catherby gives up after 2 minutes, so long walks need retries.
  - The general store pays about 17-28gp per body. It paid for the tanning, ending with 2487gp.
  - 390 cowhides are left in the bank, plus 25 Hardleather bodies.
  - Next is dragonhide: vambraces at 57, chaps at 60, body at 63. Tanning is 20gp per hide.
- Magic 35 -> 63 and the Magic Guild's nature runes (`magic.ts`):
  - 3 green hides: tanned in Al Kharid (the item is "Dragon leather"), then the needle on the leather
    opens a make menu with a "Green body" option. That body sold to Oziach for 3120gp. His Trade
    option first asks "Can I buy a rune plate mail body now please?".
  - Bought a staff of earth from Zaff for 1500.
  - Curse on Varrock townsfolk worked, but slowly.
  - Faster is the caged Lesser demon on the top floor of the Wizards' Tower (3110, 3157, L2). Cast
    from (3110, 3160): the pen's railing has `blockrange=no`. The walls do block, so a cast from the
    west side gets "I can't reach that!".
  - Earth Strike (1 air + 1 mind with the staff) from Betty in Port Sarim, about 11gp a cast. It gave
    roughly 1500 XP per cast and took sam from Magic 48 to 63 in about 90 casts.
  - The guild door checks the boosted level against 66. A Wizard's mind bomb (Rising Sun barmaid,
    "I'll try the Mind Bomb.", 2gp) gives +2 plus 2%, so Magic 63 is enough.
  - The store is the Magic Store owner upstairs (2595, 3087, L1), not Wizard Distentor. Nature runes
    there are 20gp with 1000 in stock. 1225gp bought 50, leaving 142gp.
  - Inside the tower, doors close behind you, so the way out opens the nearest closed door and retries.
