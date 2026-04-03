import fs from 'node:fs/promises';
import path from 'node:path';

const owner = 'Szii';
const repo = 'musicPlayer';
const assetName = 'backend-openapi.yaml';

const pkgRaw = await fs.readFile('package.json', 'utf8');
const pkg = JSON.parse(pkgRaw);
const tag = pkg.backendApiVersion;

if (!tag) {
  console.error('Missing "backendApiVersion" in package.json');
  process.exit(1);
}

const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;

const releaseResp = await fetch(releaseUrl, {
  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
});

if (!releaseResp.ok) {
  console.error(`Failed to fetch release ${tag}: ${releaseResp.status} ${releaseResp.statusText}`);
  process.exit(1);
}

const release = await releaseResp.json();
const asset = release.assets?.find((a) => a.name === assetName);

if (!asset) {
  console.error(`Asset "${assetName}" not found in release ${tag}`);
  process.exit(1);
}

const downloadResp = await fetch(asset.browser_download_url);

if (!downloadResp.ok) {
  console.error(`Failed to download asset: ${downloadResp.status} ${downloadResp.statusText}`);
  process.exit(1);
}

const content = await downloadResp.text();

await fs.mkdir(path.join('spec'), { recursive: true });
await fs.writeFile(path.join('spec', 'openapi.yaml'), content, 'utf8');

console.log(`Downloaded ${assetName} from ${tag} to spec/openapi.yaml`);