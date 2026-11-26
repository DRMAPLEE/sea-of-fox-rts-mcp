import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer as createHttpServer} from 'node:http';
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
  ['rts_build_sites','rts_catalog','rts_diplomacy','rts_draw_identity','rts_island_sites','rts_messages','rts_observe','rts_order','rts_propose_diplomacy','rts_respond_diplomacy','rts_rooms','rts_select_room','rts_send_message','rts_wait']);
 const orders = tools.find(tool=>tool.name==='rts_order');
 assert.equal(orders.annotations.readOnlyHint,false);
 assert.match(JSON.stringify(orders.inputSchema),/sail-to-island/);
 assert.match(JSON.stringify(orders.inputSchema),/dock berths are full/);
 const result = await client.callTool({name:'rts_observe',arguments:{}});
 assert.equal(result.isError,true);
 assert.match(decode(result).error,/SEA_OF_FOX_RTS_TOKEN/);
});

test('CLI explains how to recover from an unavailable RTS MCP API or expired credential', async t => {
 const http = createHttpServer((req,res) => {
  if (req.url === '/api/rts/mcp/session') {
   res.writeHead(404,{'content-type':'text/html'}).end('<h1>Not Found</h1>');
   return;
  }
  res.writeHead(401,{'content-type':'application/json'}).end(JSON.stringify({error:'RTS MCP credential expired or revoked'}));
 });
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise((resolve,reject)=>http.close(error=>error?reject(error):resolve())));
 const client = await launch(t,{
  SEA_OF_FOX_RTS_URL:'http://127.0.0.1:'+http.address().port,
  SEA_OF_FOX_RTS_TOKEN:'test-credential',
 });
 const observation = await client.callTool({name:'rts_observe',arguments:{}});
 assert.equal(observation.isError,true);
 assert.match(decode(observation).error,/HTTP 404.*in-game pairing dialog.*MCP support/);
 const catalog = await client.callTool({name:'rts_catalog',arguments:{}});
 assert.equal(catalog.isError,true);
 assert.match(decode(catalog).error,/expired or revoked.*SEA_OF_FOX_RTS_TOKEN/);
});

