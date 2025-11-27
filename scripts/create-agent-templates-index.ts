import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const TEMPLATES_DIR = 'packages/agents/src/templates';

// Create templates index
const templateFiles = readdirSync(TEMPLATES_DIR)
  .filter(f => f.endsWith('.ts') && f !== 'index.ts')
  .sort();

const templateImports = templateFiles.map(file => {
  const name = file.replace('.ts', '');
  return `import { data as ${name.replace(/-/g, '_')} } from './${name}';`;
});

const templateExports = templateFiles.map(file => {
  const name = file.replace('.ts', '');
  return `  ${name.replace(/-/g, '_')}`;
}).join(',\n');

const templatesIndexContent = `${templateImports.join('\n')}

export const templates = [
${templateExports}
] as const;

export const templateIds = [
${templateFiles.map(f => `  '${f.replace('.ts', '')}'`).join(',\n')}
] as const;
`;

writeFileSync(join(TEMPLATES_DIR, 'index.ts'), templatesIndexContent, 'utf-8');
console.log(`Created templates index with ${templateFiles.length} templates`);

