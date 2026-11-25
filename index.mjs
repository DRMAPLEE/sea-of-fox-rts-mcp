#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createServer} from './src/mcp.mjs';

const {version} = JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));
if (process.argv.includes('--version')) {
 console.log(version);
} else if (process.argv.includes('--help')) {
 console.log('Sea of Fox RTS MCP (stdio)\nSet SEA_OF_FOX_RTS_URL and SEA_OF_FOX_RTS_TOKEN in your MCP client environment. Use rts_rooms to find your delegated seats, optionally pin one with SEA_OF_FOX_RTS_ROOM and SEA_OF_FOX_RTS_FACTION.');
} else {
 // The game networking library may log diagnostics. Reserve stdout for MCP.
 console.log = console.info = (...args) => console.error(...args);
 const {mcp,game} = createServer({
  version, server:process.env.SEA_OF_FOX_RTS_URL, token:process.env.SEA_OF_FOX_RTS_TOKEN,
  room:process.env.SEA_OF_FOX_RTS_ROOM,faction:process.env.SEA_OF_FOX_RTS_FACTION,
 });
 const handle = await serveStdio(() => mcp);
 process.stdin.once('end',() => void game.close());
 const stop = async () => {
  await game.close();
  await handle.close();
 };
 process.once('SIGINT',() => void stop());
 process.once('SIGTERM',() => void stop());
}