const gamePath = process.env.SEA_OF_FOX_GAME_DIR;
test('two MCP agents can negotiate while third parties see only broadcasts', {skip:!gamePath,timeout:25000}, async t => {
 const {pathToFileURL} = await import('node:url');
 const {resolve} = await import('node:path');
 const {createRTSServer} = await import(pathToFileURL(resolve(gamePath,'services/rts-server/src/server.mjs')));
 const {Client:GameClient} = await import('@colyseus/sdk');
 const service = await createRTSServer({enablePhysicalWake:false});
 const endpoint = 'http://127.0.0.1:'+(await service.listen({port:0})).port;
 const rooms = [];
 const worldKey='learn_mcp_diplomacy';
 t.after(async()=>{for(const room of rooms) await room.leave().catch(()=>{});await service.close();});
 const request=async(path,{token,method='GET',body}={})=>{
  const response=await fetch(endpoint+'/api/rts/'+path,{method,headers:{
   'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),
  },body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
 };
 const join=async(token,key=worldKey)=>{
  const sdk=new GameClient(endpoint);sdk.auth.token=token;
  const room=await sdk.joinOrCreate('archipelago',{worldKey:key});rooms.push(room);return room;
 };
 const seat=async(faction,key=worldKey)=>{
  const {data}=await request('session',{method:'POST',body:{worldKey:key,faction,name:faction}});
  return {...data,room:await join(data.token,key)};
 };
 const east=await seat('china'),red=await seat('red'),neutral=await seat('spain');
 const remote=await seat('red','learn_mcp_other_sea');
 const agent=async player=>{
  const {data}=await request('mcp/credential',{token:player.token,method:'POST'});
  const client=await launch(t,{SEA_OF_FOX_RTS_URL:endpoint,SEA_OF_FOX_RTS_TOKEN:data.token});
  return async (name,args={})=>decode(await client.callTool({name,arguments:args}));
 };
 const eastAgent=await agent(east),redAgent=await agent(red);
 assert.equal((await request('diplomacy')).status,401);
 assert.equal((await eastAgent('rts_send_message',{text:'正在接管'})).error,'HUMAN_IN_CONTROL');
 assert.deepEqual((await redAgent('rts_messages')).messages,[]);
 await east.room.leave();await red.room.leave();
 const offer={toFaction:'red',text:'商队通过中岛时停火，如何？',requestId:'offer_1'};
 const first=await eastAgent('rts_send_message',offer);
 assert.equal(first.message.source,'agent');
 assert.equal(first.message.fromFaction,'china');
 assert.equal(first.message.toFaction,'red');
 const repeat=await eastAgent('rts_send_message',offer);
 assert.equal(repeat.replayed,true);
 assert.equal(repeat.message.id,first.message.id);
 assert.match((await eastAgent('rts_send_message',{...offer,text:'改变报价'})).error,/编号/);
 const inbox=await redAgent('rts_messages');
 assert.deepEqual(inbox.messages,[first.message]);
 assert.equal(inbox.nextCursor,first.message.id);
 assert.equal((await redAgent('rts_messages',{after:inbox.nextCursor})).nextCursor,inbox.nextCursor);
 const alliance=await eastAgent('rts_propose_diplomacy',{kind:'alliance',toFaction:'red',requestId:'alliance_offer'});
 assert.equal(alliance.proposal.state,'pending');
 assert.deepEqual((await request('diplomacy/treaties',{token:neutral.token})).data.proposals,[]);
 assert.equal((await redAgent('rts_diplomacy')).proposals[0].id,alliance.proposal.id);
 assert.equal((await redAgent('rts_respond_diplomacy',{proposalId:alliance.proposal.id,decision:'accept'})).proposal.state,'accepted');
 const trade=await eastAgent('rts_propose_diplomacy',{kind:'trade',toFaction:'red',offer:{wood:20},want:{gold:10}});
 const confirmedTrade=await redAgent('rts_respond_diplomacy',{proposalId:trade.proposal.id,decision:'accept'});
 assert.equal(confirmedTrade.proposal.state,'accepted');
 assert.equal((await eastAgent('rts_diplomacy')).factions.find(f=>f.id==='red').relation,'allied');
 const secret=(await request('watch',{token:neutral.token})).data;
 assert.deepEqual(secret.messages,[]);
 assert.deepEqual((await request('diplomacy',{token:remote.token})).data.messages,[]);
 assert.equal((await request('diplomacy',{token:neutral.token,method:'POST',body:{requestId:'overlong',text:'长'.repeat(241)}})).status,400);
 const publicReply=await redAgent('rts_send_message',{text:'红海盗同意暂时停火。'});
 const afterOffer=await eastAgent('rts_messages',{after:first.message.id});
 assert.deepEqual(afterOffer.messages,[publicReply.message]);
 assert.deepEqual((await request('watch',{token:neutral.token})).data.messages,[publicReply.message]);
 assert.equal((await request('watch',{token:east.token})).data.controller,'agent');
 await join(red.token);
 assert.equal((await redAgent('rts_send_message',{text:'测试接管'})).error,'HUMAN_IN_CONTROL');
});

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
 const wait = (until,timeoutMs=6000,afterTick) => call('rts_wait',{until,timeoutMs,afterTick});
 const order = (orders,batchId) => call('rts_order',{orders,batchId});
 const catalog = await call('rts_catalog');
 assert.equal(catalog.protocol,1);
 assert.equal(catalog.buildings.lumber.produces,'wood');
 assert.ok(catalog.commands.includes('embark'));
 assert.ok(catalog.commands.includes('create-island'));
 assert.equal(catalog.victoryRules.pvp,'eliminate-opponents');
 const islandCost=catalog.islandCreation.cost;
 const islandSites=await call('rts_island_sites',{radius:catalog.islandCreation.radii[0],shape:'atoll'});
 assert.ok(islandSites.sites.length,JSON.stringify(islandSites));
 const createIsland={type:'create-island',...islandSites.sites[0],name:'前进基地'};
 assert.equal((await order([createIsland],'human-island')).error,'HUMAN_IN_CONTROL');
 const start=await observe();
 assert.equal(start.controller,'human',JSON.stringify(start));
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

 // Start the fleet close to the objective so this transport test exercises
 // the real berth, embark, arrival, landing and capture rules without a long crossing.
 const world=service.worlds.get(worldKey),island=world.state.islands['wild-0'];
 const treasury=world.state.players[player.playerId].resources;
 assert.match((await order([createIsland],'too-expensive')).error,/资源不足/);
 for(const [resource,cost] of Object.entries(islandCost))treasury[resource]=cost;
 const created=await order([createIsland],'create-island');
 assert.equal(created.accepted,1,JSON.stringify(created));
 const createdId=created.receipts[0].result.islandId;
 assert.deepEqual((await order([createIsland],'create-island')).receipts,created.receipts);
 assert.deepEqual(await wait({type:'tick',tick:created.receipts[0].tick+1}).then(r=>r.matched),true);
 const createdIsland=(await observe({view:'islands',id:createdId})).items[0];
 assert.equal(createdIsland.name,'前进基地');
 assert.equal(createdIsland.ownerFaction,'china');
 assert.equal(createdIsland.custom,true);
 assert.equal(createdIsland.shape,'atoll');
 for(const resource of Object.keys(islandCost))assert.equal(treasury[resource],0);
 const ship=Object.values(world.state.units).find(u=>u.ownerId===player.playerId&&u.kind==='ship');
 const {findIslandLand}=await import(pathToFileURL(resolve(gamePath,'services/rts-server/shared/IslandTerrain.js')));
 const {shipProfile,shipTargetDistance}=await import(pathToFileURL(resolve(gamePath,'services/rts-server/shared/ShipProfiles.js')));
 const berth=world.approachIsland(ship,island);
 assert.ok(berth,'the objective has a valid berth');
 Object.assign(ship,berth,{stance:'passive'});
 const coast=findIslandLand(island,ship,{within:point=>shipTargetDistance(point,ship)<80});
 assert.ok(coast,'there is dry land within boarding range');
 const marine=world.spawn('soldier',player.playerId,'china',coast.x,coast.z,{islandId:island.id,stance:'passive'});
 const embark=await order([{type:'embark',unitIds:[marine.id],shipId:ship.id}],'embark');
 assert.equal(embark.accepted,1,JSON.stringify(embark));
 assert.equal((await wait({type:'unit',id:marine.id,status:'embarked'})).matched,true);
 const sail=await order([{type:'sail-to-island',unitIds:[ship.id],islandId:island.id,waitForBoarding:true}],'sail');
 assert.equal(sail.accepted,1,JSON.stringify(sail));
 assert.equal((await wait({type:'voyage',id:ship.id,islandId:island.id})).matched,true);
 assert.equal((await observe({view:'units',id:ship.id})).items[0].voyage.status,'arrived');
 const landing=await order([{type:'disembark',unitIds:[ship.id],islandId:island.id}],'land');
 assert.equal(landing.accepted,1,JSON.stringify(landing));
 assert.equal((await wait({type:'unit',id:marine.id,status:'ashore',islandId:island.id})).matched,true);
 // Seed a small battle at the flag after verifying the actual landing.
 for(const unit of Object.values(world.state.units)){
  if(unit.hostile&&unit.islandId===island.id) delete world.state.units[unit.id];
 }
 world.recordTerrain(island,'foundation',{x:island.claimX-island.x,z:island.claimZ-island.z,width:46,depth:46,height:6});
 Object.assign(marine,{x:island.claimX,z:island.claimZ,y:6});
 const guard=world.spawn('soldier',opponent.playerId,'red',island.claimX+3.2,island.claimZ,
  {islandId:island.id,stance:'passive',hp:1});
 await wait({type:'tick',tick:world.state.tick+2});
 assert.equal((await observe({view:'units',id:guard.id})).items[0].id,guard.id);
 const attack=await order([{type:'attack',unitIds:[marine.id],targetId:guard.id}],'attack-flag');
 assert.equal(attack.accepted,1,JSON.stringify(attack));
 assert.equal((await wait({type:'event',afterTick:attack.receipts[0].tick,event:'hit',entityId:guard.id})).matched,true);
 assert.equal((await wait({type:'unit',status:'idle',id:marine.id},6000,attack.receipts[0].tick)).matched,true);
 assert.equal((await observe({view:'units',id:guard.id})).items.length,0);
 const capture=await order([{type:'capture',unitIds:[marine.id],islandId:island.id}],'capture-flag');
 assert.equal(capture.accepted,1,JSON.stringify(capture));
 world.tickCaptures(16);
 await wait({type:'tick',tick:world.state.tick+2});
 assert.equal((await observe({view:'islands',id:island.id})).items[0].ownerFaction,'china');

 // In open water the same embark tool handles swimming without a dock.
 const captain=Object.values(world.state.units).find(u=>u.ownerId===player.playerId&&u.kind==='captain');
 Object.assign(ship,{x:-12000,z:-12000,y:0,yaw:0,order:null,pilotId:null,navigationRecovery:null});
 const boardingX=ship.x+shipProfile(ship).hullBounds.max.x+12;
 const party=[captain,marine];
 for(const [index,unit] of party.entries()){
  Object.assign(unit,{x:boardingX,z:ship.z-8-index*4,y:-1,swimming:true,islandId:null});
 }
 const swimmers={type:'embark',unitIds:party.map(unit=>unit.id),shipId:ship.id};
 const passengers=Array.from({length:catalog.units.ship.capacity-1},()=>world.spawn('worker',player.playerId,'china',ship.x,ship.z,{embarkedOn:ship.id}));
 assert.match((await order([swimmers],'insufficient-passenger-seats')).error,/船舱已满/);
 for(const passenger of passengers)world.removeUnit(passenger,{withdrawn:true});
 const swim=await order([swimmers],'swim-boarding');
 assert.equal(swim.receipts[0].result.swimming,true);
 for(const unit of party){
  assert.equal((await wait({type:'unit',id:unit.id,status:'embarked'},10000)).matched,true);
  assert.equal((await observe({view:'units',id:unit.id})).items[0].embarkedOn,ship.id);
 }

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

test('account-key instances pin one room while sharing one account key',async t=>{
 const selected=[];
 const token='sof-account-v1.'+'a'.repeat(43);
 const http=createHttpServer((req,res)=>{
  const send=(status,body)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(body));
  if(req.url==='/api/rts/mcp/rooms'&&req.headers.authorization==='Bearer '+token){
   return send(200,{delegated:[{worldKey:'east'},{worldKey:'west'}]});
  }
  const match=/^\/api\/rts\/mcp\/rooms\/(east|west)\/connect$/.exec(req.url);
  if(match&&req.headers.authorization==='Bearer '+token){
   const worldKey=match[1];
   selected.push(worldKey);
   return send(201,{token:'scoped-'+worldKey,worldKey,faction:'china',expires:Date.now()+60000});
  }
  if(req.url==='/api/rts/mcp/catalog'&&['Bearer scoped-east','Bearer scoped-west'].includes(req.headers.authorization)){
   return send(200,{worldKey:req.headers.authorization.split('-').at(-1)});
  }
  return send(401,{error:'unexpected credential'});
 });
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>http.close(resolve)));
 const env={SEA_OF_FOX_RTS_URL:'http://127.0.0.1:'+http.address().port,SEA_OF_FOX_RTS_TOKEN:token};
 const [east,west]=await Promise.all([launch(t,{...env,SEA_OF_FOX_RTS_ROOM:'east'}),launch(t,env)]);
 assert.equal(decode(await west.callTool({name:'rts_rooms',arguments:{}})).delegated.length,2);
 const result=await west.callTool({name:'rts_select_room',arguments:{worldKey:'west'}});
 assert.equal(decode(result).worldKey,'west');
 assert.ok(!Object.hasOwn(decode(result),'token'));
 const catalogs=await Promise.all([east,west].map(client=>client.callTool({name:'rts_catalog',arguments:{}})));
 assert.deepEqual(catalogs.map(item=>decode(item).worldKey),['east','west']);
 const denied=await west.callTool({name:'rts_select_room',arguments:{worldKey:'east'}});
 assert.match(decode(denied).error,/pinned/);
 assert.deepEqual(selected.sort(),['east','west']);
});

