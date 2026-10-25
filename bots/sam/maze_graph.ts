#!/usr/bin/env bun
// Offline map of Melzar's Maze: splits each floor into regions (all maze doors closed) and lists the
// ladders and doors touching each region, so the route can be planned instead of guessed.
//   bun bots/sam/maze_graph.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { findLongPath, getDoorAt, isTileWalkable } from '../../sdk/pathfinding';

const content = join(import.meta.dir, '..', '..', 'server', 'content');
const names = new Map<number, string>();
for (const line of readFileSync(join(content, 'pack', 'loc.pack'), 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^(\d+)=(.+)$/);
    if (m) names.set(Number(m[1]), m[2]);
}

type Loc = { name: string; x: number; z: number; level: number };
const locs: Loc[] = [];
for (const [file, mx, mz] of [['m45_50.jm2', 45, 50], ['m45_150.jm2', 45, 150]] as const) {
    let inLoc = false;
    for (const line of readFileSync(join(content, 'maps', file), 'utf-8').split(/\r?\n/)) {
        if (line.startsWith('====')) { inLoc = line.includes('LOC'); continue; }
        const m = inLoc && line.match(/^(\d+) (\d+) (\d+): (\d+)/);
        if (!m) continue;
        const [lvl, lx, lz, id] = m.slice(1).map(Number);
        const x = mx * 64 + lx, z = mz * 64 + lz, name = names.get(id) ?? String(id);
        const inMaze = x >= 2920 && x <= 2942 && ((z >= 3238 && z <= 3260) || (z >= 9636 && z <= 9660));
        if (inMaze && /ladder|door|funexit|chest/i.test(name)) locs.push({ name, x, z, level: lvl });
    }
}

const doors = locs.filter(l => /door|funexit/i.test(l.name)).map(l => ({ ...l, info: getDoorAt(l.level, l.x, l.z) }));
const blocked = doors.flatMap(d => d.info ? [d.info] : []);
const reach = (level: number, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const path = findLongPath(level, a.x, a.z, b.x, b.z, 500, blocked);
    const end = path[path.length - 1] ?? a;
    return Math.max(Math.abs(end.x - b.x), Math.abs(end.z - b.z)) <= 1;
};
const near = (l: Loc) => [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz]) => ({ x: l.x + dx, z: l.z + dz }))
    .filter(t => isTileWalkable(l.level, t.x, t.z));

// Points of interest: one entry per loc side tile.
type Pt = { label: string; level: number; x: number; z: number };
const pts: Pt[] = [];
for (const l of locs) for (const t of near(l)) pts.push({ label: `${l.name}@${l.x},${l.z}`, level: l.level, ...t });

// Union-find regions per level.
const parent = pts.map((_, i) => i);
const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    if (pts[i].level !== pts[j].level || find(i) === find(j)) continue;
    if (Math.abs(pts[i].z - pts[j].z) > 40) continue;   // cellar vs surface share level 0
    if (reach(pts[i].level, pts[i], pts[j])) parent[find(j)] = find(i);
}
const regions = new Map<number, Set<string>>();
pts.forEach((p, i) => { const r = find(i); if (!regions.has(r)) regions.set(r, new Set()); regions.get(r)!.add(`L${p.level} ${p.label}`); });
let n = 0;
for (const set of regions.values()) console.log(`region ${++n}: ${[...set].sort().join(' | ')}`);
