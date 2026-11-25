import test from 'node:test';
import assert from 'node:assert/strict';
import {observe} from '../src/state.mjs';

test('identity observations include only the acting card and a personal terminal result',()=>{
 const self='npc-home-china',rival='npc-home-red';
 const observation={
  tick:53,players:{
   [self]:{faction:'china',productionPlan:{identityCardJSON:JSON.stringify({role:'loyalist',goal:'Keep the lord alive'})}},
   [rival]:{faction:'red',productionPlan:{identityCardJSON:JSON.stringify({role:'renegade',goal:'Eliminate both sides'})}},
  },
  match:{mode:'identity',phase:'active',identityJSON:JSON.stringify({revealed:{'npc-home-ghost':'lord'},winner:''})},
 };
 const active=observe(observation,{playerId:self}).match;
 assert.deepEqual(active.identity.card,{role:'loyalist',goal:'Keep the lord alive'});
 assert.equal(active.identity.revealed[rival],undefined);
 assert.equal(active.result,null);
 observation.match.phase='finished';
 observation.match.identityJSON=JSON.stringify({revealed:{'npc-home-ghost':'lord'},winner:'court'});
 assert.equal(observe(observation,{playerId:self}).match.result,'won');
 assert.equal(observe(observation,{playerId:rival}).match.result,'lost');
});
