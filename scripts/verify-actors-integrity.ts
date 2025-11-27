import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ActorData } from '@babylon/shared';
import type {
  ActorFileRef,
  ActorsIndexFile,
  OrganizationFileRef,
} from '../tests/types/test-types';

const dataDir = join(process.cwd(), 'public', 'data');
const actorsJsonPath = join(dataDir, 'actors.json');

if (!existsSync(actorsJsonPath)) {
  console.error('actors.json not found');
  process.exit(1);
}

const indexData: ActorsIndexFile = JSON.parse(
  readFileSync(actorsJsonPath, 'utf-8')
);

const orgIds = new Set(
  indexData.organizations.map((o: OrganizationFileRef) => o.id)
);
console.log(`Loaded ${orgIds.size} organizations.`);

for (const ref of indexData.actors as ActorFileRef[]) {
  const actorPath = join(dataDir, ref.file);
  if (!existsSync(actorPath)) {
    console.error(`Actor file missing: ${ref.file}`);
    continue;
  }
  const actor: ActorData = JSON.parse(readFileSync(actorPath, 'utf-8'));
  if (actor.affiliations) {
    for (const aff of actor.affiliations) {
      if (!orgIds.has(aff)) {
        console.error(`Invalid affiliation in ${actor.id}: ${aff}`);
      }
    }
  }
}
