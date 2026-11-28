const readEntry=(table,id)=>typeof table?.get==='function'?table.get(id):table?.[id];
const parse = (value, fallback) => value ? JSON.parse(value) : fallback;
const values = (state, key) => Object.values(state[key] || {});
const coordinates = record => ({x:Math.round(record.x*10)/10, z:Math.round(record.z*10)/10});
const own = (record, id) => record.ownerId === id;

function page(rows, {cursor, limit}, serialize) {
 const remaining = rows.filter(row => !cursor || row.id > cursor)
  .sort((a,b) => a.id < b.id ? -1 : a.id === b.id ? 0 : 1);
 const items = remaining.slice(0, limit).map(serialize);
 return {items, total:rows.length, nextCursor:remaining.length > limit ? items.at(-1).id : null};
}

function tally(entities, group) {
 const counts = {};
 for (const entity of entities) {
  const key = group(entity);
  counts[key] = (counts[key] || 0) + 1;
 }
 return counts;
}

export function observe(state, identity, options = {}) {
 const {playerId, worldKey} = identity;
 const {
  view='overview', filter='all', islandId, id, kind, relation, cursor, limit=24, afterTick,
 } = options;
 const player = state.players?.[playerId];
 if (!player) throw Error('The player is no longer in this room.');
 const plan = player.productionPlan || {};
 const match = Object.fromEntries(Object.entries(state.match || {}).map(([key,value]) =>
  key.endsWith('JSON') ? [key.slice(0,-4),parse(value,null)] : [key,value]));
 const faction = player.faction;
 const intel=state.battleIntel;
 const treaty = other => match.factionTreaties?.[[faction,other].sort().join(':')] ?? null;
 const units = values(state,'units').filter(u => u.hp > 0);
 const buildings = values(state,'buildings').filter(b => b.hp > 0);
 const islands = values(state,'islands');
 const ownUnits = units.filter(u => own(u,playerId));
 const destinations = parse(plan.destinations,{});
 const voyages = parse(plan.voyages,{});
 const boardings = parse(plan.boardings,{});
 const rallies = parse(plan.rallies,{});
 const control = plan.controller || 'unknown';
 const header = {worldKey, matchUrl:identity.matchUrl??null, tick:state.tick, playerId, faction, controller:control, fog:state.fog, layout:state.layout};
 const optionsPage = {cursor,limit};
 const scope = item => {
  if (filter === 'own') return own(item,playerId);
  const friendly = !item.hostile && (item.faction ?? item.ownerFaction) === faction;
  if (filter === 'faction') return friendly;
  if (filter === 'other') return !friendly;
  return true;
 };
 const selected = item => (!id || id === item.id) && (!kind || kind === item.kind) &&
  (!islandId || islandId === (item.islandId ?? item.id)) && scope(item);
 const unit = u => ({
  id:u.id, kind:u.kind, faction:u.faction, ownerId:u.ownerId, hostile:u.hostile,
  name:u.name, relation:u.relation,
  islandId:u.islandId || null, ...coordinates(u), y:Math.round(u.y*10)/10,
  hp:u.hp, maxHp:u.maxHp, order:u.order || 'idle', stance:u.stance,
  targetId:u.targetId || null, embarkedOn:u.embarkedOn || null, swimming:u.swimming,
  arenaTeam:readEntry(state.unitTactics,u.id)?.arenaTeam||undefined,
  ...(own(u,playerId) ? {destination:destinations[u.id], voyage:voyages[u.id], boardingShipId:boardings[u.id]} : {}),
 });
 const building = b => ({
  id:b.id, kind:b.kind, faction:b.faction, ownerId:b.ownerId, hostile:b.hostile,
  islandId:b.islandId, ...coordinates(b), y:b.y, hp:b.hp, maxHp:b.maxHp,
  progress:b.progress, buildRemaining:b.buildRemaining, buildState:b.buildState, builders:b.builders,
  productionRate:b.productionRate, queue:parse(b.queue,[]), rally:rallies[b.id],
  ...(['wall','wall-gate'].includes(b.kind)?{wall:{length:b.wallLength,yaw:b.wallYaw,rise:b.wallRise??0,locked:b.gateLocked}}:{}),
  ...(b.coastalBattery?{coastalBattery:true}:{}),
 });
 const island = i => ({
  id:i.id, name:i.name, ownerFaction:i.ownerFaction || null, objective:match.objectives?.includes(i.id) || false,
  custom:!!i.custom, shape:i.terrainShape, ...coordinates(i), radius:i.radius, claimX:i.claimX, claimZ:i.claimZ, harborX:i.harborX, harborZ:i.harborZ,
  capture:i.capture, capturingFaction:i.capturingFaction || null, contested:i.contested,
  resourceProfile:i.resourceProfile || undefined, productionLimit:i.productionLimit,
  terrain:intel?.terrainByIsland?.[i.id],
 });
 if (view === 'units') return {...header, ...page(units.filter(u=>selected(u)&&(!relation||u.relation===relation)),optionsPage,unit)};
 if (view === 'buildings') return {...header, ...page(buildings.filter(selected),optionsPage,building)};
 if (view === 'islands') return {...header, ...page(islands.filter(selected),optionsPage,island)};
 if (view === 'reserves') return {...header,...page(values(state,'deposits').filter(selected),optionsPage,item=>item)};
 if (view === 'events') {
  const events = values(state,'events').filter(e => (afterTick === undefined || e.tick > afterTick) &&
   (!id || [e.id,e.sourceId,e.targetId].includes(id)) && (!kind || kind === e.type));
  events.sort((a,b) => b.tick-a.tick || b.id.localeCompare(a.id));
  return {...header, items:events.slice(0,limit), total:events.length};
 }
 const friendlyBuildings = buildings.filter(b => !b.hostile && b.faction === faction);
 const activeRaids = match.raids?.filter(r => r.active) || [];
 const card = parse(plan.identityCardJSON,null);
 const identityMatch = match.mode==='identity'?{...match.identity,
  card:card?{...card,goal:card.goal??(identity.card?.role===card.role?identity.card.goal:null)}:null}:null;
 const winner = identityMatch?.winner;
 const winnerFactions = match.winnerFactions ?? (match.winnerFaction?[match.winnerFaction]:[]);
 const wonIdentity = winner==='court'?['lord','loyalist'].includes(card?.role):winner===card?.role;
 const result = match.phase!=='finished'?null:player.status==='surrendered'?'surrendered':
  identityMatch?(winner&&card?(wonIdentity?'won':'lost'):'finished'):
  winnerFactions.length?(winnerFactions.includes(faction)?'won':'lost'):'finished';

 return {
  ...header, player:{name:player.name, status:player.status, resources:player.resources,
   queued:plan.queued, population:ownUnits.filter(unit=>!readEntry(state.unitTactics,unit.id)?.arenaId).length, captainReadyTick:player.captainReady,
   councilTech:parse(plan.councilTech,[]), atlantisKnowledge:parse(plan.atlantisKnowledge,null),
   islandRewards:parse(plan.islandRewards,{}),autoLock:plan.autoLock!==false},
  match:{mode:match.mode, phase:match.phase, hostId:match.hostId, winnerFaction:match.winnerFaction,
   reason:match.reason, victoryRule:match.victoryRule, result, ...(identityMatch?{identity:identityMatch}:{}), winnerFactions, factionTreaties:match.factionTreaties,
   remainingOpponents:match.remainingFactions?.filter(id=>id!==faction&&treaty(id)!=='allied'), objectives:match.objectives, holdFaction:match.holdFaction, elapsedSeconds:match.elapsedSeconds,
   factions:match.standings, societies:match.societies,
   holdSeconds:match.holdSeconds, requiredHoldSeconds:match.requiredHoldSeconds, activeRaids, atlantis:match.atlantis},
  ownedUnits:tally(ownUnits,u=>u.kind),
  unitOrders:tally(ownUnits,u=>u.order || 'idle'),
  factionBuildings:tally(friendlyBuildings,b=>b.kind),
  factionIslands:islands.filter(i=>i.ownerFaction===faction).slice(0,limit).map(island),
  objectiveIslands:islands.filter(i=>match.objectives?.includes(i.id)).map(island),
  idleBuilders:ownUnits.filter(u=>['captain','worker'].includes(u.kind)&&!u.order&&!u.embarkedOn&&!u.swimming).slice(0,limit).map(unit),
  trainQueues:friendlyBuildings.filter(b=>parse(b.queue,[]).length).slice(0,limit).map(building),
  visibleOtherUnits:tally(units.filter(u=>u.hostile||u.faction!==faction),u=>u.faction || 'neutral'),
  ...(intel?{visibleContacts:intel.contacts,diplomacy:intel.diplomacy}:{}),
  recentEvents:values(state,'events').filter(e=>e.tick>=state.tick-40)
   .sort((a,b)=>b.tick-a.tick).slice(0,Math.min(limit,8)),
 };
}

