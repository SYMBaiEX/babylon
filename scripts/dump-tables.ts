#!/usr/bin/env bun
/**
 * Fast Table Dump - Downloads all data from source DB to local JSON files
 * 
 * Usage:
 *   bun run scripts/dump-tables.ts --tables=User,Referral,...
 * 
 * Output:
 *   ./migration-data/{TableName}.json
 */

import postgres from 'postgres';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const SOURCE_URL = process.env.SOURCE_DIRECT_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
const OUTPUT_DIR = './migration-data';

const args = process.argv.slice(2);
const tablesArg = args.find((a) => a.startsWith('--tables='));
const TABLES = tablesArg ? tablesArg.replace('--tables=', '').split(',') : [];
const BATCH_SIZE = 10000;

function log(msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function dumpTable(db: postgres.Sql, table: string): Promise<number> {
  const start = Date.now();
  
  // Get columns
  const colsResult = await db`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = ${table} ORDER BY ordinal_position
  `;
  
  if (colsResult.length === 0) {
    log(`⚠ Table ${table} not found`);
    return 0;
  }
  
  const columns = colsResult.map((r) => r.column_name as string);
  const pk = columns.includes('id') ? 'id' : columns[0];
  const colList = columns.map((c) => `"${c}"`).join(', ');
  
  // Get count
  const countResult = await db.unsafe(`SELECT COUNT(*)::int as c FROM "${table}"`);
  const totalCount = countResult[0].c as number;
  
  log(`${table}: ${totalCount} rows, ${columns.length} columns`);
  
  if (totalCount === 0) {
    writeFileSync(`${OUTPUT_DIR}/${table}.json`, JSON.stringify({ columns, pk, rows: [] }));
    return 0;
  }
  
  // Stream all data
  const allRows: Record<string, unknown>[] = [];
  let offset = 0;
  
  while (offset < totalCount) {
    const batchStart = Date.now();
    const rows = await db.unsafe(
      `SELECT ${colList} FROM "${table}" ORDER BY "${pk}" LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );
    
    allRows.push(...rows);
    offset += rows.length;
    
    const batchMs = Date.now() - batchStart;
    const pct = Math.round((offset / totalCount) * 100);
    const rate = Math.round((rows.length / (batchMs / 1000)));
    log(`  ${table}: ${pct}% (${offset}/${totalCount}) - ${batchMs}ms, ${rate}/s`);
    
    if (rows.length === 0) break;
  }
  
  // Write to file
  const output = { columns, pk, rows: allRows };
  const filePath = `${OUTPUT_DIR}/${table}.json`;
  writeFileSync(filePath, JSON.stringify(output));
  
  const fileSize = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(1);
  const totalMs = Date.now() - start;
  log(`✓ ${table}: ${allRows.length} rows saved to ${filePath} (${fileSize}MB) in ${(totalMs / 1000).toFixed(1)}s`);
  
  return allRows.length;
}

async function main(): Promise<void> {
  console.log('\n');
  log('═══════════════════════════════════════════════════════════');
  log('TABLE DUMP - Download Source Data');
  log('═══════════════════════════════════════════════════════════');

  if (!SOURCE_URL) {
    log('ERROR: SOURCE_DATABASE_URL required');
    process.exit(1);
  }

  if (TABLES.length === 0) {
    log('ERROR: Specify tables with --tables=Table1,Table2,...');
    process.exit(1);
  }

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  log(`Tables: ${TABLES.join(', ')}`);
  log(`Output: ${OUTPUT_DIR}/`);
  log(`Batch size: ${BATCH_SIZE}`);

  // Connect with high connection limit for parallel reads
  const db = postgres(SOURCE_URL, { 
    max: 4,
    ssl: SOURCE_URL.includes('localhost') ? false : 'require',
    idle_timeout: 120,
  });

  await db`SELECT 1`;
  log('✓ Connected to source database\n');

  const overallStart = Date.now();
  let totalRows = 0;

  // Dump tables in parallel (2 at a time)
  for (let i = 0; i < TABLES.length; i += 2) {
    const batch = TABLES.slice(i, i + 2);
    const results = await Promise.all(batch.map((t) => dumpTable(db, t)));
    totalRows += results.reduce((a, b) => a + b, 0);
  }

  await db.end();

  const totalMs = Date.now() - overallStart;
  log('\n═══════════════════════════════════════════════════════════');
  log(`DONE: ${totalRows} total rows dumped in ${(totalMs / 1000).toFixed(1)}s`);
  log(`Files saved to: ${OUTPUT_DIR}/`);
  log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Dump failed:', err);
  process.exit(1);
});

