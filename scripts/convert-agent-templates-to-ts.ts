import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const TEMPLATES_SOURCE = 'apps/web/public/agent-templates';
const TEMPLATES_DEST = 'packages/agents/src/templates';

function convertJsonToTs(jsonPath: string, destPath: string): void {
  const jsonContent = readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(jsonContent);
  
  // Convert to TypeScript with as const for type safety
  const tsContent = `import type { AgentTemplate } from '../../types/agent-template';

export const data = ${JSON.stringify(data, null, 2)} as const satisfies AgentTemplate;
`;
  
  writeFileSync(destPath, tsContent, 'utf-8');
}

// Convert templates (skip index.json)
const templateFiles = readdirSync(TEMPLATES_SOURCE)
  .filter(f => f.endsWith('.json') && f !== 'index.json')
  .sort();

for (const file of templateFiles) {
  const sourcePath = join(TEMPLATES_SOURCE, file);
  const destPath = join(TEMPLATES_DEST, file.replace('.json', '.ts'));
  convertJsonToTs(sourcePath, destPath);
  console.log(`Converted ${file} -> ${file.replace('.json', '.ts')}`);
}

console.log(`\nConverted ${templateFiles.length} agent templates`);

