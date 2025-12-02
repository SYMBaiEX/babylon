/**
 * Export rubrics to JSON for Python training to consume
 * 
 * Run with: bun run scripts/export-rubrics.ts
 */
import { RUBRICS, PRIORITY_METRICS, DEFAULT_RUBRIC, DEFAULT_PRIORITY_METRICS } from '../src/rubrics';
import * as fs from 'fs';
import * as path from 'path';

const outputPath = path.join(__dirname, '../config/rubrics.json');

// Get unique archetypes (filter out aliases)
const uniqueArchetypes = Object.keys(RUBRICS).filter(k => {
  // Keep if it's not an alias (aliases don't have hyphens but point to same value as hyphenated version)
  const normalized = k.replace(/-/g, '');
  return k === normalized || RUBRICS[k] !== RUBRICS[normalized];
});

const exportData = {
  rubrics: RUBRICS,
  priorityMetrics: PRIORITY_METRICS,
  defaults: {
    rubric: DEFAULT_RUBRIC,
    priorityMetrics: DEFAULT_PRIORITY_METRICS,
  },
  availableArchetypes: [
    'trader',
    'social-butterfly', 
    'scammer',
    'degen',
    'researcher',
    'information-trader',
    'goody-twoshoes',
    'ass-kisser',
    'perps-trader',
    'super-predictor',
    'infosec',
    'liar',
  ],
};

// Ensure config directory exists
const configDir = path.dirname(outputPath);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
console.log(`✓ Exported rubrics to ${outputPath}`);
console.log(`  - ${Object.keys(RUBRICS).length} rubric entries`);
console.log(`  - ${exportData.availableArchetypes.length} unique archetypes`);


