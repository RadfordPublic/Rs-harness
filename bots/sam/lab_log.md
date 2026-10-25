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
