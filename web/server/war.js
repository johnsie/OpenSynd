// SPDX-License-Identifier: GPL-2.0-or-later

// The always-open company war. It builds an operation around an existing map
// without changing that map's content: player-company slots and control zones
// live only in the generated mission sent over the wire.
import { createTileGrid, isWalkable } from "../src/engine.js";
import { maxHealth } from "../src/simulation.js";
import { Room, STEPS_PER_SECOND } from "./rooms.js";

export const WAR_COMPANIES_PER_COALITION = 4;
export const WAR_OPERATIVES_PER_COMPANY = 4;
export const WAR_CAPTURE_SECONDS = 10;
export const WAR_SCORE_SECONDS = 10;
export const WAR_RESPAWN_SECONDS = 15;
export const WAR_CONTRACT_COOLDOWN_SECONDS = 60;
export const WAR_COALITIONS = Object.freeze([
  { id: "cyan", name: "Cyan Coalition", side: "team" },
  { id: "ember", name: "Ember Coalition", side: "opposition" },
]);

const clone = (value) => JSON.parse(JSON.stringify(value));
const keyOf = (coalition, slot, operative) => `war-${coalition}-${slot + 1}-${operative + 1}`;

function nearestWalkable(grid, wanted, used = new Set()) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  for (let radius = 0; radius < Math.max(width, height); radius += 1) {
    for (let y = wanted.y - radius; y <= wanted.y + radius; y += 1) {
      for (let x = wanted.x - radius; x <= wanted.x + radius; x += 1) {
        if (Math.max(Math.abs(x - wanted.x), Math.abs(y - wanted.y)) !== radius) continue;
        const key = `${x},${y}`;
        if (isWalkable(grid, x, y) && !used.has(key)) {
          used.add(key);
          return { x, y };
        }
      }
    }
  }
  throw new Error("The war map has no walkable tile.");
}

/** Generate player slots and three simultaneous control objectives on an existing operation map. */
export function warMission(content, missionPath = content.pack.missions[0]) {
  const base = clone(content.read(missionPath));
  const map = content.read(base.map);
  const grid = createTileGrid(map);
  const used = new Set();
  const { width, height } = map.dimensions;
  const template = base.team[0];
  if (!template) throw new Error("The war needs an operation with an operative placement.");
  const starts = [
    { x: Math.round(width * 0.12), y: Math.round(height * 0.5) },
    { x: Math.round(width * 0.88), y: Math.round(height * 0.5) },
  ];
  const team = [];
  for (const [coalitionIndex, coalition] of WAR_COALITIONS.entries()) {
    for (let slot = 0; slot < WAR_COMPANIES_PER_COALITION; slot += 1) {
      for (let operative = 0; operative < WAR_OPERATIVES_PER_COMPANY; operative += 1) {
        const position = nearestWalkable(grid, {
          x: starts[coalitionIndex].x + (coalitionIndex === 0 ? slot : -slot),
          y: starts[coalitionIndex].y + operative - 2,
        }, used);
        team.push({
          ...clone(template),
          id: keyOf(coalition.id, slot, operative),
          position,
          side: coalition.side,
          warSide: coalition.id,
          playerUnit: true,
          warReserve: true,
          company: null,
        });
      }
    }
  }
  const pointTargets = [
    { x: Math.round(width * 0.3), y: Math.round(height * 0.3) },
    { x: Math.round(width * 0.5), y: Math.round(height * 0.5) },
    { x: Math.round(width * 0.7), y: Math.round(height * 0.7) },
  ];
  const points = pointTargets.map((position, index) => ({
    id: `war-point-${index + 1}`,
    name: ["North Relay", "Central Exchange", "South Relay"][index],
    position: nearestWalkable(grid, position),
    width: 3,
    height: 3,
  }));
  const civilian = base.bystanders?.[0] ?? {
    unit: [...content.units.entries()].find(([, definition]) => definition.role === "civilian")?.[0],
    equipment: [],
  };
  if (!civilian.unit) throw new Error("The war needs a civilian definition for its mission givers.");
  const contractDetails = [
    { giver: "Mara Venn", title: "Secure the North Relay", reward: 25 },
    { giver: "Ivo Chen", title: "Take the Central Exchange", reward: 35 },
    { giver: "Sable Okafor", title: "Control the South Relay", reward: 25 },
  ];
  const missionGivers = points.map((point, index) => ({
    ...clone(civilian),
    id: `war-giver-${index + 1}`,
    position: nearestWalkable(grid, { x: point.position.x + 4, y: point.position.y + 1 }, used),
    equipment: [],
    patrol: undefined,
    script: undefined,
    missionGiver: {
      contractId: `war-contract-${index + 1}`,
      name: contractDetails[index].giver,
      title: contractDetails[index].title,
      pointId: point.id,
      reward: contractDetails[index].reward,
    },
  }));
  return {
    missionPath,
    points,
    contracts: missionGivers.map((giver) => ({ ...giver.missionGiver })),
    mission: {
      ...base,
      id: "persistent-company-war",
      name: "Persistent Company War",
      title: "Two coalitions. One living battlefield.",
      briefing: "Capture and hold all three relays. Every company and objective shares this battlefield; the war never times out.",
      team,
      opponents: [],
      bystanders: [...(base.bystanders ?? []), ...missionGivers],
      objectives: [],
      sequence: false,
      zones: [
        ...(base.zones ?? []),
        ...points.map((point) => ({ id: point.id, kind: "hold", position: point.position, width: point.width, height: point.height, prop: "beacon" })),
      ],
    },
  };
}

