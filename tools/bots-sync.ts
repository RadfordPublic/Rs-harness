#!/usr/bin/env bun
// Copies bot folders between this repo's bots/ (tracked in git) and
// rs-sdk/bots/ (where the SDK, CLI and MCP server expect them).
//
//   bun tools/bots-sync.ts save      # rs-sdk/bots/*  -> bots/*
//   bun tools/bots-sync.ts restore   # bots/*         -> rs-sdk/bots/*
//
// bot.env (account password) is copied too, but .gitignore keeps it out of git.
import { cp, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const harnessBots = join(root, 'bots');
const sdkBots = join(root, 'rs-sdk', 'bots');

const mode = process.argv[2];
if (mode !== 'save' && mode !== 'restore') {
    console.error('Usage: bun tools/bots-sync.ts <save|restore>');
    process.exit(1);
}
if (!existsSync(sdkBots)) {
    console.error('rs-sdk/ is missing. Run the setup script first.');
    process.exit(1);
}

const [from, to] = mode === 'save' ? [sdkBots, harnessBots] : [harnessBots, sdkBots];
const entries = existsSync(from) ? await readdir(from, { withFileTypes: true }) : [];
const bots = entries.filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'));

for (const bot of bots) {
    await cp(join(from, bot.name), join(to, bot.name), {
        recursive: true,
        filter: src => !src.includes('node_modules'),
    });
    console.log(`${mode === 'save' ? 'saved' : 'restored'} ${bot.name}`);
}
if (bots.length === 0) console.log('No bots to copy.');
