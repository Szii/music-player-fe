import fs from 'node:fs/promises';
import path from 'node:path';

const owner = process.env.BACKEND_REPO_OWNER;
const repo = process.env.BACKEND_REPO_NAME;
const assetName = process.env.BACKEND_ASSET_NAME || 'backend-openapi.yaml';
const token = process.env.BACKEND_REPO_TOKEN;

if (!owner || !repo || !token) {
  console.error(
    'Missing BACKEND_REPO_OWNER, BACKEND_REPO_NAME, or BACKEND_REPO_TOKEN'
  );
  process.exit(1);
}

const pkgRaw = await fs.readFile('package.json', 'utf8');
const pkg = JSON.parse(pkgRaw);
const tag = pkg.backendApiVersion;

if (!tag) {
  console.error('Missing "backendApiVersion" in package.json');
  process.exit(1);
}

const apiHeaders = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;

const releaseResp = await fetch(releaseUrl, {
  headers: apiHeaders
});

if (!releaseResp.ok) {
  console.error(
    `Failed to fetch release ${tag}: ${releaseResp.status} ${releaseResp.statusText}`
  );
  process.exit(1);
}

const release = await releaseResp.json();
const asset = release.assets?.find((a) => a.name === assetName);

if (!asset) {
  console.error(`Asset "${assetName}" not found in release ${tag}`);
  process.exit(1);
}

const downloadResp = await fetch(asset.url, {
  headers: {
    ...apiHeaders,
    Accept: 'application/octet-stream'
  },
  redirect: 'follow'
});

if (!downloadResp.ok) {
  console.error(
    `Failed to download asset: ${downloadResp.status} ${downloadResp.statusText}`
  );
  process.exit(1);
}

const content = await downloadResp.text();

await fs.mkdir('spec', { recursive: true });
await fs.writeFile(path.join('spec', 'openapi.yaml'), content, 'utf8');

console.log(`Downloaded ${assetName} from ${tag} to spec/openapi.yaml`);