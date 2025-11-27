import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ACTORS_SOURCE = 'apps/web/public/data/actors';
const ORGS_SOURCE = 'apps/web/public/data/organizations';
const ACTORS_DEST = 'packages/engine/src/data/actors';
const ORGS_DEST = 'packages/engine/src/data/organizations';

function convertJsonToTs(jsonPath: string, destPath: string): void {
  const jsonContent = readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(jsonContent);
  
  const isActor = jsonPath.includes('actors');
  const typeName = isActor ? 'ActorData' : 'Organization';
  
  // Convert to TypeScript with as const for type safety
  const tsContent = `import type { ${typeName} } from '../../types/shared';

export const data = ${JSON.stringify(data, null, 2)} as const satisfies ${typeName};
`;
  
  writeFileSync(destPath, tsContent, 'utf-8');
}

// Convert actors
const actorFiles = readdirSync(ACTORS_SOURCE).filter(f => f.endsWith('.json'));
for (const file of actorFiles) {
  const sourcePath = join(ACTORS_SOURCE, file);
  const destPath = join(ACTORS_DEST, file.replace('.json', '.ts'));
  convertJsonToTs(sourcePath, destPath);
  console.log(`Converted ${file} -> ${file.replace('.json', '.ts')}`);
}

// Convert organizations
const orgFiles = readdirSync(ORGS_SOURCE).filter(f => f.endsWith('.json'));
for (const file of orgFiles) {
  const sourcePath = join(ORGS_SOURCE, file);
  const destPath = join(ORGS_DEST, file.replace('.json', '.ts'));
  convertJsonToTs(sourcePath, destPath);
  console.log(`Converted ${file} -> ${file.replace('.json', '.ts')}`);
}

console.log(`\nConverted ${actorFiles.length} actors and ${orgFiles.length} organizations`);

