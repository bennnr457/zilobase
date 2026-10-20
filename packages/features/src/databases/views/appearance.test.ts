import assert from "node:assert/strict";
import { test } from "node:test";
import { getDatabaseTitleSource } from "./appearance";

test("titles follow the selected view and the ordered default view, never source count", () => {
  const projects = { id: "projects", position: 0, name: "Projects" };
  const roadmap = { id: "roadmap", position: 1, name: "Roadmap" };
  const views = [
    { id: "board", dataSourceId: "roadmap", position: 1 },
    { id: "table", dataSourceId: "projects", position: 0 },
  ];
  assert.equal(getDatabaseTitleSource([projects], [views[1]!]), projects);
  assert.equal(getDatabaseTitleSource([roadmap, projects], views), projects);
  assert.equal(getDatabaseTitleSource([roadmap, projects], views, "board"), roadmap);
  assert.equal(getDatabaseTitleSource([roadmap, projects], views, "deleted-view"), projects);
  assert.equal(getDatabaseTitleSource([projects], views, "board"), projects);
  assert.equal(getDatabaseTitleSource([], []), null);
});
