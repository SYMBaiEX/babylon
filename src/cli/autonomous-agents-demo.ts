#!/usr/bin/env bun

/**
 * Autonomous Agents Demo
 *
 * Demonstrates autonomous agents connecting to Babylon game via A2A protocol.
 * Run this alongside the realtime-daemon to see agents analyze markets and coordinate.
 *
 * Usage:
 *   bun run agents              (start 3 demo agents)
 *   bun run agents --count 5    (start 5 agents)
 */

import { AutonomousAgent, type AgentConfig } from '../agents/AutonomousAgent';
import { AgentRegistry } from '../agents/AgentRegistry';

interface CLIOptions {
  count?: number;
  endpoint?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    count: 3,
    endpoint: 'ws://localhost:8080'
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      options.count = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--endpoint' && args[i + 1]) {
      options.endpoint = args[i + 1];
      i++;
    }
  }

  return options;
}

// Define agent personalities
const agentTemplates: Omit<AgentConfig, 'a2aEndpoint'>[] = [
  {
    name: 'Alice (Momentum Trader)',
    personality: 'Aggressive momentum trader who looks for rapidly changing markets and high volume',
    strategies: ['momentum', 'volume-analysis'],
    riskTolerance: 0.8,
    analysisDepth: 'quick'
  },
  {
    name: 'Bob (Fundamental Analyst)',
    personality: 'Conservative fundamental analyst who thoroughly researches questions',
    strategies: ['fundamental', 'research'],
    riskTolerance: 0.3,
    analysisDepth: 'deep'
  },
  {
    name: 'Charlie (Contrarian)',
    personality: 'Contrarian who looks for mispriced markets and crowd psychology errors',
    strategies: ['contrarian', 'arbitrage'],
    riskTolerance: 0.6,
    analysisDepth: 'moderate'
  },
  {
    name: 'Diana (News Trader)',
    personality: 'News-driven trader who reacts quickly to events and information',
    strategies: ['event-driven', 'news'],
    riskTolerance: 0.7,
    analysisDepth: 'quick'
  },
  {
    name: 'Eve (Quant)',
    personality: 'Quantitative analyst using statistical models and data analysis',
    strategies: ['quantitative', 'statistical'],
    riskTolerance: 0.5,
    analysisDepth: 'deep'
  }
];

async function main() {
  const options = parseArgs();

  console.log('\n🤖 AUTONOMOUS AGENTS DEMO');
  console.log('========================\n');
  console.log(`Connecting ${options.count} agents to ${options.endpoint}\n`);

  // Create agent registry
  const registry = new AgentRegistry();

  registry.on('agentRegistered', (data) => {
    console.log(`📋 Agent registered: ${data.agentId}`);
  });

  registry.on('performanceUpdated', (data) => {
    console.log(`📈 Performance updated for ${data.agentId}`);
  });

  // Create agents
  const agents: AutonomousAgent[] = [];
  for (let i = 0; i < options.count!; i++) {
    const template = agentTemplates[i % agentTemplates.length];
    const config: AgentConfig = {
      ...template,
      a2aEndpoint: options.endpoint!
    };

    const agent = new AutonomousAgent(config);
    agents.push(agent);

    // Setup event listeners
    agent.on('connected', (data) => {
      console.log(`✅ ${config.name} connected`);
      console.log(`   Agent ID: ${data.agentId}`);
    });

    agent.on('marketUpdate', (data) => {
      console.log(`📊 ${config.name} received market update`);
      console.log(`   Active questions: ${data.questions.length}`);
    });

    agent.on('analysisComplete', (analysis) => {
      console.log(`🔍 ${config.name} completed analysis`);
      console.log(`   Question ID: ${analysis.questionId}`);
      console.log(`   Prediction: ${analysis.prediction ? 'YES' : 'NO'}`);
      console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
      console.log(`   Reasoning: ${analysis.reasoning.substring(0, 100)}...`);
    });

    agent.on('coalitionJoined', (invite) => {
      console.log(`🤝 ${config.name} joined coalition: ${invite.name}`);
    });

    agent.on('error', (error) => {
      console.error(`❌ ${config.name} error:`, error.message);
    });
  }

  // Connect all agents
  try {
    console.log('Connecting agents...\n');
    await Promise.all(agents.map(agent => agent.connect()));
    console.log('\n✅ All agents connected successfully!\n');

    // Register agents with registry
    console.log('Registering agents with registry...\n');
    for (const agent of agents) {
      registry.register(agent);
    }

    // Display registry stats
    const stats = registry.getStats();
    console.log('📊 Registry Statistics:');
    console.log(`   Total Agents: ${stats.totalAgents}`);
    console.log(`   Active Agents: ${stats.activeAgents}`);
    console.log(`   Strategy Distribution:`);
    for (const [strategy, count] of stats.strategies.entries()) {
      console.log(`     - ${strategy}: ${count} agents`);
    }
    console.log('');
  } catch (error) {
    console.error('❌ Failed to connect agents:', error);
    process.exit(1);
  }

  // After 10 seconds, demonstrate agent discovery and coalition formation
  setTimeout(async () => {
    console.log('\n🔍 Demonstrating agent discovery...\n');

    if (agents.length >= 2) {
      const leader = agents[0];
      const leaderStatus = leader.getStatus();

      // Find coalition partners using registry
      console.log(`${leaderStatus.name} searching for momentum traders...`);
      const partners = registry.findByStrategy('momentum');
      console.log(`Found ${partners.length} momentum traders:\n`);
      for (const partner of partners) {
        console.log(`  - ${partner.profile.agentId}`);
        console.log(`    Reputation: ${partner.profile.reputation}`);
        console.log(`    Predictions: ${partner.performance.totalPredictions}`);
        console.log('');
      }

      // Form coalition
      console.log('\n🤝 Forming coalition...\n');
      const coalitionId = await leader.proposeCoalition(
        'Momentum Coalition',
        'question-1',
        2,
        5
      );

      if (coalitionId) {
        console.log(`✅ Coalition created: ${coalitionId}`);
      }
    }
  }, 10000);

  // Status report every 30 seconds
  setInterval(() => {
    console.log('\n📊 AGENT STATUS REPORT');
    console.log('====================\n');

    for (const agent of agents) {
      const status = agent.getStatus();
      console.log(`${status.name}:`);
      console.log(`  Connected: ${status.connected ? '✅' : '❌'}`);
      console.log(`  Questions Tracked: ${status.questionsTracked}`);
      console.log(`  Analyses Complete: ${status.analysesComplete}`);
      console.log(`  Coalitions: ${status.coalitions}`);
      console.log('');
    }
  }, 30000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n📊 Final Agent Statistics:');
    console.log('=========================\n');

    for (const agent of agents) {
      const status = agent.getStatus();
      const analyses = agent.getAllAnalyses();

      console.log(`${status.name}:`);
      console.log(`  Total Analyses: ${analyses.length}`);
      console.log(`  Average Confidence: ${
        analyses.length > 0
          ? (analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length * 100).toFixed(1)
          : 'N/A'
      }%`);
      console.log(`  Coalitions Joined: ${status.coalitions}`);
      console.log('');
    }

    console.log('Disconnecting agents...');
    await Promise.all(agents.map(agent => agent.disconnect()));
    console.log('✅ All agents disconnected\n');

    process.exit(0);
  });

  // Keep process alive
  console.log('Agents are now running. Press Ctrl+C to stop.\n');
  console.log('Monitoring agent activity...\n');
  await new Promise(() => {});
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

export { main };
