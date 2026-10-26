// SPDX-License-Identifier: GPL-2.0-or-later

// Street scenery that reacts to what is done to it (after FreeSynd's trees, street furniture and lights). Props do
// not block movement or shots; they take damage of the kinds they are weak to and change when they fail:
//   tree         only fire, beams and blasts hurt it; once destroyed it burns for ten seconds and spreads to its neighbours
//   streetlight  any weapon brings it down
//   bin          any weapon dents it
//   billboard    fire, beams and blasts; it burns like a tree
//   barrels      a stack of drums; any weapon dents them and fire sets them alight (they burn like a tree)
//   skylight     a glass pyramid on a roof; any weapon breaks it
//   vent         a dome on a roof; nothing hurts it
//   shrub        a low bush or planting; fire, beams and blasts hurt it, and it burns like a tree
//   antenna      a dark dome on a stalk, for roofs; nothing hurts it
//   wreck        a burnt-out car left at the kerb; nothing hurts it any more (after FreeSynd's damaged large armored car)
// Pure rules; drawing lives in the app.
export const FIRE_SECONDS = 10;
export const FIRE_SPREAD_RADIUS = 1.6;
export const FIRE_IGNITES_UNIT_RADIUS = 1.3;
export const FIRE_DAMAGE_PER_SECOND = 3;

export const PROP_KINDS = Object.freeze({
  tree: { health: 24, hurtBy: ["burn", "beam", "explosion"], flammable: true },
  streetlight: { health: 12, hurtBy: ["bullet", "burn", "beam", "explosion"], flammable: false },
  bin: { health: 10, hurtBy: ["bullet", "burn", "beam", "explosion"], flammable: false },
  billboard: { health: 40, hurtBy: ["burn", "beam", "explosion"], flammable: true },
  wreck: { health: 1, hurtBy: [], flammable: false },
  barrels: { health: 18, hurtBy: ["bullet", "burn", "beam", "explosion"], flammable: true },
  skylight: { health: 6, hurtBy: ["bullet", "burn", "beam", "explosion"], flammable: false },
  vent: { health: 1, hurtBy: [], flammable: false },
  shrub: { health: 10, hurtBy: ["burn", "beam", "explosion"], flammable: true },
  antenna: { health: 1, hurtBy: [], flammable: false },
});

export function newProp(definition) {
  const kind = PROP_KINDS[definition.kind];
  return {
    id: definition.id,
    kind: definition.kind,
    position: { x: definition.position.x, y: definition.position.y },
    facing: definition.facing ?? "east-west", // which way a wreck lies: along the street's east-west or north-south run
    health: kind.health,
    state: "standing", // standing, burning, destroyed
    burnLeft: 0,
  };
}

/**
 * Hurt a prop with damage of a kind. A flammable prop that fails starts to burn; any other prop that fails is
 * simply destroyed. Returns an event, or null if nothing changed (wrong kind of damage, or already destroyed).
 */
export function damageProp(prop, amount, damageType) {
  if (prop.state === "destroyed") return null;
  const kind = PROP_KINDS[prop.kind];
  if (!kind.hurtBy.includes(damageType)) return null;
  // Fire sets a flammable prop alight at once; the rest of the damage types wear it down.
  if (damageType === "burn" && kind.flammable && prop.state === "standing") {
    prop.state = "burning";
    prop.burnLeft = FIRE_SECONDS;
    return { type: "prop", propId: prop.id, state: "burning" };
  }
  prop.health = Math.max(0, prop.health - amount);
  if (prop.health > 0) return null;
  if (kind.flammable) {
    if (prop.state === "burning") return null;
    prop.state = "burning";
    prop.burnLeft = FIRE_SECONDS;
    return { type: "prop", propId: prop.id, state: "burning" };
  }
  prop.state = "destroyed";
  return { type: "prop", propId: prop.id, state: "destroyed" };
}

// Props within a distance of a point, for blasts.
export function propsNear(props, at, radius) {
  return props.filter((prop) => Math.hypot(prop.position.x - at.x, prop.position.y - at.y) <= radius);
}

// Props close to the line of a shot from `from` along `direction` (a unit vector) for `range` tiles.
export function propsAlong(props, from, direction, range, width = 0.55) {
  return props.filter((prop) => {
    const dx = prop.position.x - from.x;
    const dy = prop.position.y - from.y;
    const along = dx * direction.x + dy * direction.y;
    if (along < 0 || along > range) return false;
    return Math.abs(dx * direction.y - dy * direction.x) <= width;
  });
}

/**
 * Burning goes on for ten seconds, then the prop is a charred wreck. Every second a burning prop sets alight flammable
 * props within FIRE_SPREAD_RADIUS, and people standing next to it catch fire. Returns prop events and the ids of
 * units that were set alight.
 */
export function advanceProps(props, units, deltaSeconds) {
  const events = [];
  const ignited = [];
  for (const prop of props) {
    if (prop.state !== "burning") continue;
    const before = Math.floor(prop.burnLeft);
    prop.burnLeft = Math.max(0, prop.burnLeft - deltaSeconds);
    if (prop.burnLeft < 1e-9) prop.burnLeft = 0;
    if (Math.floor(prop.burnLeft) !== before || prop.burnLeft === 0) {
      for (const other of props) {
        if (other.state !== "standing" || !PROP_KINDS[other.kind].flammable) continue;
        if (Math.hypot(other.position.x - prop.position.x, other.position.y - prop.position.y) > FIRE_SPREAD_RADIUS) continue;
        const spread = damageProp(other, 0, "burn");
        if (spread) events.push(spread);
      }
      for (const unit of units) {
        if (unit.disabled || unit.burning) continue;
        if (Math.hypot(unit.position.x - prop.position.x, unit.position.y - prop.position.y) <= FIRE_IGNITES_UNIT_RADIUS) {
          unit.burning = { left: 3, dps: FIRE_DAMAGE_PER_SECOND, by: null, carry: 0 };
          ignited.push(unit.id);
        }
      }
    }
    if (prop.burnLeft === 0) {
      prop.state = "destroyed";
      events.push({ type: "prop", propId: prop.id, state: "destroyed" });
    }
  }
  return { events, ignited };
}
