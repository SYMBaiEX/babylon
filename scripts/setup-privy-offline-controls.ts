import { generateP256KeyPair, PrivyClient } from '@privy-io/node';

type PolicyOwnerMode = 'signer' | 'none';

type CliOptions = {
  appId: string;
  appSecret: string;
  namePrefix: string;
  policyOwner: PolicyOwnerMode;
  json: boolean;
};

function printUsage(): void {
  console.log(`
Setup Privy offline controls (authorization key + signer + policy)

Usage:
  bun run scripts/setup-privy-offline-controls.ts [options]

Options:
  --app-id <value>          Privy app ID (fallback: PRIVY_APP_ID or NEXT_PUBLIC_PRIVY_APP_ID)
  --app-secret <value>      Privy app secret (fallback: PRIVY_APP_SECRET)
  --name-prefix <value>     Prefix for created resource names (default: babylon-offline)
  --policy-owner <mode>     "none" or "signer" (default: none)
  --json                    Output machine-readable JSON only
  -h, --help                Show this help

What this creates:
  1. A new P-256 authorization key pair (private key returned once)
  2. A signer (Privy key quorum with threshold 1)
  3. An Ethereum policy:
     - DENY exportPrivateKey
     - ALLOW all other methods

Output:
  - PRIVY_AUTHORIZATION_PRIVATE_KEY
  - PRIVY_OFFLINE_SIGNER_ID
  - PRIVY_OFFLINE_POLICY_ID
`);
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRequiredValue(
  args: string[],
  name: '--app-id' | '--app-secret' | '--name-prefix' | '--policy-owner'
): string | undefined {
  const index = args.findIndex((arg) => arg === name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value after ${name}`);
  }
  return value.trim();
}

function hasFlag(args: string[], flag: '-h' | '--help' | '--json'): boolean {
  return args.includes(flag);
}

function getPolicyOwnerMode(raw: string | undefined): PolicyOwnerMode {
  if (!raw) return 'none';
  if (raw === 'none' || raw === 'signer') return raw;
  throw new Error(
    `Invalid --policy-owner value "${raw}". Expected "none" or "signer".`
  );
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  if (hasFlag(args, '-h') || hasFlag(args, '--help')) {
    printUsage();
    process.exit(0);
  }

  const appId =
    readRequiredValue(args, '--app-id') ??
    readEnv('PRIVY_APP_ID') ??
    readEnv('NEXT_PUBLIC_PRIVY_APP_ID');
  const appSecret =
    readRequiredValue(args, '--app-secret') ?? readEnv('PRIVY_APP_SECRET');
  const namePrefix =
    readRequiredValue(args, '--name-prefix') ?? 'babylon-offline';
  const policyOwner = getPolicyOwnerMode(
    readRequiredValue(args, '--policy-owner')
  );
  const json = hasFlag(args, '--json');

  const missing: string[] = [];
  if (!appId) missing.push('app ID (--app-id or PRIVY_APP_ID)');
  if (!appSecret) {
    missing.push('app secret (--app-secret or PRIVY_APP_SECRET)');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required inputs: ${missing.join(', ')}`);
  }

  return {
    appId: appId!,
    appSecret: appSecret!,
    namePrefix,
    policyOwner,
    json,
  };
}

function timestampTag(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const options = parseOptions();
  const privy = new PrivyClient({
    appId: options.appId,
    appSecret: options.appSecret,
  });

  const keyPair = await generateP256KeyPair();

  const signer = await privy.keyQuorums().create({
    display_name: `${options.namePrefix}-signer-${timestampTag()}`,
    authorization_threshold: 1,
    public_keys: [keyPair.publicKey],
  });

  const policy = await privy.policies().create({
    version: '1.0',
    name: `${options.namePrefix}-policy-${timestampTag()}`,
    chain_type: 'ethereum',
    ...(options.policyOwner === 'signer' ? { owner_id: signer.id } : {}),
    rules: [
      {
        name: 'Deny private key exports',
        method: 'exportPrivateKey',
        conditions: [],
        action: 'DENY',
      },
      {
        name: 'Allow all other actions',
        method: '*',
        conditions: [],
        action: 'ALLOW',
      },
    ],
  });

  const result = {
    appId: options.appId,
    signerId: signer.id,
    policyId: policy.id,
    authorizationPrivateKey: keyPair.privateKey,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Privy offline controls created successfully.\n');
  console.log('Copy these env vars:\n');
  console.log(`PRIVY_APP_ID=${result.appId}`);
  console.log(
    `PRIVY_AUTHORIZATION_PRIVATE_KEY='${result.authorizationPrivateKey}'`
  );
  console.log(`PRIVY_OFFLINE_SIGNER_ID=${result.signerId}`);
  console.log(`PRIVY_OFFLINE_POLICY_ID=${result.policyId}`);
  console.log('\nNotes:');
  console.log(
    '- The private key is shown once; store it in secret manager immediately.'
  );
  console.log(
    "- Policy created: DENY 'exportPrivateKey', ALLOW '*' for all other methods."
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to setup Privy offline controls: ${message}`);
  process.exit(1);
});
