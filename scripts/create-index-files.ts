import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ACTORS_DIR = 'packages/engine/src/data/actors';
const ORGS_DIR = 'packages/engine/src/data/organizations';

// Create actors index
const actorFiles = readdirSync(ACTORS_DIR)
  .filter(f => f.endsWith('.ts') && f !== 'index.ts')
  .sort();

const actorImports = actorFiles.map(file => {
  const name = file.replace('.ts', '');
  return `import { data as ${name.replace(/-/g, '_')} } from './${name}';`;
});

const actorExports = actorFiles.map(file => {
  const name = file.replace('.ts', '');
  return `  ${name.replace(/-/g, '_')}`;
}).join(',\n');

const actorsIndexContent = `${actorImports.join('\n')}

export const actors = [
${actorExports}
] as const;
`;

writeFileSync(join(ACTORS_DIR, 'index.ts'), actorsIndexContent, 'utf-8');
console.log(`Created actors index with ${actorFiles.length} actors`);

// Create organizations index
const orgFiles = readdirSync(ORGS_DIR)
  .filter(f => f.endsWith('.ts') && f !== 'index.ts')
  .sort();

const orgImports = orgFiles.map(file => {
  const name = file.replace('.ts', '');
  return `import { data as ${name.replace(/-/g, '_')} } from './${name}';`;
});

const orgExports = orgFiles.map(file => {
  const name = file.replace('.ts', '');
  return `  ${name.replace(/-/g, '_')}`;
}).join(',\n');

const orgsIndexContent = `${orgImports.join('\n')}

export const organizations = [
${orgExports}
] as const;
`;

writeFileSync(join(ORGS_DIR, 'index.ts'), orgsIndexContent, 'utf-8');
console.log(`Created organizations index with ${orgFiles.length} organizations`);

