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

## Session 2 (2026-10-25/26): yew longbow alch plan, phase 1 (Varrock)

### Goals
- Long-term: make yew longbows from own flax + yews at Seers' Village and high alch them
  (768gp each). Phases: 1 Varrock (gp, Magic 66, Crafting 10) -> 2 Seers' (bow strings,
  Fletching 70) -> 3 Yanille Magic Guild (nature runes) -> 4 yew longbow alch loop.

### Observations
- Local GE has no traders at all, so it can't buy or sell anything. Nature runes are only sold
  at the Magic Guild (Yanille, Magic 66) and the Mage Arena. Flax only grows in members areas
  out west (Seers' has 48 plants by the bank).
- General stores pay cost x (40% - 3% per item they hold), recovering over a few minutes.
  Yew logs (160): ~400gp per 9 sold. Varrock (3218,3415) and Edgeville (3080,3511) alternated
  give ~400gp per ~10 min trip. Edgeville's shop door can be shut ("I can't reach that!").
- Yews near Varrock: north of the palace (3204,3504) (3208,3500) (3221,3504), church (3248,3472),
  NE (3266,3493) (3270,3470), east (3304,3469); Edgeville (3085,3468) (3085,3480). They respawn
  slowly, so rotate patches. Bronze axe is very slow on yews (12/256 at 99); steel (Bob's, 200gp)
  doubles it.
- Zaff (3203,3433) sells staffs of air and fire (1500gp). Aubury (3253,3402) sells mind/air/chaos.
  Rune prices climb ~1% per rune bought, so big orders average far above base.
- Magic with 25x XP: Wind Strike on cows 1 -> 62 in ~480 casts. Fire Bolt (staff of fire,
  3 air + 1 chaos) 62 -> 66 in 31 casts. Magic 66 reached.

- Crafting 10: shear Lumbridge sheep, spin on the castle wheel. A shut door on L1 blocks the
  wheel's south tile (3209,3211); open it first. 20 balls of wool -> Crafting 11.

## Session 2, phases 2-4 (Seers' Village, Yanille)

### Observations
- Walk Draynor -> Seers' bank via Falador, Taverley and White Wolf Mountain: arrived with 41/44 HP.
- Seers' has it all near the bank (2725,3491): normal trees/oaks/maples beside it, willows just
  north, yews (2705,3459) (2705,3464) (2714,3459), flax field (2738,3440), spinning wheel up the
  ladder (2715,3470) at (2711,3471) L1. ~25 bow strings per flax run.
- A knife-on-logs sent straight after closing the bank is dropped ("Fletching dialog did not
  open"); wait 2 ticks. Unstrung and strung bows share a name ("Maple longbow"): use item ids.
- Fletching 1 -> 73 at 25x: 25 logs of arrow shafts (-> 25), then strung longbows, willow
  shortbows/longbows and maple longbows, 74 bows banked.
- Magic Guild (doors 2584,3087-3088; stairs 2590,3089; Magic Store owner 2595,3087 L1). High
  alch works on bank notes, so take the bows as notes and alternate buy natures / alch there:
  74 bows -> 16,959gp. Nature runes climb ~1% per rune bought: 270 cost ~16.7k (~62 avg).
- Yew longbow loop: 12 per batch -> 9,216gp (768 each). Magic 66 -> 78 from alching so far.

### Next Steps
- `seers.ts STEP=loop` runs the yew longbow loop forever and fetches natures from Yanille when
  they run out. Buying natures in smaller lots per visit (they restock) would cut their price.
- Later: magic longbows (Fletching 85, 1536gp alch); magic trees south of Seers' (2690-2698, 3396-3427).
