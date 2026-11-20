# Sea of Fox RTS MCP

Let your own agent play **狐狸之海：群岛战争** using MCP tools for strategy and faction communication. The adapter runs on your machine and connects directly to a compatible Sea of Fox RTS server. Your browser takes command when you enter the room. When you leave the room, a connected agent regains command of the same units, treasury, and orders.

[![Documentation on DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/DRMAPLEE/sea-of-fox-rts-mcp) · [DeepWiki 中文预览](https://deepwiki.com/DRMAPLEE/sea-of-fox-rts-mcp/preview/511731c7aab1/1.3-) · [中文接入指南](docs/zh-CN.md) · [Game project](https://github.com/DRMAPLEE/sea-of-fox)

Use this one-line command in your local stdio MCP client with the server address and credential configured below.

```sh
npx -y sea-of-fox-rts-mcp@0.3.0
```

## Pair and connect

1. Enter a Sea of Fox RTS room with an updated game and server. For PvE or PvP, start the match in the game first.
2. Open **设置 → RTS MCP → 生成凭证** and copy the server address and credential. You can rotate or revoke this credential from the same menu.
3. Use Node.js 22.23.4 or later. In an MCP host that supports local stdio servers, configure the following. Put the credential in the host’s private environment configuration.

```json
{
  "mcpServers": {
    "sea-of-fox-rts": {
      "command": "npx",
      "args": ["-y", "sea-of-fox-rts-mcp@0.3.0"],
      "env": {
        "SEA_OF_FOX_RTS_URL": "https://your-game-server.example",
        "SEA_OF_FOX_RTS_TOKEN": "paste-your-mcp-credential"
      }
    }
  }
}
```

To try a development checkout, run `npm ci` and use `node` with the absolute path to `index.mjs` as the host's command and argument. For a local test game, set the RTS **server** address to `http://127.0.0.1:5192`. Use HTTPS for remote servers.

If the MCP API responds with HTTP 404, check the configured server address and whether the server operator has deployed MCP support. If your credential expires or is revoked, generate a new one in the game and update `SEA_OF_FOX_RTS_TOKEN`.

Ask your agent to inspect the match while you're connected. Then leave the game room and ask it to run a specific objective, such as “develop the home island, secure a forward base, and win the PvP match by defeating every opposing faction.” Keep your MCP host and agent task running if you want play to continue while the browser is closed.

## Tools

| Tool | What it returns or does |
| --- | --- |
| `rts_catalog` | Current faction rules, prices, unit roles and stats, training queues, resource production rates |
| `rts_observe` | Control status, match objectives, treasury, visible units and buildings, islands, resource reserves, recent events |
| `rts_build_sites` | Candidate construction sites on the builder's island, including dock locations |
| `rts_island_sites` | Find candidate coordinates for a new island using your faction’s visible view |
| `rts_order` | Up to 12 typed orders with individual acknowledgements; includes island creation, economy, construction, training, formations, naval transport, combat, and capture |
| `rts_wait` | Wait up to 20 seconds for control, a tick, a phase, a visible event, construction, a voyage, or a unit state |
| `rts_messages` | Read public broadcasts and the current faction’s private conversations, and discover recipient IDs |
| `rts_send_message` | Broadcast an in-game message or send to another faction while the agent holds control |

Faction communication requires an updated RTS server. Ask your agent to check `rts_messages` between moves and reply in service of the game objective. Messages identify the sending player or agent. An offer of a truce takes effect through the factions’ subsequent play.

See the [play guide](docs/play.md) for a practical opening and [protocol notes](docs/protocol.md) for control and delivery semantics.

## Develop

```sh
npm ci
npm test
npm pack --dry-run
```

To test with a checkout of the game and installed RTS server dependencies, set `SEA_OF_FOX_GAME_DIR` to that checkout and run `npm test`. The integration test starts its own local room and talks to the CLI over MCP stdio. See the [release process](docs/releasing.md).
