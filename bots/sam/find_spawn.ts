#!/usr/bin/env bun
// Looks up where NPCs, locs or ground items spawn, straight from the server's map files.
//   bun bots/sam/find_spawn.ts npc father_urhney
//   bun bots/sam/find_spawn.ts loc hopper
//   bun bots/sam/find_spawn.ts obj ghostskull
// The name is a regex matched against the debug names in server/content/pack/<kind>.pack.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const [kind, pattern] = process.argv.slice(2);
if (!['npc', 'loc', 'obj'].includes(kind) || !pattern) {
    console.error('Usage: bun bots/sam/find_spawn.ts <npc|loc|obj> <name regex>');
    process.exit(1);
}
const content = join(import.meta.dir, '..', '..', 'server', 'content');
const re = new RegExp(pattern, 'i');
const ids = new Map<number, string>();
for (const line of readFileSync(join(content, 'pack', `${kind}.pack`), 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^(\d+)=(.+)$/);
    if (m && re.test(m[2])) ids.set(Number(m[1]), m[2]);
}
if (!ids.size) { console.log(`no ${kind} matches ${re}`); process.exit(0); }

const section = { npc: 'NPC', loc: 'LOC', obj: 'OBJ' }[kind];
const maps = join(content, 'maps');
for (const file of readdirSync(maps).filter(f => /^m\d+_\d+\.jm2$/.test(f))) {
    const [, mx, mz] = file.match(/^m(\d+)_(\d+)/)!.map(Number);
    let inSection = false;
    for (const line of readFileSync(join(maps, file), 'utf-8').split(/\r?\n/)) {
        if (line.startsWith('====')) { inSection = line.includes(`==== ${section} ====`); continue; }
        if (!inSection) continue;
        // "level lx lz: id" (locs add " shape angle" after the id)
        const m = line.match(/^(\d+) (\d+) (\d+): (\d+)/);
        if (!m || !ids.has(Number(m[4]))) continue;
        const [lvl, lx, lz, id] = m.slice(1).map(Number);
        console.log(`${ids.get(id)} (${id}): (${mx * 64 + lx}, ${mz * 64 + lz}) L${lvl}  [${file}]`);
    }
}
