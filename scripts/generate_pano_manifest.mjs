#!/usr/bin/env node
/**
 * Scans 360_casa/ for .jpg files, sorts by trailing number in filename,
 * and writes manifest.json.
 *
 * Usage:  node scripts/generate_pano_manifest.mjs
 */
import { readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panoDir = join(__dirname, '..', '360_casa');

function trailingNumber(filename) {
    const match = filename.replace(/\.\w+$/, '').match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : Infinity;
}

const files = readdirSync(panoDir)
    .filter(f => /\.jpe?g$/i.test(f))
    .sort((a, b) => trailingNumber(a) - trailingNumber(b));

const manifest = { files, count: files.length };
const outPath = join(panoDir, 'manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath} with ${files.length} panoramas.`);