const inside = (unit, point) =>
  !unit.disabled && !unit.warReserve && !unit.inVehicle &&
  unit.position.x >= point.position.x && unit.position.x < point.position.x + point.width &&
  unit.position.y >= point.position.y && unit.position.y < point.position.y + point.height;

export class WarRoom extends Room {
  constructor({ id = "company-war", content, mission, persisted = {}, save = () => {} }) {
    const generated = warMission(content, mission);
    super({
      id,
      content,
      mission: generated.missionPath,
      missionData: generated.mission,
      variant: "war",
      seed: 0x51adf00d,
      options: { decidesOutcome: false },
    });
    this.persistent = true;
    this.save = save;
    this.slots = new Map();
    this.accountSlots = new Map();
    this.respawns = new Map();
    this.giverRespawns = new Map();
    this.scoreCarry = 0;
    this.world.war = {
      coalitions: WAR_COALITIONS.map((coalition) => ({
        id: coalition.id,
        name: coalition.name,
        score: Number(persisted.scores?.[coalition.id] ?? 0),
      })),
      points: generated.points.map((point) => ({
        ...point,
        owner: WAR_COALITIONS.some((coalition) => coalition.id === persisted.points?.[point.id]) ? persisted.points[point.id] : null,
        claiming: null,
        progress: 0,
      })),
      contracts: generated.contracts.map((contract) => ({
        ...contract,
        assignments: Object.fromEntries(WAR_COALITIONS.map((coalition) => {
          const kept = persisted.contracts?.[contract.contractId]?.[coalition.id];
          return [coalition.id, { status: kept?.status === "active" ? "active" : "available", availableAt: 0 }];
        })),
      })),
      captureSeconds: WAR_CAPTURE_SECONDS,
      revision: 0,
    };
    this.warRevision = this.world.war.revision;
    for (const coalition of WAR_COALITIONS) {
      for (let slot = 0; slot < WAR_COMPANIES_PER_COALITION; slot += 1) {
        const ids = Array.from({ length: WAR_OPERATIVES_PER_COMPANY }, (_, operative) => keyOf(coalition.id, slot, operative));
        this.slots.set(`${coalition.id}:${slot}`, { coalition: coalition.id, slot, ids, player: null });
        for (const id of ids) {
          const unit = this.world.units.find((candidate) => candidate.id === id);
          unit.disabled = true;
          unit.health = 0;
        }
      }
    }
  }

  population(coalition) {
    return [...this.slots.values()].filter((slot) => slot.coalition === coalition && slot.player).length;
  }

  claimCompany(playerId, account, preferred = null, companyName = playerId) {
    const available = (coalition) => [...this.slots.values()].find((slot) => slot.coalition === coalition && !slot.player);
    const ordered = [...WAR_COALITIONS]
      .sort((a, b) => this.population(a.id) - this.population(b.id))
      .map((coalition) => coalition.id);
    if (preferred && available(preferred) && this.population(preferred) <= this.population(ordered[0]) + 1) {
      ordered.splice(ordered.indexOf(preferred), 1);
      ordered.unshift(preferred);
    }
    const slot = ordered.map(available).find(Boolean);
    if (!slot) return null;
    slot.player = playerId;
    if (account !== null) this.accountSlots.set(account, slot);
    for (const id of slot.ids) this.activate(this.world.units.find((unit) => unit.id === id), companyName);
    return slot;
  }

  activate(unit, company) {
    unit.company = company;
    unit.warReserve = false;
    unit.disabled = false;
    unit.health = maxHealth(unit);
    unit.position = { ...unit.initialPosition };
    unit.path = [];
    unit.pending = [];
    unit.targetId = null;
    unit.activeSlot = null;
    unit.equipment = unit.initialEquipment.map((item) => ({ ...item }));
  }

