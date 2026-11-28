import * as z from 'zod';

export const entityId = z.string().min(1).max(100);
const unitIds = z.array(entityId).min(1).max(80).describe('IDs of your own units');
export const coordinate = z.number().gt(-29000).lt(29000);
const point = {x: coordinate, z: coordinate};
export const islandSite = {
 radius:z.number().min(70).max(1500).describe('Island radius in metres. See islandCreation.radii in rts_catalog for this room.'),
 shape:z.enum(['volcanic','twins','crescent','atoll','glacial','faroe']).optional(),
};
const army = {unitIds};
const building = {buildingId: entityId};
const island = {islandId: entityId};
const kind = z.string().regex(/^[a-z][a-z-]{0,39}$/);
const order = (type, shape, description) =>
 z.strictObject({type: z.literal(type).describe(description), ...shape});
const move = (type, description) => order(type, {...army, ...point}, description);

export const orderSchema = z.discriminatedUnion('type', [
 move('move', 'Move a formation to world coordinates on its island or move ships within navigable water.'),
 move('attack-move', 'Advance while engaging encountered enemies.'),
 move('patrol', 'Patrol between current position and target.'),
 order('stop', army, 'Cancel active orders.'),
 order('stance', {...army, stance:z.enum(['hold','defend','passive'])}, 'Set combat stance and clear current orders.'),
 order('attack', {...army, targetId:entityId}, 'Engage a currently visible enemy unit or building.'),
 order('create-island', {...point, ...islandSite, name:z.string().trim().min(1).max(24).optional()},
  'Create a new island for your faction at these world coordinates. Check island creation costs and use rts_island_sites before spending resources.'),
 order('capture', {...army, ...island}, 'Capture the target island using combat units already ashore.'),
 order('train', {...building, kind}, 'Queue a unit at a completed friendly producer. Use the catalog for costs and unit kinds.'),
 order('cancel-train', {...building, orderId:entityId}, 'Cancel your production order and refund its cost.'),
 order('set-rally', {...building, ...point}, 'Set a personal rally point on the same island or in navigable water for a dock.'),
 order('clear-rally', building, 'Clear your personal rally point.'),
 order('build', {unitIds:z.tuple([entityId]), kind, ...point}, 'Place a building with one idle or reassigned land builder. Use rts_build_sites for coordinates.'),
 order('construct', {...army, ...building, availableOnly:z.boolean().optional()}, 'Assign land builders on the same island to an unfinished building.'),
 order('cancel-build', building, 'Cancel your unfinished building for a partial refund.'),
 order('respawn', {buildingId:entityId.optional(), islandId:entityId.optional()}, 'Recover a lost captain from a safe friendly hall or portal.'),
 order('dock-ship', {...army, ...building}, 'Moor your ships at a completed friendly dock.'),
 order('sail-to-island', {...army, ...island, waitForBoarding:z.boolean().optional()}, 'Sail ships to server-selected berths off the target island.'),
 order('embark', {...army,
  shipId:entityId.optional().describe('Specify the friendly ship when boarding by swimming.'),
  approach:z.literal(true).default(true),
 }, 'Board your captain or troops on a friendly ship. When dock berths are full, target a stopped friendly ship with enough free passenger seats in nearby navigable water. With approach enabled, the group can swim to the ship and surface to board. Confirm each unit is embarked before sailing.'),
 order('disembark', {...army, ...island}, 'Land your passengers from selected ships or passenger IDs near the target island.'),
 order('teleport', {...army, ...island, portalId:entityId.optional()}, 'Travel through a portal to another eligible island.'),
 order('sail-to-atlantis', army, 'Sail ships to Atlantis when the landmark is available.'),
 order('land-at-atlantis', army, 'Land at the Atlantis shoreline.'),
 order('march-at-atlantis', {...army, destination:z.enum(['altar','entrance'])}, 'Follow the route inside Atlantis.'),
 order('atlantis-interact', {unitIds:z.tuple([entityId]), action:z.enum(['ladder','chart','disc','altar'])}, 'Use a structure with a nearby captain at Atlantis.'),
 order('auto-lock', {enabled:z.boolean()}, 'Enable or disable nearby coordinated target distribution. Manual orders remain in force.'),
 order('demolish', building, 'Demolish a finished owned building and refund 80 percent of its construction cost.'),
 order('atlantis-storm', point, 'Spend the one-time Atlantis storm reward on an eligible sea position.'),
 order('island-reward', {...island,card:kind}, 'Choose one of the three pending cards shown in the private observation.'),
]);