export function waitPredicate(condition, playerId) {
 return state => {
  switch (condition.type) {
   case 'tick': return state.tick >= condition.tick;
   case 'control': return readEntry(state.players,playerId)?.productionPlan?.controller === condition.controller;
   case 'phase': return state.match.phase === condition.phase;
   case 'unit': {
    const unit=readEntry(state.units,condition.id);
    if (!unit || unit.ownerId !== playerId) return false;
    if (condition.status === 'idle') return !unit.order;
    if (condition.status === 'embarked') return !!unit.embarkedOn;
    return unit.islandId === condition.islandId && !unit.embarkedOn && !unit.swimming;
   }
   case 'voyage': {
    const voyages=readEntry(state.players,playerId)?.productionPlan?.voyages;
    const voyage=parse(voyages,{})[condition.id];
    return voyage?.islandId === condition.islandId && ['arrived','blocked'].includes(voyage.status);
   }
   case 'building': {
    const building=readEntry(state.buildings,condition.id);
    return building?.ownerId === playerId && building.progress >= 1;
   }
   case 'event':
    return (typeof state.events?.values==='function'?[...state.events.values()]:Object.values(state.events??{})).some(event => event.tick > condition.afterTick &&
     (!condition.event || event.type === condition.event) &&
     (!condition.entityId || [event.targetId,event.sourceId].includes(condition.entityId)));
  }
 };
}
