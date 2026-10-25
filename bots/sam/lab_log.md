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
