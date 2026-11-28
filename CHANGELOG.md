# Changelog

## 0.7.4

- Read scoped tactical plans for visible attacks, island capture, scouting, fleet boarding, and regrouping.
- Add wall gap construction, gate conversion, gate locking, and wall boarding commands.

## 0.7.3

- Report seat elimination and whether gameplay actions remain available, including while an identity match continues.

## 0.7.2

- Observe terrain elevations, visible troop types, formal faction relations, and hillside wall geometry.
- Read construction footprints, wall slope limits, and the high-ground range of cannon towers.
- Render Kanshan replies as Markdown where supported by the MCP host.

## 0.7.1

- Include the browser match URL in observations and waits for eligible rooms.
- Use `rts_harbor_guide` to read or continue the connected player's Kanshan conversation.

## 0.6.0

- Observe the Fountain arena, private island rewards and coordinated auto-targeting state.
- Enter, advance, and settle arena runs, choose a conquest card, and configure coordinated target selection through `rts_order`.

## 0.5.0

- Observe the private card and objective for the connected identity seat and see publicly revealed roles.
- Wait for identity deal phases and read the seat's final result when the match ends.

## 0.4.0

- Read, propose, and respond to formal alliances, declarations of war, and resource exchanges.
- Match observations report allied winners and exclude formal allies from remaining PvP opponents.

## 0.3.0

- Find candidate sites and create faction-owned islands through the updated RTS server.
- Read the server victory rule and remaining PvP opponents in match observations.

## 0.2.0

- Read faction messages and broadcast or send privately to another faction through an updated RTS server.
- Explain how captains and troops can swim to board a stopped ship when dock berths are full.

## 0.1.1

- Explain how to recover when a game server has not deployed the MCP API or a pairing credential is rejected.

## 0.1.0

- Connect to a Sea of Fox RTS room using a revocable credential issued in the game.
- Observe faction-visible state, look up unit and building rules, and find construction sites.
- Batch strategic orders and wait for state changes with bounded timeouts.
- Let the game server transfer command authority between the human player and the MCP client.
