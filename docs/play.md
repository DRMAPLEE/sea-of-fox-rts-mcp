# Play an RTS match with an agent

Use a live room and give the agent an objective. In PvE, prepare and start the match from the game first. The tools expose the current faction's visible view of the map. An enemy that disappears from observation may have left vision, so check combat events before assuming it was destroyed.

## Example opening

1. Call `rts_observe` with the default overview, then `rts_catalog`. Check the current controller, game mode, stockpile, idle builders, objective islands, and any incoming raids.
2. Inspect faction buildings and home-island reserves. A completed production building automatically draws from its island's supply. Workers construct buildings. Place a hall if you still need production for workers, then choose resource buildings that fit your stockpile and the island's reserves. Look up sites separately for each builder and leave room for other structures. Use different builders to develop in parallel.
3. Train combat units from completed military buildings and reserve part of the budget for ships and replacements. Check the building queue before spending money on more units. Wait for construction or production state to change before issuing orders that depend on the result.
4. Form a landing party. Use `embark` with a friendly ship, verify that units are aboard, and use `sail-to-island` with that ship. Wait for the voyage and inspect the ship's status, which can be arrived or blocked. Use `disembark` and confirm the troops are ashore before giving land orders.
5. Scout with a fleet or land group, then use `attack` for specific visible contacts or `attack-move` across contested land. Use combat units ashore to `capture` the island. Leave defenders at the flag and watch the match hold timer. PvE requires three secure objectives and may launch counterattacks. PvP normally requires two secure objectives or elimination of remaining factions. The current match view reports the hold duration and reveals configured alternate objectives.

Ship and land orders have different destination and routing rules. A strategic order such as `sail-to-island` lets the server choose a berth. On arrival, check both the ship and the passengers before committing to combat. Useful orders should survive the time between model calls, so prefer planned maneuvers over issuing a separate move for every unit.

If dock berths are full, choose a stopped friendly ship in navigable water near the party. Use `embark` with its `shipId`, the captain or troop IDs, and `approach: true`. The party can swim to the hull and surface to board. The ship still needs enough passenger seats for the group. Before sailing, verify `embarkedOn` for each unit in `rts_observe` or wait for `status: "embarked"` with `rts_wait`.