test('MCP selects a cloud save, reads live data on demand and waits for local match ticks',{skip:!gamePath,timeout:25000},async t=>{
 const {pathToFileURL}=await import('node:url');
 const {resolve,join}=await import('node:path');
 const {tmpdir}=await import('node:os');
 const {mkdtemp,rm}=await import('node:fs/promises');
 const load=module=>import(pathToFileURL(resolve(gamePath,'services/rts-server',module)));
 const {createRTSServer}=await load('src/server.mjs');
 const {RTSWorld}=await load('shared/RTSWorld.js');
 const directory=await mkdtemp(join(tmpdir(),'seafox-mcp-headless-')),messages=[];
 const service=await createRTSServer({databaseFile:join(directory,'worlds.sqlite'),enablePhysicalWake:false,emailSender:async m=>messages.push(m)});
 const base='http://127.0.0.1:'+(await service.listen({port:0})).port;
 t.after(async()=>{await service.close();await rm(directory,{recursive:true,force:true});});
 const email='headless@example.test',key='LOCAL-0000000000000002';
 const post=async(path,body,cookie)=>{
  const response=await fetch(base+'/api/rts/'+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const data=await response.json();
  assert.ok(response.ok,JSON.stringify(data));return data;
 };
 const proof=async(purpose,cookie)=>{
  const {challengeId}=await post('auth/email/send',{email,purpose},cookie);
  return {email,challengeId,code:messages.at(-1).code};
 };
 const login=await post('auth/email/verify',await proof('signin'));
 const cookie='tidewater-account='+login.token;
 const root=await post('auth/email/mcp-key',await proof('mcp',cookie),cookie);
 const world=new RTSWorld();world.addPlayer('local-player','领主','china');
 await post('auth/local-saves/'+key+'/sync',{snapshot:{...world.snapshot(),localPlayerId:'local-player'},
  revision:0,release:true,controller:crypto.randomUUID(),writeId:crypto.randomUUID()},cookie);
 await post('auth/local-saves/'+key+'/delegate',{enabled:true},cookie);
 assert.equal(service.live.size,0);
 const client=await launch(t,{SEA_OF_FOX_RTS_URL:base,SEA_OF_FOX_RTS_TOKEN:root.token});
 const call=async(name,args={})=>{
  const result=await client.callTool({name,arguments:args}),data=decode(result);
  assert.equal(result.isError??false,false,JSON.stringify(data));return data;
 };
 assert.ok((await call('rts_rooms')).delegated.some(seat=>seat.worldKey===key));
 assert.equal((await call('rts_select_room',{worldKey:key})).worldKey,key);
 const first=await call('rts_observe');
 assert.equal(first.controller,'agent');
 assert.ok(first.player.resources.wood>0);
 const next=await call('rts_wait',{until:{type:'tick',tick:first.tick+2},timeoutMs:5000});
 assert.equal(next.matched,true);
 const units=await call('rts_observe',{view:'units',filter:'own',kind:'worker'});
 assert.ok(units.items.length>0);
});
