/**
 * Verify Agent Separation
 * 
 * Checks that agent code can be separated from Babylon codebase
 * by detecting hardcoded dependencies that would break portability.
 */

import * as fs from 'fs'
import * as path from 'path'

interface SeparationViolation {
  file: string
  line: number
  type: 'prisma_import' | 'babylon_service' | 'babylon_util' | 'direct_db_access'
  code: string
  severity: 'critical' | 'warning'
}

async function verifyAgentSeparation() {
  console.log('🔍 Verifying Agent Code Separation...\n')
  
  const violations: SeparationViolation[] = []
  const agentDir = path.join(process.cwd(), 'src/lib/agents')
  
  // Exclude the a2a-only directory (those are already clean)
  const a2aOnlyDir = path.join(agentDir, 'autonomous/a2a-only')
  
  // Patterns that indicate tight coupling to Babylon
  const patterns = [
    {
      regex: /import\s+.*from\s+['"]@\/lib\/prisma['"]/g,
      type: 'prisma_import' as const,
      severity: 'critical' as const,
      message: 'Direct Prisma import'
    },
    {
      regex: /import\s+.*from\s+['"]@\/lib\/database-service['"]/g,
      type: 'prisma_import' as const,
      severity: 'critical' as const,
      message: 'Database service import'
    },
    {
      regex: /import\s+.*from\s+['"]@\/lib\/services\//g,
      type: 'babylon_service' as const,
      severity: 'critical' as const,
      message: 'Babylon service import'
    },
    {
      regex: /import\s+.*from\s+['"]@\/lib\/snowflake['"]/g,
      type: 'babylon_util' as const,
      severity: 'warning' as const,
      message: 'Babylon utility import (snowflake)'
    },
    {
      regex: /import\s+.*from\s+['"]@\/lib\/prediction-pricing['"]/g,
      type: 'babylon_service' as const,
      severity: 'critical' as const,
      message: 'Babylon pricing service'
    },
    {
      regex: /import\s+.*from\s+['"]@\/lib\/db\/context['"]/g,
      type: 'babylon_util' as const,
      severity: 'critical' as const,
      message: 'Babylon database context'
    },
    {
      regex: /prisma\.(user|post|comment|market|organization|position|trade|chat|message)/g,
      type: 'direct_db_access' as const,
      severity: 'critical' as const,
      message: 'Direct Prisma database access'
    }
  ]
  
  // Scan all TypeScript files in agents directory
  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      // Skip a2a-only directory (those are already clean)
      if (fullPath.startsWith(a2aOnlyDir)) {
        continue
      }
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scanDirectory(fullPath)
        }
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        // Scan TypeScript files
        scanFile(fullPath)
      }
    }
  }
  
  function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const relativePath = path.relative(process.cwd(), filePath)
    
    lines.forEach((line, index) => {
      patterns.forEach(pattern => {
        if (pattern.regex.test(line)) {
          violations.push({
            file: relativePath,
            line: index + 1,
            type: pattern.type,
            code: line.trim(),
            severity: pattern.severity
          })
        }
      })
    })
  }
  
  // Scan the agents directory
  scanDirectory(agentDir)
  
  // Report results
  console.log('━'.repeat(70))
  console.log('📊 SEPARATION AUDIT RESULTS')
  console.log('━'.repeat(70))
  
  if (violations.length === 0) {
    console.log('\n✅ NO VIOLATIONS FOUND')
    console.log('   Agent code is fully portable and can be separated!\n')
    return true
  }
  
  // Group by file
  const violationsByFile = violations.reduce((acc, v) => {
    if (!acc[v.file]) acc[v.file] = []
    acc[v.file].push(v)
    return acc
  }, {} as Record<string, SeparationViolation[]>)
  
  const criticalCount = violations.filter(v => v.severity === 'critical').length
  const warningCount = violations.filter(v => v.severity === 'warning').length
  
  console.log(`\n❌ FOUND ${violations.length} VIOLATIONS`)
  console.log(`   Critical: ${criticalCount}`)
  console.log(`   Warnings: ${warningCount}\n`)
  
  console.log('📋 VIOLATIONS BY FILE:\n')
  
  Object.entries(violationsByFile).forEach(([file, fileViolations]) => {
    const critical = fileViolations.filter(v => v.severity === 'critical').length
    const warnings = fileViolations.filter(v => v.severity === 'warning').length
    
    console.log(`${critical > 0 ? '🔴' : '🟡'} ${file}`)
    console.log(`   ${critical} critical, ${warnings} warnings`)
    
    fileViolations.slice(0, 3).forEach(v => {
      console.log(`   Line ${v.line}: ${v.type}`)
      console.log(`   ${v.code.substring(0, 70)}...`)
    })
    
    if (fileViolations.length > 3) {
      console.log(`   ... and ${fileViolations.length - 3} more`)
    }
    console.log()
  })
  
  console.log('━'.repeat(70))
  console.log('🔧 RECOMMENDED ACTIONS')
  console.log('━'.repeat(70))
  console.log('\n1. Use A2A-only services in: autonomous/a2a-only/')
  console.log('2. Replace Prisma queries with A2A methods')
  console.log('3. Remove Babylon service imports')
  console.log('4. Use Eliza utilities instead of Babylon utils')
  console.log('\n📖 See: 🚨_SEPARATION_AUDIT.md for complete refactoring guide')
  console.log('📖 See: autonomous/a2a-only/README.md for portable services\n')
  
  return criticalCount === 0
}

// Run verification
verifyAgentSeparation().then(passed => {
  process.exit(passed ? 0 : 1)
}).catch(error => {
  console.error('Verification failed:', error)
  process.exit(1)
})

