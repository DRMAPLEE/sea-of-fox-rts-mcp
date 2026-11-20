import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const cli = fileURLToPath(new URL('../index.mjs',import.meta.url));
async function launch(t,env={}) {
 const client = new Client({name:'sea-of-fox-test',version:'1.0.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli],env}));
 t.after(() => client.close());
 return client;
}

const decode = result => result.structuredContent || JSON.parse(result.content[0].text);
test('CLI exposes structured RTS tools through stdio and tells unpaired players how to connect', async t => {
 const client = await launch(t,{SEA_OF_FOX_RTS_URL:'',SEA_OF_FOX_RTS_TOKEN:''});
 const {tools} = await client.listTools();
 assert.deepEqual(tools.map(tool=>tool.name).sort(),
  ['rts_build_sites','rts_catalog','rts_observe','rts_order','rts_wait']);
 const orders = tools.find(tool=>tool.name==='rts_order');
 assert.equal(orders.annotations.readOnlyHint,false);
 assert.match(JSON.stringify(orders.inputSchema),/sail-to-island/);
 const result = await client.callTool({name:'rts_observe',arguments:{}});
 assert.equal(result.isError,true);
 assert.match(decode(result).error,/SEA_OF_FOX_RTS_TOKEN/);
});

const gamePath = process.env.SEA_OF_FOX_GAME_DIR;
test('real RTS pairing, fog, economy orders and human/agent handoff', {skip:!gamePath,timeout:25000}, async t => {
 const {pathToFileURL} = await import('node:url');
 const {resolve} = await import('node:path');
 const {createRTSServer} = await import(pathToFileURL(resolve(gamePath,'services/rts-server/src/server.mjs')));
 const {Client:GameClient} = await import('@colyseus/sdk');
 const service = await createRTSServer({enablePhysicalWake:false});
 const endpoint = 'http://127.0.0.1:'+(await service.listen({port:0})).port;
 const rooms = [];
 const worldKey = 'integration-mcp';
 t.after(async()=>{for (const room of rooms) await room.leave().catch(()=>{}); await service.close();});
 const request = async (path,{token,method='GET',body}={}) => {
  const response=await fetch(endpoint+path,{method,headers:{
   'content-type':'application/json',...(token ? {authorization:'Bearer '+token} : {}),
  },body:body ? JSON.stringify(body) : undefined});
  return {status:response.status,body:await response.json()};
 };
 const join = async token => {
  const sdk = new GameClient(endpoint);
  sdk.auth.token=token;
  const room=await sdk.joinOrCreate('archipelago',{worldKey});
  rooms.push(room);
  return room;
 };
 const player = (await request('/api/rts/session',{method:'POST',body:{worldKey,faction:'china'}})).body;
 let human = await join(player.token);
 const opponent = (await request('/api/rts/session',{method:'POST',body:{worldKey,faction:'red'}})).body;
 await join(opponent.token);
 const credential = await request('/api/rts/mcp/credential',{method:'POST',token:player.token});
 assert.equal(credential.status,201);
 const token=credential.body.token;
 assert.equal((await request('/api/rts/session',{token})).status,401);
 assert.equal((await request('/api/rts/mcp/credential',{method:'POST',token})).status,401);

 const client = await launch(t,{SEA_OF_FOX_RTS_URL:endpoint,SEA_OF_FOX_RTS_TOKEN:token});
 const call = async (name,args={}) => decode(await client.callTool({name,arguments:args}));
 const observe = options => call('rts_observe',options);
 const wait = (until,timeoutMs=6000) => call('rts_wait',{until,timeoutMs});
 const order = (orders,batchId) => call('rts_order',{orders,batchId});
 const catalog = await call('rts_catalog');
 assert.equal(catalog.protocol,1);
 assert.equal(catalog.buildings.lumber.produces,'wood');
 assert.ok(catalog.commands.includes('embark'));
 const start=await observe();
 assert.equal(start.controller,'human');
 assert.equal(start.playerId,player.playerId);
 assert.ok(start.player.resources.wood>0);
 assert.equal(start.visibleOtherUnits.red,undefined);
 const builder=start.idleBuilders.find(u=>u.kind==='worker');
 assert.ok(builder);
 const build = await call('rts_build_sites',{builderId:builder.id,kind:'lumber'});
 assert.ok(build.sites.length>0,JSON.stringify(build));
 const hall=(await observe({view:'buildings',filter:'faction',kind:'hall'})).items[0];
 const train={type:'train',kind:'worker',buildingId:hall.id};
 assert.equal((await order([train],'blocked-human')).error,'HUMAN_IN_CONTROL');
 assert.equal((await request('/api/rts/rooms')).body.rooms[0].online,2,'MCP does not occupy another player seat');

 await human.leave();
 const handedOff = await wait({type:'control',controller:'agent'});
 assert.equal(handedOff.matched,true);
 const site=build.sites[0];
 const commands=[train,{type:'build',kind:'lumber',unitIds:[builder.id],x:site.x,z:site.z}];
 const first=await order(commands,'economy-opening');
 assert.equal(first.accepted,2,JSON.stringify(first));
 const again=await order(commands,'economy-opening');
 assert.deepEqual(again.receipts,first.receipts);
 const construction=first.receipts[1].result.buildingId;
 const owned=await observe({view:'buildings',filter:'own',id:construction});
 if (!owned.items.length) await wait({type:'tick',tick:first.receipts[1].tick+1});
 assert.equal((await observe({view:'buildings',filter:'own',id:construction})).items[0].kind,'lumber');

 human=await join(player.token);
 assert.equal((await wait({type:'control',controller:'human'})).matched,true);
 assert.equal((await order([train],'returned-human')).error,'HUMAN_IN_CONTROL');
 human.reconnection.enabled=false;
 const reconnectToken=human.reconnectionToken;
 human.connection.close();
 assert.equal((await wait({type:'control',controller:'agent'})).matched,true);
 const humanSdk=new GameClient(endpoint);
 humanSdk.auth.token=player.token;
 const returned=await humanSdk.reconnect(reconnectToken);
 rooms.push(returned);
 assert.equal((await wait({type:'control',controller:'human'})).matched,true);

 assert.equal((await request('/api/rts/mcp/credential',{method:'DELETE',token:player.token})).status,200);
 assert.equal((await request('/api/rts/mcp/session',{token})).status,401);
 const revoked=await call('rts_catalog');
 assert.match(revoked.error,/revoked/);
 assert.match((await observe()).error,/revoked|Disconnected/);
 await client.close();
});
