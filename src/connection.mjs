import {Client} from '@colyseus/sdk';

export class SeaOfFoxConnection {
 #room;
 #opening;
 #waiters = new Set();
 #pending = new Map();

 constructor({server, token}) {
  this.server = server;
  this.token = token;
 }

 async request(path) {
  if (!this.server || !this.token) throw Error('Set SEA_OF_FOX_RTS_URL and SEA_OF_FOX_RTS_TOKEN in your MCP configuration.');
  const base = new URL(this.server);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (!(base.protocol === 'https:' || (local && base.protocol === 'http:')) || base.username || base.password) {
   throw Error('Use an HTTPS RTS server URL. HTTP is supported on localhost for development.');
  }
  const response = await fetch(new URL(path, base), {
   headers: {authorization: 'Bearer ' + this.token},
   signal: AbortSignal.timeout(8000),
   redirect: 'error',
  });
  if (!response.ok) {
   const body = await response.json().catch(() => ({}));
   throw Error(body.error || `RTS server returned HTTP ${response.status}`);
  }
  return response.json();
 }

 catalog() {
  return this.request('/api/rts/mcp/catalog');
 }

 async #open() {
  const identity = await this.request('/api/rts/mcp/session');
  if (identity.protocol !== 1) throw Error('Incompatible Sea of Fox RTS MCP protocol. Update the MCP or game server.');
  const sdk = new Client(this.server);
  sdk.auth.token = this.token;
  const room = await sdk.joinOrCreate('archipelago', {worldKey: identity.worldKey});
  room.reconnection.enabled = false;
  this.identity = identity;
  this.#room = room;
  room.onMessage('ack', ack => this.#pending.get(ack.id)?.(ack));
  const disconnect = () => {
   if (this.#room !== room) return;
   this.#room = undefined;
   for (const settle of this.#pending.values()) settle(null);
   for (const wake of this.#waiters) wake();
  };
  room.onLeave(disconnect);
  room.onDrop(disconnect);
  room.onStateChange(() => { for (const wake of this.#waiters) wake(); });
  try {
   const ready = await this.#wait(room, state => state?.players?.has(identity.playerId), 6000);
   if (!ready.matched) throw Error('Timed out waiting for the RTS player state.');
   return room;
  } catch (error) {
   await room.leave().catch(() => {});
   throw error;
  }
 }

 async room() {
  if (this.#opening) return this.#opening;
  if (this.#room) return this.#room;
  this.#opening = this.#open().finally(() => { this.#opening = undefined; });
  return this.#opening;
 }

 async snapshot() {
  const room = await this.room();
  return room.state.toJSON();
 }

 async wait(predicate, timeout, signal) {
  const room = await this.room();
  return this.#wait(room, predicate, timeout, signal);
 }

 #wait(room, predicate, timeout, signal) {
  return new Promise((resolve, reject) => {
   const finish = (error, result) => {
    this.#waiters.delete(check);
    clearTimeout(timer);
    signal?.removeEventListener('abort', check);
    if (error) reject(error);
    else resolve(result);
   };
   const check = () => {
    if (signal?.aborted) return finish(Error('Request cancelled'));
    if (this.#room !== room) return finish(Error('Disconnected from RTS. Call rts_observe to reconnect.'));
    try {
     if (predicate(room.state)) finish(null, {matched:true, state:room.state.toJSON()});
    } catch (error) {
     finish(error);
    }
   };
   const timer = setTimeout(() => finish(null, {matched:false, state:room.state?.toJSON()}), timeout);
   this.#waiters.add(check);
   signal?.addEventListener('abort', check, {once:true});
   check();
  });
 }

 async command(command, id) {
  const room = await this.room();
  return new Promise(resolve => {
   const settle = ack => {
    clearTimeout(timer);
    this.#pending.delete(id);
    resolve(ack || {id, ok:false, uncertain:true, error:'Acknowledgement missing. Observe before retrying with the same batch ID.'});
   };
   const timer = setTimeout(() => settle(null), 4500);
   this.#pending.set(id, settle);
   try {
    room.send('command', {id, command});
   } catch {
    settle(null);
   }
  });
 }

 async close() {
  const room = await this.#opening?.catch(() => null) || this.#room;
  if (room) await room.leave().catch(() => {});
 }
}
