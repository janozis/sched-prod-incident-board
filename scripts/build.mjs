// Builds the board into dist/ and stamps the git sha into the page (meta[name=build] and the footer).
// Cloudflare Pages sets CF_PAGES_COMMIT_SHA; locally the sha comes from git.
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const sha = process.env.CF_PAGES_COMMIT_SHA || execSync('git rev-parse HEAD').toString().trim();

await rm('dist', { recursive: true, force: true });
await cp('app', 'dist', { recursive: true });

const html = await readFile('dist/index.html', 'utf8');
await writeFile('dist/index.html', html.replaceAll('__BUILD_SHA__', sha));

console.log(`built dist/ at ${sha}`);
