/**
 * Verify Babylon's Agent0 Registration
 *
 * Checks if Babylon is properly registered on Agent0 and viewable in subgraph
 */

import { SDK } from 'agent0-sdk';
import { db } from '@/db';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function verifyAgent0Registration() {
  console.log('🔍 Verifying Babylon Agent0 registration...\n');

  // Get registration from database
  const config = await db.gameConfig.findUnique({
    where: { key: 'agent0_registration' },
  });

  type Agent0Config = {
    agentId?: string;
    tokenId?: number;
    chainId?: number;
    agentURI?: string;
    registeredAt?: string;
  };

  const configValue = (config?.value ?? null) as Agent0Config | null;

  if (!configValue?.agentId) {
    console.log('❌ Babylon is not registered on Agent0');
    console.log('\n💡 To register, run:');
    console.log('   bun run scripts/register-babylon-agent0.ts');
    return;
  }

  const agentId = configValue.agentId;
  const tokenId = configValue.tokenId || 0;

  console.log('📋 Database Record:');
  console.log(`   Agent ID: ${agentId}`);
  console.log(`   Token ID: ${tokenId}`);
  // Agent0 operates on Ethereum Sepolia (11155111), not Base Sepolia (84532)
  console.log(`   Chain ID: ${configValue.chainId || 11155111}`);
  if (configValue.agentURI) {
    console.log(`   Agent URI: ${configValue.agentURI}`);
  }
  if (configValue.registeredAt) {
    console.log(`   Registered: ${configValue.registeredAt}`);
  }

  // Initialize SDK for read-only queries
  // Agent0 operates on Ethereum Sepolia, not Base Sepolia
  console.log('\n🌐 Querying Agent0 subgraph...');
  const rpcUrl =
    process.env.AGENT0_RPC_URL ||
    process.env.ETHEREUM_SEPOLIA_RPC_URL ||
    'https://ethereum-sepolia-rpc.publicnode.com';
  const sdk = new SDK({
    chainId: 11155111, // Ethereum Sepolia (Agent0 is on Ethereum, not Base!)
    rpcUrl,
    // No signer needed for read-only
  });

  try {
    const agent = await sdk.getAgent(agentId);

    if (!agent) {
      console.log('⏳ Agent not yet indexed in subgraph');
      console.log('   This is normal for new registrations');
      console.log('   Wait 1-5 minutes and try again');
      return;
    }

    console.log('✅ Found in subgraph!');
    console.log('\n📊 Agent Details:');
    console.log(`   Name: ${agent.name}`);
    console.log(`   Description: ${agent.description}`);
    console.log(`   Active: ${agent.active}`);
    console.log(`   Image: ${agent.image || 'None'}`);

    console.log('\n🔗 Endpoints:');
    console.log(`   A2A: ${agent.a2a ? 'Enabled' : 'Disabled'}`);
    console.log(`   MCP: ${agent.mcp ? 'Enabled' : 'Disabled'}`);
    console.log(`   ENS: ${agent.ens || 'Not set'}`);
    console.log(`   DID: ${agent.did || 'Not set'}`);
    console.log(`   Wallet: ${agent.walletAddress || 'Not set'}`);

    console.log('\n🎯 Capabilities:');
    console.log(`   A2A Skills: ${agent.a2aSkills?.length || 0}`);
    if (agent.a2aSkills && agent.a2aSkills.length > 0) {
      agent.a2aSkills.forEach((skill) => console.log(`     - ${skill}`));
    }
    console.log(`   MCP Tools: ${agent.mcpTools?.length || 0}`);
    console.log(`   MCP Prompts: ${agent.mcpPrompts?.length || 0}`);
    console.log(`   MCP Resources: ${agent.mcpResources?.length || 0}`);

    console.log('\n💰 Trust & Support:');
    console.log(
      `   Supported Trusts: ${agent.supportedTrusts?.join(', ') || 'None'}`
    );
    console.log(`   x402 Support: ${agent.x402support}`);

    console.log('\n👥 Ownership:');
    console.log(`   Owners: ${agent.owners?.join(', ') || 'Unknown'}`);
    console.log(`   Operators: ${agent.operators?.join(', ') || 'None'}`);

    // Test discovery
    console.log('\n🔍 Testing Discovery...');
    console.log(
      '   Searching for agents with prediction-market-trader skill...'
    );

    const results = await sdk.searchAgents({
      a2a: true,
      a2aSkills: ['prediction-market-trader'],
      active: true,
    });

    const babylonFound = results.items.find((a) => a.agentId === agentId);

    if (babylonFound) {
      console.log('✅ Babylon is discoverable via Agent0!');
      console.log('   Found via skill search: prediction-market-trader');
    } else {
      console.log('⏳ Not yet discoverable via search');
      console.log('   This may take a few minutes after registration');
    }

    console.log('\n🎊 Verification Complete!');
    console.log('\n🌐 Links:');
    console.log(
      `   Agent0 Explorer: https://testnet.agent0.network/agents/${agentId}`
    );
    if (configValue.chainId) {
      console.log(
        `   Base Sepolia Scan: https://sepolia.basescan.org/token/${configValue.chainId}/instance/${tokenId}`
      );
    }
    console.log(`   Agent Card: ${BASE_URL}/.well-known/agent-card.json`);
  } catch (error) {
    console.error('\n❌ Error verifying registration:', error);

    if (error instanceof Error) {
      console.error('Error:', error.message);
    }

    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check if subgraph is synced');
    console.log('   2. Wait a few minutes for indexing');
    console.log('   3. Verify RPC URL is correct');
    console.log('   4. Check agent ID format: chainId:tokenId');

    throw error;
  }
}

if (import.meta.main) {
  verifyAgent0Registration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { verifyAgent0Registration };