  addPlayer(id, options) {
    const coalition = this.world.units.find((unit) => options.unitIds.includes(unit.id))?.warSide ?? null;
    return super.addPlayer(id, { ...options, coalition });
  }

  removePlayer(id) {
    const player = this.players.get(id);
    super.removePlayer(id);
    const slot = [...this.slots.values()].find((candidate) => candidate.player === id);
    if (!slot) return;
    slot.player = null;
    if (player?.account !== null) this.accountSlots.delete(player.account);
    for (const unitId of slot.ids) {
      const unit = this.world.units.find((candidate) => candidate.id === unitId);
      unit.warReserve = true;
      unit.company = null;
      unit.disabled = true;
      unit.health = 0;
      unit.path = [];
      this.respawns.delete(unitId);
    }
  }

  tick() {
    super.tick();
    const delta = 1 / STEPS_PER_SECOND;
    for (const unit of this.world.units.filter((candidate) => candidate.playerUnit && !candidate.warReserve)) {
      if (unit.disabled && !this.respawns.has(unit.id)) this.respawns.set(unit.id, this.world.elapsed + WAR_RESPAWN_SECONDS);
      if (unit.disabled && this.world.elapsed >= this.respawns.get(unit.id)) {
        this.activate(unit, unit.company);
        this.respawns.delete(unit.id);
      }
    }
    for (const giver of this.world.units.filter((candidate) => candidate.missionGiver)) {
      if (giver.disabled && !this.giverRespawns.has(giver.id)) this.giverRespawns.set(giver.id, this.world.elapsed + WAR_RESPAWN_SECONDS);
      if (giver.disabled && this.world.elapsed >= this.giverRespawns.get(giver.id)) {
        giver.disabled = false;
        giver.health = maxHealth(giver);
        giver.position = { ...giver.initialPosition };
        giver.path = [];
        giver.targetId = null;
        this.giverRespawns.delete(giver.id);
      }
    }
    for (const point of this.world.war.points) {
      const present = WAR_COALITIONS.filter((coalition) => this.world.units.some((unit) => unit.warSide === coalition.id && inside(unit, point)));
      if (present.length !== 1 || present[0].id === point.owner) {
        point.claiming = null;
        point.progress = 0;
        continue;
      }
      const claimant = present[0].id;
      if (point.claiming !== claimant) {
        point.claiming = claimant;
        point.progress = 0;
      }
      point.progress += delta;
      if (point.progress >= WAR_CAPTURE_SECONDS) {
        point.owner = claimant;
        point.claiming = null;
        point.progress = 0;
        this.persist();
      }
    }
    this.scoreCarry += delta;
    if (this.scoreCarry >= WAR_SCORE_SECONDS) {
      this.scoreCarry -= WAR_SCORE_SECONDS;
      for (const coalition of this.world.war.coalitions) {
        coalition.score += this.world.war.points.filter((point) => point.owner === coalition.id).length;
      }
      this.persist();
    }
    for (const contract of this.world.war.contracts) {
      for (const coalition of WAR_COALITIONS) {
        const assignment = contract.assignments[coalition.id];
        if (assignment.status === "cooldown" && this.world.elapsed >= assignment.availableAt) {
          assignment.status = "available";
          assignment.availableAt = 0;
          this.world.war.revision += 1;
        }
        const point = this.world.war.points.find((candidate) => candidate.id === contract.pointId);
        if (assignment.status !== "active" || point?.owner !== coalition.id) continue;
        const score = this.world.war.coalitions.find((candidate) => candidate.id === coalition.id);
        score.score += contract.reward;
        assignment.status = "cooldown";
        assignment.availableAt = this.world.elapsed + WAR_CONTRACT_COOLDOWN_SECONDS;
        assignment.completed = (assignment.completed ?? 0) + 1;
        this.world.war.revision += 1;
      }
    }
    if (this.world.war.revision !== this.warRevision) {
      this.warRevision = this.world.war.revision;
      this.persist();
    }
  }

  persist() {
    this.save({
      scores: Object.fromEntries(this.world.war.coalitions.map((coalition) => [coalition.id, coalition.score])),
      points: Object.fromEntries(this.world.war.points.map((point) => [point.id, point.owner])),
      contracts: Object.fromEntries(this.world.war.contracts.map((contract) => [
        contract.contractId,
        Object.fromEntries(WAR_COALITIONS.map((coalition) => [coalition.id, {
          status: contract.assignments[coalition.id].status === "active" ? "active" : "available",
        }])),
      ])),
    });
  }
}
