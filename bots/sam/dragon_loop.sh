#!/usr/bin/env bash
# Green dragons -> Al Kharid: tan + craft bodies -> high alch them. Run from rs-sdk/:
#   ROUNDS=5 bash bots/sam/dragon_loop.sh
# When the bank runs low on lobsters (under MIN_FOOD), sam goes to Catherby and fishes up to FISH_TO.
set -o pipefail
LOG=${LOG:-bots/sam/dragon_loop.log}
MIN_FOOD=${MIN_FOOD:-40}
FISH_TO=${FISH_TO:-100}
run() { bun --env-file=bots/sam/bot.env "$@" 2>&1 | grep --line-buffered -v '^\[' | tee -a "$LOG"; }
fish() {   # $1 = lobsters already banked (counting the ones sam carries)
    echo "=== food low ($1): fishing lobsters ===" | tee -a "$LOG"
    STEP=run N=$FISH_TO BANKED=$1 run bots/sam/lobsters.ts >/dev/null || { echo "fishing failed"; exit 1; }
}
for ((r = 1; r <= ${ROUNDS:-5}; r++)); do
    echo "=== round $r ===" | tee -a "$LOG"
    out=$(TRIPS=1 run bots/sam/green_dragons.ts) || { echo "dragons failed"; exit 1; }
    if grep -q "not enough lobsters" <<<"$out"; then fish 0; ((r--)); continue; fi
    grep -qE "not going|dead|stuck" <<<"$out" && { echo "dragons stopped"; exit 1; }
    # Fish from Edgeville, where the dragon trip ends (Al Kharid would mean the toll gate).
    food=$(grep -o "lobsters in bank [0-9]*" <<<"$out" | tail -1 | grep -o "[0-9]*$")
    [[ -n $food && $food -lt $MIN_FOOD ]] && fish $((food + 18))
    STEP=dhide run bots/sam/magic.ts >/dev/null || { echo "dhide failed"; exit 1; }
    STEP=alch run bots/sam/magic.ts >/dev/null || { echo "alch failed"; exit 1; }
done
