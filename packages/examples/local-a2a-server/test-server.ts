/**
 * Quick test script for the local A2A server
 */

const A2A_URL = 'http://localhost:3001';

async function test() {
  console.log('🧪 Testing Local A2A Server\n');

  // Test 1: Health check
  console.log('1️⃣ Health Check');
  const health = await fetch(`${A2A_URL}/health`);
  const healthData = await health.json();
  console.log('   ✅', JSON.stringify(healthData));

  // Test 2: Agent card
  console.log('\n2️⃣ Agent Card');
  const card = await fetch(`${A2A_URL}/.well-known/agent-card`);
  const cardData = await card.json();
  console.log('   ✅ Skills:', cardData.skills?.length);

  // Test 3: Get markets
  console.log('\n3️⃣ Get Markets');
  const marketsRes = await fetch(`${A2A_URL}/api/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': 'agent-31337-12345',
      'x-agent-address': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'x-agent-token-id': '12345',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getMarkets',
      params: {},
      id: 1,
    }),
  });
  const marketsData = await marketsRes.json();
  console.log('   Result:', JSON.stringify(marketsData, null, 2));

  // Test 4: Register
  console.log('\n4️⃣ Register Agent');
  const registerRes = await fetch(`${A2A_URL}/api/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': 'agent-31337-12345',
      'x-agent-address': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'x-agent-token-id': '12345',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'register',
      params: {
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        tokenId: 12345,
        displayName: 'Test Agent',
      },
      id: 2,
    }),
  });
  const registerData = await registerRes.json();
  console.log('   Result:', JSON.stringify(registerData, null, 2));

  // Test 5: Get balance
  console.log('\n5️⃣ Get Balance');
  const balanceRes = await fetch(`${A2A_URL}/api/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': 'agent-31337-12345',
      'x-agent-address': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'x-agent-token-id': '12345',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getBalance',
      params: {},
      id: 3,
    }),
  });
  const balanceData = await balanceRes.json();
  console.log('   Result:', JSON.stringify(balanceData, null, 2));

  // Test 6: Create post
  console.log('\n6️⃣ Create Post');
  const postRes = await fetch(`${A2A_URL}/api/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': 'agent-31337-12345',
      'x-agent-address': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'x-agent-token-id': '12345',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'createPost',
      params: { content: 'Hello from test script!' },
      id: 4,
    }),
  });
  const postData = await postRes.json();
  console.log('   Result:', JSON.stringify(postData, null, 2));

  // Test 7: Get feed
  console.log('\n7️⃣ Get Feed');
  const feedRes = await fetch(`${A2A_URL}/api/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': 'agent-31337-12345',
      'x-agent-address': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'x-agent-token-id': '12345',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getFeed',
      params: { limit: 5 },
      id: 5,
    }),
  });
  const feedData = await feedRes.json();
  console.log('   Result:', JSON.stringify(feedData, null, 2));

  // Test 8: Buy shares
  console.log('\n8️⃣ Buy Shares');
  const buyRes = await fetch(`${A2A_URL}/api/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': 'agent-31337-12345',
      'x-agent-address': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'x-agent-token-id': '12345',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'buyShares',
      params: { marketId: 'market-btc-100k', outcome: 'YES', amount: 10 },
      id: 6,
    }),
  });
  const buyData = await buyRes.json();
  console.log('   Result:', JSON.stringify(buyData, null, 2));

  console.log('\n✅ All tests completed!');
}

test().catch(console.error);
