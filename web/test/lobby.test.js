// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PLAYERS, MIN_PLAYERS, WaitingGame, splitSquad } from "../server/lobby.js";

test("a squad is shared out evenly, and each player keeps their agents together", () => {
  const four = ["a", "b", "c", "d"];
  assert.deepEqual(splitSquad(four, 1), [four]);
  assert.deepEqual(splitSquad(four, 2), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(splitSquad(four, 3), [["a", "b"], ["c"], ["d"]]);
  assert.deepEqual(splitSquad(four, 4), [["a"], ["b"], ["c"], ["d"]]);
  assert.deepEqual(splitSquad(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
  const crowded = splitSquad(["a", "b"], 4).filter((share) => share.length > 0);
  assert.deepEqual(crowded, [["a"], ["b"]], "more players than agents: some have none");
  for (let players = 1; players <= 4; players += 1) {
    assert.deepEqual(splitSquad(four, players).flat(), four, `${players} players: everyone has someone and nobody has two`);
  }
});

const player = (id, name = id) => ({ id, name, account: Number(id.slice(1)) });

test("a waiting game takes players up to its capacity, the first is the host, and the host passes on when they leave", () => {
  const game = new WaitingGame({ id: "g1", host: player("p1", "Anna"), mission: "m", capacity: 3, now: 0 });
  assert.equal(game.host, "p1");
  assert.equal(game.join(player("p2", "Ben")), true);
  assert.equal(game.join(player("p2", "Ben")), false, "not twice");
  assert.equal(game.full, false);
  assert.equal(game.join(player("p3", "Cleo")), true);
  assert.equal(game.full, true);
  assert.equal(game.join(player("p4", "Dev")), false, "full");
  assert.equal(game.leave("p1"), false);
  assert.equal(game.host, "p2", "the host passes to the next");
  assert.equal(game.leave("p2"), false);
  assert.equal(game.leave("p3"), true, "empty");
  assert.equal(game.host, null);
});

test("the capacity is kept between two and four players", () => {
  assert.equal(new WaitingGame({ id: "g", host: player("p1"), mission: "m", capacity: 1, now: 0 }).capacity, MIN_PLAYERS);
  assert.equal(new WaitingGame({ id: "g", host: player("p1"), mission: "m", capacity: 9, now: 0 }).capacity, MAX_PLAYERS);
});

test("the host may begin once there are two and everyone else is ready", () => {
  const game = new WaitingGame({ id: "g", host: player("p1"), mission: "m", capacity: 4, now: 0 });
  assert.equal(game.canBegin(), false, "alone");
  game.join(player("p2"));
  assert.equal(game.canBegin(), false, "the other is not ready");
  game.setReady("p2", true);
  assert.equal(game.canBegin(), true);
  game.join(player("p3"));
  assert.equal(game.canBegin(), false, "a newcomer has to be ready too");
  game.setReady("p3", true);
  game.setReady("p2", false);
  assert.equal(game.canBegin(), false);
  game.leave("p2");
  assert.equal(game.canBegin(), true);
  assert.deepEqual(game.summary().players, [{ name: "p1", ready: true }, { name: "p3", ready: true }], "the host always counts as ready");
});
