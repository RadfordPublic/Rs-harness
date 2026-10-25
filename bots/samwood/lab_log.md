# samwood Lab Log

## Session 1 (2026-10-25, local server, watched in the browser client)

### Goals
- Get combat up so Draynor's dark wizards stop attacking, then chop logs around Draynor Village.

### Observations
- Starter kit has a bronze sword, wooden shield, bronze axe and bronze pickaxe (16 slots in all).
- Cows (25x XP): Attack 20 / Strength 20 / Defence 21 (combat 24) in 12 kills.
- Dark wizards (lvl 7) stand right next to Draynor bank and ignore him at combat 24.
- Woodcutting hit 31 within the first 10 logs, so normal trees and oaks barely matter.
- Willows south of the bank (3087, 3235) confirmed: WC 45 after 20 willow logs.
- Draynor bank walk target (3092, 3245) works; openBank/deposit fine.
- The chop step wields the bronze axe (replacing the sword) and banks everything else, so all
  28 slots hold logs. Match the axe with `/(^|\s)axe$/i`: plain `/axe$/` also matches the pickaxe.

### Next Steps
- `script.ts` runs everything, or one part with `STEP=combat|chop`.
- Oak spot in `TREES` is unchecked (WC passed 15 too fast to need it).

### Possible SDK Bugs or Improvements:
-
