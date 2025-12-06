Technical Plan for a Permissionless AI Game on Phala TEE (H200 GPU)
Overview and Objectives

This plan describes a permissionless AI game infrastructure running on a Phala Network Trusted Execution Environment (TEE) equipped with a H200 GPU. The system will host an AI-driven game (Node.js/Next.js from the BabylonSocial/babylon repo) in a secure enclave, interfacing with smart contracts for funding, state tracking, and governance. Key goals include:

Trustless Execution in TEE: Run the game server and AI model training inside a Phala Confidential VM (Intel TDX + NVIDIA H200 CC) so code and data are encrypted in use
phala.com
phala.com
. This ensures game state, AI model weights, and user data remain private and tamper-proof even to infrastructure operators.

Wallet-Only Authentication: All actions (deploying the game, paying for compute, updating state) use cryptographic signatures from blockchain wallets – no API keys or centralized credentials. The TEE itself will derive its own wallet keys internally for on-chain interactions
github.com
.

On-Chain Coordination: Use Solidity smart contracts (deployable via Hardhat/Forge) as the source of truth for game status and to manage funds, staking, and governance. The contracts will hold operational funds, authorize game state updates, handle staking and profit distribution, and implement a DAO for fee-setting and a security council for key management.

Encrypted Off-Chain Storage: Persist all game state and AI data off-chain (e.g. IPFS/Filecoin) in encrypted form, with only the TEE holding decryption keys. Public game data (like AI training datasets) will be stored openly but content-addressed and linked on-chain for transparency.

Autonomous Operations: Automate infrastructure provisioning and maintenance via on-chain logic and TEE capabilities. The design guarantees at least one game instance is always running or can be immediately restarted without manual intervention. A daily “cronjob” in the TEE will run training loops for AI agents. Key management uses secure rotation (potentially via MPC or multi-TEE cooperation) to minimize trust in any single party.

Deliverables include an architecture diagram, detailed design of the TEE integration, smart contracts, storage scheme, key rotation approach, operational sequence, and analysis of trade-offs and costs. The target developer stack is Node.js/Next.js for the game backend and Solidity (Hardhat/Forge) for the contracts.

System Architecture

System architecture diagram: a Phala TEE node runs the AI game server and training loop, interfacing with Ethereum smart contracts for funds, state, and governance, and with IPFS/Filecoin for encrypted storage. Players interact via web UI, and a Security Council (DAO multi-sig) can rotate encryption keys.

The architecture consists of the following key components:

Phala TEE Worker (H200 GPU): A secure TEE node where the Node.js/Next.js game server and AI logic run inside an encrypted VM enclave. Intel TDX protects the CPU/memory and NVIDIA Confidential Computing encrypts all GPU memory
phala.com
, providing full-stack hardware isolation of the application. This TEE node loads the game container (Docker image) and ensures only attested code runs, with the AI model training/inference accelerated on the H200 GPU under hardware-enforced privacy
phala.com
. Even Phala as the host cannot read the game’s data or model while it runs in the enclave
phala.com
.

Users (Web Client): Players interact with the game through a web front-end. The front-end can be served in a decentralized manner (e.g. a static Next.js build on IPFS or a client-side app) to avoid any centralized web server. Players connect to the game’s API endpoints exposed by the TEE node via HTTPS. The TEE obtains a TLS certificate internally (managed inside the enclave) so that communication is end-to-end encrypted and terminates inside the TEE
phala.com
phala.com
. This zero-trust hosting means even network traffic is protected from the host. All user actions that affect on-chain state (like submitting moves or payments) are signed with their wallets and sent to the smart contracts or game server as appropriate.

Smart Contracts (Blockchain Layer): A suite of Solidity contracts on an EVM chain (Ethereum or an EVM-compatible network) coordinates funding, game state commitments, and governance:

Game Management Contract: Holds the treasury of funds that pay for the game’s operation and possibly player stakes or fees. It tracks the authoritative game state hash or an IPFS content ID (CID) pointer. The TEE, using its internal Ethereum wallet, sends transactions to this contract to update game state (posting a new encrypted state CID) and to withdraw funds for operational costs. Only an authorized TEE-controlled address can call state update or fund withdrawal functions, preventing arbitrary parties from hijacking the game state.

Staking & Rewards Contract: Implements a staking mechanism where supporters stake tokens (or deposit funds) that cover the game’s infrastructure costs. Staked tokens might earn rewards if the game generates profits. The contract disburses funds to the TEE operator (or pays the Phala network) at intervals to keep the service alive. Profits from the game (if, for example, users pay fees or the game sells in-game assets) are sent back to this contract, refilling the treasury for sustainable operation.

DAO Governance Contract: Manages a governance token (could be the same as the staking token or a separate token) and voting on game parameters like fees or operational policies. To mitigate flash voting attacks, it requires that tokens be staked/locked for 30 days before they count toward voting power (ensuring voters have a long-term interest). This contract allows token-holders to propose and vote on changes such as fee rates, resource allocation, or upgrades. Votes are executed via on-chain proposals that can adjust configurable settings in the other contracts.

Security Council Multi-sig: A special contract or role for a small council (e.g. 3-of-5 multi-sig) entrusted with encryption key management. The council’s only power in the system is to initiate state encryption key rotation (they cannot modify game logic or funds). For instance, they can call a contract function that signals the TEE to rotate its encryption keys or updates an on-chain record of the current public encryption key. This mechanism is used strictly for security (e.g. if a key is compromised or on a regular schedule) and is subject to checks (like requiring a majority of council signatures).

Decentralized Storage (IPFS/Filecoin/Arweave): All persistent game data is stored off-chain in decentralized storage:

Encrypted Game State: The full game state (including AI model parameters, in-game variables, etc.) is periodically checkpointed by the TEE, encrypted with a TEE-held symmetric key, and uploaded to IPFS or Filecoin. The TEE then submits the CID and an integrity hash on-chain (in the Game Management contract) to commit to the new state
phala.com
phala.com
. This allows anyone to fetch the encrypted state file, but only a genuine TEE instance with the key can decrypt it. The state encryption key is rotated regularly so that older state dumps remain confidential even if a key is later exposed (more on key rotation below). Using IPFS/Filecoin provides content-addressed, tamper-evident storage; the contract-stored CID ensures the state history is immutable and auditable.

Public Training Datasets: The game’s AI agents generate training data (e.g. logs of gameplay or interactions used to improve the AI). These datasets are stored publicly, unencrypted on IPFS/Filecoin, so the community can inspect or even reproduce the training. Each dataset file’s CID is recorded on-chain (perhaps in an event or a list in the contract) to link the data to a specific training cycle. This transparency lets observers verify what data the AI model was trained on, fostering trust in the AI’s evolution. The storage layer might leverage Filecoin deals or Arweave for permanent, low-cost archival of these datasets, since they accumulate over time. (Phala’s off-chain workers can use standard S3-compatible APIs to connect to decentralized storage like Arweave or Filecoin
medium.com
, simplifying integration.)

Phala Network Services: The deployment and runtime of the TEE node are managed by Phala’s decentralized cloud:

The game is packaged as a Docker container and deployed to a Phala Confidential VM (CVM) with GPU support. Deployment can be done through Phala’s CLI or UI by signing a transaction with the deployer’s wallet (no cloud API keys required). The Phala node attests the loaded code (via Intel/NVIDIA attestation) and registers the enclave on the Phala blockchain or trust registry.

Attestation & Trust Center: Each Phala TEE provides a remote attestation report – a cryptographic proof of the exact code hash running and the hardware’s TEE status
ethglobal.com
ethglobal.com
. Phala’s Trust Center service can publicly verify that the Docker image in the TEE matches the open-source repo commit (bit-by-bit) and that it’s running on genuine TDX + H200 hardware
phala.com
phala.com
. We will use this to assure the community (and possibly encode in the contract) that only the intended Babylon game code is operating.

TEE-Derived Wallet: Inside the TEE, the Babylon game will use Phala’s DStack SDK to derive an Ethereum wallet key unique to this application
github.com
. The private key never leaves the enclave, but the corresponding address can be made known. The Game Management contract will whitelist this address as the game operator. This way, when the TEE needs to call contracts (for state updates or withdrawing funds), it simply signs transactions with its enclave-held key. No externally managed API keys or secrets are needed – the enclave itself acts as a secure wallet. (Phala’s DStack can deterministically derive keys so that even if the game is redeployed in a new enclave, it can recover the same address given the same code and initial seed
github.com
, or alternatively a new address can be fed into the attestation for verification.)

In summary, the architecture ensures that the game logic runs in a secure, decentralized environment (a Phala TEE node) while all critical governance and funding decisions are enforced by open smart contracts on-chain. The TEE and blockchain communicate via signed transactions and published data (IPFS CIDs), forming a trust-minimized loop. Players interact as they would with any online game, but behind the scenes their actions are processed by a verifiably secure server that they don’t have to trust blindly – its integrity can be checked via attestation proofs and on-chain records.

Phala TEE Integration and Workflows

Running the Game in a TEE: The Babylon game server will be deployed to a Phala H200 GPU TEE node for execution. Upon launch, the Phala node performs a remote attestation, producing evidence of the enclave’s identity and the loaded code measurement. This attestation can be verified by the game’s smart contract or off-chain by the developers/community:

Code Integrity: The attestation report includes a hash of the Docker image or application code. We will publish the expected hash (e.g., corresponding to a specific Git commit or build of the Babylon repo) and have the TEE attest it. This ensures the exact Node.js/Next.js code running is the intended one, with no backdoors. Phala’s Trust Center automates this by linking the deployment to a public verification page showing the code proof and hardware proof
phala.com
phala.com
.

Hardware Authenticity: The attestation also confirms the enclave is running on genuine hardware (Intel TDX for CPU, NVIDIA Hopper H200 for GPU) with security features enabled
phala.com
phala.com
. Both Intel and NVIDIA provide cryptographic endorsements (dual attestation) so that even GPU computations (like AI model inference/training) are known to be protected
phala.com
. This guarantees the AI model is running in a confidential environment, preventing a malicious host from swapping it out or reading its secrets. For example, if the game claims to use a certain AI model, the attestation can prove that the model container hasn’t been tampered with
phala.com
phala.com
.

Secure Service Launch: To start the game TEE instance, the deployment process would be:

Provisioning via Wallet: The team (or a script) uses Phala’s deployment CLI to launch a Confidential VM with the game’s container. Authentication is done by signing a transaction or message with a wallet that registers the deployment (Phala Cloud uses wallet-based login and signing for actions, avoiding any username/password API keys).

Resource Assignment: The Phala network allocates a H200 GPU-equipped worker to this task (possibly requiring staking PHA or payment in PHA/stablecoin via an on-chain market). The entire provisioning happens without third-party cloud credentials – the on-chain stake/payment from the contract or deployer’s wallet entitles the game to run on a node.

Container Boot & Attestation: The game’s Docker image boots inside the enclave. Early in startup, the DStack SDK inside the app generates an attestation quote (e.g., when the Next.js app initializes). This quote is either automatically sent to the Trust Center or can be fetched via a secure API endpoint (the starter template includes an /api/tdx_quote route to get a quote
github.com
). The attestation includes a developer-chosen reportData field – we can embed the game’s expected Git commit hash or the Ethereum address of the game’s wallet in this field for extra verification context
ethglobal.com
github.com
.

Verification and Registration: The attestation is verified against Intel/NVIDIA public keys. If valid, the game’s smart contract can record that a valid TEE instance is online. For example, the contract might have a function to submit an attestation signature; a decentralized oracle or the Phala blockchain could verify it and then inform the Ethereum contract (this cross-chain verification is complex, so initially a trusted off-chain verifier might sign off). Alternatively, the project operators or community multisig can manually verify the Trust Center report and then call an activateGame(address operatorAddr) function on the contract to authorize the TEE’s address for operations.

TEE as On-Chain Agent: Once running, the TEE-based game server acts as an autonomous agent that interacts with the blockchain and players:

Inside the enclave, the DStack SDK derives an Ethereum keypair which the game uses to sign transactions
github.com
. The key is derived from a root secret unique to the application (often tied to the enclave’s sealed storage or a hash of the code), meaning every genuine instance of this game can deterministically get the same address (if desired). The private key never leaves the enclave memory, and is even sealed by hardware if stored, so it cannot be extracted.

The first time the game starts, it will compute its Ethereum address, and we’ll use that to configure the contracts. For instance, the Game Management contract will have a variable for authorizedOperator set to this address. Only this key can call privileged functions (update state, withdraw funds). The address could also be included in the attestation reportData for proof.

The TEE can also derive other chain accounts if needed (e.g., a Polkadot address if interacting with Phala’s chain, or a Filecoin key to make storage deals), all without external keys. This wallet derivation and remote signing ability means the game can pay for its own operations and interact with multiple chains securely from within the enclave
ethglobal.com
.

Confidential Data Handling: The Phala TEE ensures that any sensitive data the game handles remains encrypted or in isolated memory:

The game state and ML model are stored in enclave memory (encrypted in DRAM by hardware) and in GPU memory (encrypted by the H200’s mechanisms). At rest, any state the game saves (to disk or to IPFS) is encrypted by keys that the TEE’s internal KMS generates
phala.com
. Phala’s DStack uses a hardware-protected Key Management Service to derive encryption keys that never leave the enclave
phala.com
. For example, when the game container is deployed, it can request a key for “state-encryption-v1” and the TEE will derive it from a master seed fused to that enclave. Only code running in a properly attested enclave can derive the same key again (ensuring that if we redeploy the game, it can rederive the key to load prior state, but an outsider cannot).

During operation, if the game needs to fetch or store data externally (like writing to IPFS), it uses encrypted channels. The TEE can initiate TLS connections such that the private keys for HTTPS are inside the enclave
phala.com
 – even Phala cannot perform a man-in-the-middle on outbound traffic. This is important for using IPFS APIs or similar; however, since IPFS is largely content-addressed, the game can also interact with IPFS’s network directly by running an IPFS client library inside the enclave (storing only encrypted content).

The end result is that the TEE acts as a black box: players and on-chain contracts only see encrypted blobs (state snapshots, etc.) coming out, and they trust the results because the attestation said the black box’s code is legit. Even if someone compromised the cloud provider, they cannot inspect or alter the game’s internal state. In other words, the game achieves the privacy of a server and the trust model of a smart contract: the TEE-hosted game is verifiably executing exactly the intended logic and revealing only what it’s supposed to.

AI Model Training Loop: The game likely includes AI agents that improve via periodic training. Implementing a daily training loop without traditional cron jobs is handled as follows:

The TEE can simply run an internal scheduler. Since it’s essentially a full Linux VM, we could set up a cron inside it to invoke the training script every 24 hours. This does not rely on any external trigger and stays within the enclave.

However, to integrate with on-chain accountability, the game will notify the blockchain of training events. For example, each day after training, the game could emit an on-chain event or call a function like recordTrainingUpdate(datasetCID, newModelHash). The datasetCID is the IPFS hash of the training data used (which was made public), and newModelHash could be a hash of the updated model weights (still kept encrypted in state, but the hash gives a public commitment).

The contract can store these or emit them as logs. This creates an immutable timeline of model updates linked to specific data – anyone could later verify that if they take the previous model and apply training on the published dataset, they get a model with the reported hash (ensuring the training was honestly done and reproducible).

The GPU TEE is critical here: training AI models is computationally heavy, but the H200 provides massive performance while maintaining confidentiality. Phala’s studies have shown under 5% overhead for running LLMs in TEE mode on H100/H200 GPUs
phala.com
phala.com
, so daily training is feasible without sacrificing much speed. The enclave can train using frameworks (TensorFlow/PyTorch) with GPU acceleration and still none of the data (observations, model parameters) leaks to the outside world.

Wallet-Based Provisioning & Control: All interactions with the infrastructure use crypto-wallet identities:

Deploying or restarting the game TEE uses the deployer’s wallet (likely the DAO’s or an operator’s wallet) to authorize on Phala’s network.

Funding the game uses on-chain transfers of tokens; the contract then controls those funds. No API calls to cloud services or banks – the funds flow is entirely on-chain.

The game requesting more resources or scaling (if needed in future) could also be triggered by on-chain logic. For example, if the game becomes popular and needs more GPU time, the contract could escrow additional payment to the Phala network to upgrade the node or extend the lease.

If the game needs to be moved or replicated to another node, a similar on-chain or council-approved process would initiate a new enclave. Because of attestation and the deterministic key derivation, a new enclave can pick up where the last left off (given access to the encrypted state and proper keys).

In short, Phala’s TEE integration provides a secure, decentralized runtime for the AI game that operates with the transparency of blockchain (via attestation) while keeping internal data confidential. The Node.js/Next.js app need not be rewritten – it runs within the enclave as is, with added SDK calls for security (key derivation, attestation). The strong guarantees include: the code is authentic
phala.com
, the data is safe from prying eyes
phala.com
, and the game’s on-chain interactions are cryptographically signed by the enclave’s own wallet (so they are authorized and non-repudiable).

Smart Contract Design

Multiple smart contracts on an EVM blockchain will coordinate the economics and governance of the game. Here we outline their structure and roles:

1. Game Operations & Treasury Contract

This is the core contract that keeps the game running financially and maintains an anchor of the game’s state on-chain.

Funds Management: The contract holds a treasury fund (denominated in a suitable token, e.g. a stablecoin or PHA tokens if on Phala’s chain) used to pay for the TEE node and other expenses. It may receive initial funding via an ICO or by players. The contract could employ a streaming payment mechanism to pay the node operator: for example, it could gradually release funds to the TEE’s address or a Phala resource fee pool at a set rate. This ensures the game stays “always-on” as long as funds are available. If the balance is low, the contract can alert the DAO to top-up (or automatically pull from a profit reserve).

State Tracking: The contract does not store game state directly (since the state is large and private), but it stores references:

A variable like currentStateCID holds the IPFS CID of the latest encrypted state snapshot, and perhaps stateVersion or a block number for versioning.

Only the authorized game operator (the TEE’s Ethereum address) can call updateState(cid hash) to update this reference. The contract can emit an event with the CID and a cryptographic hash of the encrypted state for integrity. This on-chain anchor prevents any confusion about which state is official and enables continuity if the game is restarted on a new node (the new instance will fetch the latest state from IPFS via this CID).

The contract can enforce a rate-limit or schedule on state updates (for example, maybe the game posts a state checkpoint at most once per hour or at specific times like after each training loop). This can help in budgeting and also provides a clear timeline for state progression on-chain (useful for auditors or for detecting if the game goes down and stops updating).

Operator Authorization: At deployment, the contract is configured with the TEE’s address (operatorAddr). All sensitive functions (state update, fund withdrawal) have a modifier that requires msg.sender == operatorAddr. Initially, operatorAddr is set to the first enclave’s derived address. If we ever need to swap to a new enclave (due to failure or rotation), this address can be updated by governance (or via an attestation-verification process as discussed in liveness section). To avoid frequent changes or hijacking, this could require a combination of conditions like timeouts and multi-sig approval.

Withdrawal for Expenses: The contract should allow the operator to withdraw limited funds to pay for infrastructure. One model is a “pay-per-epoch” approach: e.g., the contract holds monthly funding and the TEE calls withdraw(amount) each day or week to pay cloud costs. To prevent abuse (operator draining funds), the contract can enforce a cap (e.g., $X per day max, set by DAO). This ensures even if the TEE is compromised, it cannot steal the entire treasury at once – it can only take what is needed for operations in that period. The withdrawn funds might go directly to the Phala network’s payment address (if Phala supports receiving from an EVM chain via an address or through a bridge) or to the operator who then pays for the node off-chain. In a fully automated setup, we could integrate a system where the TEE proves it paid for a certain time (maybe by submitting a receipt or simply by trusting that if it doesn’t pay, it will be cut off and then it won’t be updating state – creating an incentive to use the funds correctly).

Emergency Stop & Restart: The contract could have a safety mechanism: if no state update has been received for a threshold duration (meaning the game might be down), it could enter an “inactive” mode where withdrawals are halted (to prevent paying a dead node) and a flag is set to allow a new operator to take over. This ties into the liveness guarantees discussed later. Essentially, the contract serves as the heartbeat monitor by expecting periodic updates from the TEE.

2. Staking and Profit-Sharing Contract

To align incentives and fund the game sustainably, a staking contract will be used. It can be a separate module or part of the main contract.

Stake Deposits: Players or investors can stake tokens (for example, a governance token or PHA) into the contract’s stake pool. Staked tokens might not directly pay for operations, but they represent commitment. The treasury uses these as collateral or to yield returns.

Operational Fund Usage: The staked funds themselves could be utilized in various ways:

The simplest approach is that stake is purely for governance power and possibly to absorb losses (not spent on operations). Instead, the treasury might be funded by selling some tokens or via donations.

Alternatively, the staking contract could periodically convert a portion of staked tokens into operational funds (sell or allocate them) to top up the treasury. This would be like a community-funded model: stakeholders collectively pay for the server costs, expecting the game’s revenue to reimburse them.

Profit Distribution: If the game yields profit (for instance, if the game charges fees in ETH or has NFT sales), those funds flow into the contract. The contract can then refill the treasury (for future costs) and distribute any excess to stakeholders as rewards or buy/burn tokens to reward them. This creates a loop where the game ideally becomes self-sustaining: players’ spending or external sponsorship keeps it running, and early stakers who bootstrapped it earn returns.

Withdrawal and Slashing: Stakers likely have to lock their tokens for a period (perhaps the same 30 days as governance, or longer) to prevent quick in-and-out. If the game fails due to negligence (e.g., operator fails and funds are wasted), there could even be a slashing mechanism where part of the stake is taken as a penalty to reimburse lost funds. For example, if an operator misbehaves, the contract (via a council decision or automated detection) could slash the operator’s own stake or a performance bond. Designing a precise slashing condition is tricky because verifying misbehavior off-chain is hard; more likely this is handled via governance (i.e., the council can slash if evidence of wrongdoing).

3. Governance DAO Contract

The governance contract controls parameters like fee rates, operational budgets, and can upgrade the other contracts if needed (through a controlled process). Key features:

Token and Voting: The governance token (let’s call it $GAME for now) is used to vote. Holders must lock/stake their tokens for 30 days to get voting power. This can be implemented by having a separate lockup contract or by snapshotting balances that were held continuously over 30 days. A straightforward design is to require users to call a stakeForVoting(amount) function, which locks the tokens and only allows withdrawal after 30 days after unstaking. This ensures at any vote, those voting have been in for at least 30 days (preventing someone from buying tokens right before a vote and selling right after).

Proposal Process: A user with enough voting power (or delegated power) can create a proposal to change a parameter or execute a transaction (like changing a contract setting or replacing the operator address). There can be a minimum quorum and a voting period (e.g., 1 week). During this time, only addresses whose tokens were locked prior to proposal creation can vote (enforcing the 30-day rule in practice).

Executable Decisions: The DAO contract could be set as the owner of the Game and Staking contracts, so it can directly call functions to adjust parameters: e.g., change the daily withdrawal limit, adjust fee percentage, initiate key rotations (though that is delegated to council), or even initiate an upgrade of the game server code (if ever needed, this might involve deploying a new enclave and updating the operator address).

Fee Setting: One specific parameter for DAO is game fee rates. For instance, the game might charge a 1% fee on certain in-game transactions or a monthly subscription in tokens. The DAO could vote to increase or decrease this fee based on costs and desired profit. This requires the game logic to actually enforce fees (the TEE could, for example, require players to pay an on-chain fee for certain actions, or the contract might charge a small amount when updating state).

Treasury Oversight: The DAO might also oversee the treasury contract – it could vote to add funds (if the treasury is multi-sig controlled, the DAO might instruct a deposit from community treasury if one exists) or to pause the game if something’s wrong.

The governance ensures that no single entity unilaterally controls the game; the community of token holders can collectively make decisions, albeit with a time delay and requisite consensus.

4. Security Council & Key Management

The Security Council is a specialized multi-sig (or multisignature-controlled contract) with the sole authority to manage encryption keys:

The council is composed of, say, 5 reputable community members or organizations. Their multi-sig wallet address is known to the contracts.

The main thing they can do is invoke a key rotation procedure. This could be a function on the Game Management contract like rotateKey(newPublicKey) or simply initiateKeyRotation().

How this works: The TEE periodically needs a new symmetric key to encrypt state. We will use an asymmetric wrapping: The council will have an encryption public key (with private key split among them, or they each have a part of a threshold key). The TEE can generate a fresh symmetric key for the state, encrypt it with the council’s public key, and post that encrypted key to the blockchain or a secure channel. The council members, using their private key shares, can decrypt and re-encrypt this symmetric key under a new TEE’s public key if migrating, or hold it in escrow (in case of disaster recovery).

In normal operation, the council’s role might be limited to providing a safety net. However, they can also trigger proactive rotations: e.g., every month they call the function which essentially tells the TEE “start using a new key for state encryption”. The TEE would comply (since it monitors the contract events) and re-encrypt the state with a newly derived key. The new encrypted state is uploaded (with a new CID) and the contract updates to point to it, along with maybe an ID for the key version. The old key is then scheduled for destruction inside the TEE (after maybe a safe overlap period).

The scope by time is achieved by this rotation – each key only secures at most N days of data. As noted in security literature, regularly replacing encryption keys limits the damage from any single key compromise to only the data encrypted by that key in its time window
a16zcrypto.com
. If an attacker somehow stole a past key, they still couldn’t decrypt newer state or past states encrypted with older (already retired) keys.

The council multi-sig can also serve as an emergency kill-switch for keys. For example, if a vulnerability in the TEE is announced that might leak keys, the council could immediately rotate the key (perhaps even instruct the game to pause accepting new user actions until rotation is done). However, the council cannot arbitrarily change game state or take funds – their powers are narrowly scoped, which is important for decentralization (the community knows council members can’t collude to steal money or alter game outcomes, they can only intervene to protect keys).

Staking for Council Members: Council members might be required to also stake a significant amount of tokens as bond, to incentivize honesty (if they mismanage keys, theoretically slashing could occur).

5. Other Supporting Contracts

Token Contracts: If new tokens (governance token, staking token) are introduced, standard ERC-20 (or ERC-20 + timelock extensions) contracts will be used. The governance token might implement snapshot voting or extend ERC-20 to support the voting lock-up requirement.

Upgradability: We may or may not allow upgradability via proxy contracts. Given the complexity, it might be wise to have upgradeable proxies for the main contracts, controlled by the DAO (with time delay), so that bug fixes or feature additions in contracts can be implemented with community approval. However, this adds complexity and trust assumptions (ensuring proxy is not misused). Alternatively, we keep contracts immutable and deploy new ones if needed with a migration plan governed by DAO.

All contracts will be developed and tested with Hardhat and Forge, ensuring robust test coverage (especially for edge cases like time-lock enforcement, multi-sig requirements, etc.). Using known standards (OpenZeppelin libraries for roles, timelocks, governor modules, etc.
a16zcrypto.com
) will speed development and increase security.

Encrypted Storage & Key Rotation Design

Encrypted State Storage: The live game state (which could include AI model weights, agent memories, world state, etc.) is kept confidential by using symmetric encryption (e.g., AES-256-GCM) within the TEE. The key for this encryption (let’s call it StateKey) is generated and maintained inside the enclave’s secure keystore. Whenever the game writes out a checkpoint (to IPFS), it uses StateKey to encrypt the data. The ciphertext plus perhaps an HMAC are uploaded, and the CID is recorded on-chain. Because IPFS has no built-in encryption, we implement encryption at the application layer. Note that IPFS CIDs are content hashes of the encrypted data, so if the data were tampered with, the CID wouldn’t match what’s on-chain, thereby preventing malicious alterations.

Key Escrow in TEE: StateKey itself never leaves the TEE unencrypted. If we need to persist it (for example, if the enclave restarts), Phala’s platform can seal data to the enclave (TDX can seal data to CPU-bound keys, meaning it’s encrypted such that only the same enclave code can unseal). In practice, the easiest method is to derive StateKey on the fly from a master seed that is sealed in the enclave. DStack’s KMS likely does this – it might derive keys based on a label and the enclave’s device keys
phala.com
. Thus, the game could derive a key like StateKey_epoch1 = KMS.DeriveKey("game_state|epoch1"). At rotation time, it will derive a new one with a new label.

Rotating Encryption Keys: As emphasized, regular key rotation is critical for forward security
a16zcrypto.com
. We plan to rotate StateKey periodically (e.g. monthly or if triggered by council). The design:

The game’s contract includes a keyVersion or the like. Initially keyVersion = 1. The TEE knows it should use the corresponding key label.

When rotation is triggered (by time or council call), keyVersion increments to 2 on-chain. The TEE sees this (via reading the contract state or event).

The TEE then uses its KMS to derive StateKey_2 = DeriveKey("game_state|epoch2"). It loads the latest state from IPFS (encrypted with old key), decrypts it with StateKey_1, then re-encrypts it with StateKey_2. It publishes the newly encrypted state as a fresh IPFS object (new CID) and calls the contract’s updateState(newCID) with the new version.

The contract updates currentStateCID and also updates an on-chain mapping of which CID was encrypted with which key version (this could help if we ever needed to allow someone with old key to decrypt historical data – but likely we keep old keys secret or destroyed).

The old key StateKey_1 is then wiped from memory. The enclave can even call a special CPU instruction to seal the old key and then discard it, so it’s not even kept around in RAM.

Now, if an attacker had somehow compromised the old key, the damage is limited – they could only read state up to the last rotation (which might be out of date anyway), and not beyond
a16zcrypto.com
. And if they only manage to compromise after rotation, they get nothing of the past.

The rotation does come with overhead (reading and writing the entire state), but doing it monthly or so is acceptable.

Emergency Key Revocation: If a breach is suspected, the council can initiate an immediate key change. In that case, the above happens as quickly as possible. Additionally, the council might choose to change the underlying master seed (if they suspect the enclave itself might be compromised). That’s a heavier process – essentially redeploying a new enclave with a new seed – which would be part of disaster recovery.

MPC for Decentralized Key Management: To reduce trust in the single TEE for key management, we can incorporate multi-party computation (MPC) techniques:

The council’s role could be implemented with MPC such that no single council member ever sees the full StateKey. For instance, when the TEE wants to share a new key with council (for escrow), it could split the key into N shares and encrypt each share to a different council member. Only a threshold of them together could reconstruct it. Or the council could themselves use an MPC wallet (like Lit Protocol or others) to store a secret that can re-encrypt keys.

Ideally, we want to avoid having to trust even the council with the plaintext key. A possible scheme: The TEE can generate a key pair (public/private) internally and give the public key to the council. The council uses MPC to generate a symmetric key and send it encrypted to the TEE’s public key (so only the TEE can decrypt it). Now both the TEE and council share knowledge of the symmetric key’s existence, but perhaps only the TEE can use it directly. This area gets complex; the simplest form might be TEE + MPC for operator rotation: if we ever want to switch to a new TEE operator, we could involve multiple TEEs or council nodes to transfer the key without exposing it. For example, the current TEE could split StateKey into shares and distribute to council members, the new TEE then collects shares via MPC to reconstruct StateKey inside its own enclave
medium.com
 – all done without any single point seeing the full key. This approach (as described by DeepSafe) eliminates the exposure window during key handover
medium.com
.

Initially, we might not implement full MPC for keys due to complexity, but we design the system such that it could be added. The trust model then would be: compromise of a single TEE does not leak the state permanently, because keys can be rotated and require either multiple parties or fresh hardware to get.

Public Data on Decentralized Storage: The training datasets are not encrypted (they’re meant to be open). However, to maintain integrity, each dataset file’s hash is recorded. The contract or a subgraph can maintain an index of dataset CIDs along with the game’s state version or date. This way, if anyone doubts the training process, they can retrieve the data and verify that it’s legitimately derived from gameplay or that the improvements in the AI correspond to the published data.

Storage Cost Management: Storing lots of data on IPFS/Filecoin is inexpensive per se (Filecoin miners require a small FIL payment for deals, IPFS pinning may need some incentive). The system can allocate a portion of funds for data storage – for instance, use Filecoin’s decentralized storage marketplace to store each new state or dataset with redundancy for a predefined duration. Since no API keys can be used, we’d likely interact directly with the Filecoin network from the TEE (there are libraries or we could use the Filecoin HTTP API by running a light node in TEE). Another approach is using Arweave for permanent storage of critical data (one-time fee). The choice will depend on cost trade-offs: state snapshots could be a few MBs (AI models can be large though – if the model is hundreds of MBs or more, storing every version might be costly; we might store incremental updates or only the final model and seeds to regenerate intermediate steps).

Key Scope and Time-Lock: Besides rotating encryption keys, we can also time-limit access to keys. For example, if multiple enclaves are ever running (say one active game, one standby mirror), we can set keys such that only one enclave is actively using the current key. The standby might have to wait for the next rotation to get a key it can use. This prevents two enclaves from decrypting the state at the same time (which could cause conflicts). More straightforwardly, we enforce via policy: only one authorized TEE at a time.

In essence, our design follows the principle of least exposure: Encryption keys are regularly replaced and never leave secure hardware, so even in worst-case scenarios, any leak compromises at most a slice of data
a16zcrypto.com
. By combining TEE guarantees with optional MPC for sharing, we ensure that no single failure (except a total break of all TEEs and all council members) can lead to unauthorized decryption of the game state
medium.com
. These measures provide strong confidentiality for the game’s secret state while still allowing the needed flow of information (via on-chain CIDs and controlled access in enclaves).

Infrastructure Deployment, Startup Sequence, and Liveness

A key requirement is that at least one game instance is running at all times. We achieve high availability through a combination of automated deployment and on-chain liveness checks:

Deployment Automation: Using Phala’s infrastructure, we can automate provisioning of the H200 GPU node:

We will create a deployment script (using Phala’s CLI or even a smart contract on Phala’s side) that can be triggered via wallet signature. For example, the Game Management contract could have a function spawnEnclave() that, when called, interfaces (via a cross-chain message or an oracle) with the Phala network to start the game container. In practice, initially it might be simpler: an off-chain agent listening for an event (like the contract emitting NeedEnclave) triggers the deployment using the CLI with the appropriate credentials. Because we want no API keys, that off-chain agent itself should be something decentralized – possibly a Phala on-chain agent (Phat Contract) that has permission to call the Phala Cloud API. Given the cutting-edge nature, we might start with a semi-automated approach and later integrate it fully on-chain.

The deployment process includes attestation verification as described. Only if the attestation is good do we proceed to register it on Ethereum. This ensures an attacker cannot trick the contract into thinking a random server is the game.

Startup Sequence:

Initial Launch: The team deploys the smart contracts (Game, Staking, DAO) on the chosen blockchain. They configure the initial parameters (funds, authorized operator = none initially, etc.). They also possibly deploy an Agent Contract on Phala or use an existing Phala marketplace to reserve an H200 node.

Enclave Deployment: Using the deployment script, they launch the game’s container on a Phala H200 worker. The enclave starts, outputs an attestation quote. The team verifies the quote (manually or via a script) against the known good measurements.

Operator Registration: The enclave derives its Ethereum address and the team calls the Game contract’s registerOperator(address, attestationProof) function. This function could check that the provided address matches one in the attestation (if we put the address in reportData before) – otherwise it might just set the operator. In a fully trustless flow, this step would be governed by an attestation verification contract, but currently that might be done off-chain and confirmed by the dev team (which is a slight trust trade-off initially).

Initial State: The first enclave either starts with a genesis state (if it’s a brand new game) or, if this is a redeployment, it will fetch the last state from IPFS using the last known key. Assuming it’s genesis, it creates the initial state (could be an empty world or initial AI model parameters). It then immediately takes an encrypted snapshot, uploads to IPFS, and calls updateState(CID0). The contract now has a reference to state version 0.

Game Live: The game begins accepting player connections. Because the game is running in Next.js, it can serve HTTP. The Phala node likely provides a public endpoint for the CVM (e.g., an IP or domain). Users connect to the game’s URL. Alternatively, the front-end could be delivered separately (like a static site on IPFS that knows how to reach the TEE endpoint). In either case, players can now play the game, and the game server will process actions. Most game logic is handled off-chain in the enclave; only when necessary (like when a match ends or periodically) will it interact with the blockchain.

Regular Operation: The enclave keeps track of time and triggers events:

It sends a heartbeat to the Game contract by calling a cheap function like heartbeat() perhaps every few hours to signify “I’m alive”. Or it could simply frequently update state (though state update might be heavier, a heartbeat could just update a timestamp on-chain).

Daily, it runs the training loop, produces a dataset, posts it to IPFS, and calls recordTraining(CID_dataset, modelHash) on-chain.

If running low on credit, it calls withdrawFunds(x) to get the next chunk of funds for the coming period. The contract may require that to be called once per day and only up to a limit.

Monitoring Liveness: The Game contract (and the community) monitors these heartbeats or state updates. If the game fails to report in a timely manner (say no update for 24 hours when one was expected), it’s presumed down. The contract could then emit an event OperatorInactive.

Failover Process: Now, because this is permissionless, any third party (or a pre-designated backup operator) can step in to spin up a new enclave:

The contract might enforce a short waiting period (maybe a few hours) after marking inactive, to ensure it wasn’t a transient issue. If still no word from the old enclave, a function openForTakeover() can be called (possibly automatically by the contract) which unsets the current operator address or flags that a new one is welcome.

A prospective new operator then deploys the game container on their Phala node (they would need an H200 or compatible hardware). They obtain an attestation, derive their enclave’s Ethereum address.

They call claimOperator(attestation, newAddress) on the Game contract. This call could do one of two things: (a) ideally, verify the attestation on-chain (which, as discussed, is complex to do directly), or (b) require that the call comes with a bond and an off-chain verification by council or oracle. A practical approach: the Security Council, upon seeing the attestation from the new enclave (provided to them off-chain), can use their multi-sig to call approveOperator(newAddress). This shifts operator authority to the new enclave.

Once authorized, the new enclave can fetch the last state snapshot from IPFS. Key transfer: How does it decrypt it? If the previous enclave is truly dead, we rely on the council having the StateKey share (maybe the council was periodically given the key under encryption). This is where having the council or an MPC share is important. If the council has the key encrypted with their key, they could now provide it to the new enclave. For example, the new enclave generates its own public key and gives it to council, council decrypts the old StateKey with their shares and re-encrypts to the new enclave’s key, and the new enclave receives it (perhaps via a secure API call or a special transaction). Another simpler (but less ideal) fallback: if the old enclave is not completely dead but just losing connectivity, maybe the council can coordinate a graceful handover where the old enclave itself (if still somewhat responsive) could pass the key to the new via the Phala network’s built-in migration support (Phala might have some support for migrating state between workers).

The new enclave, now with the state decrypted, can resume the game. It likely increments a generation counter so everyone knows it’s a new instance.

This new operator process is permissionless in the sense that anyone with the right hardware could volunteer to be the next runner, but in practice the security council’s involvement in key handover adds a semi-permissioned step. We consider that an acceptable compromise for security (fully automating key handover without trust is an open problem; it would require multiple TEEs and complex protocols).

Multiple Instances (if needed): We generally expect one active instance to avoid divergence. However, one can run a redundant passive instance in parallel: it doesn’t accept player input but it continuously syncs state (if it can get the keys). This passive instance can be run by a different operator purely as backup. If the primary fails, the passive could take over very quickly. To facilitate this, the contract might allow registering a “backup operator” that receives read-access to the encrypted data (perhaps given the key by council under strict agreement) but cannot update state unless the primary is gone. This is an advanced high-availability setup and might not be implemented initially, but it’s conceptually possible given the trust model (it introduces some risk if backup goes rogue, but if it’s truly passive it wouldn’t have update rights).

Continuous Deployment & Updates: If the game code itself needs to be updated (bug fixes or new features), this involves building a new Docker image and deploying it to a TEE. Attestation will produce a new code hash, which ideally should be approved by the community (maybe the DAO votes to allow a code update). Once approved, a new enclave is spun up with the new code, the state is loaded (the code might have to handle any migrations of data format), and then it takes over as operator. This upgrade path should be governed on-chain to maintain trust (similar to how contracts are upgraded via governance).

Liveness Incentives: To encourage someone to operate the game (especially if it’s permissionless and not run by the original devs):

The contract can pay an operator reward or salary out of the treasury. Essentially, some of the staked funds or revenue is allocated to whoever is running the enclave as compensation. This can be automated: e.g., 5% of the treasury is designated as monthly reward to operator. If the original operator stops, a new one can come in to earn that reward.

Additionally, the operator could be required to put down a security bond (in the staking contract). If they misbehave (go offline without notice, or attempt to tamper – though tampering would be caught by attestation mismatch or wrong outputs, so mostly offline is the worry), part of their bond can be slashed. This keeps them incentivized to maintain uptime or do a graceful handoff.

The use of staking and slashing effectively creates a permissionless yet accountable operator model: anyone can try to run it, but they need stake (skin in the game) and they get rewards for success.

Phala Network Reliability: Phala itself is decentralized – many worker nodes exist. Our game will likely be tied to one specific physical machine (because of stateful GPU work). If that machine crashes, ideally Phala can automatically restart the VM on either the same machine (if just the VM crashed) or a new machine (if hardware failed). Intel TDX has features for resiliency but not full fault tolerance. We assume a machine crash = enclave down. But because state is regularly saved to IPFS, we can recover as described. The downtime in that case depends on detection and spinning up a new node (could be minutes to hours). The system design favors correctness over continuous availability (some downtime might be tolerated in a failure scenario, as long as state is not lost and game can resume).

Liveness Summary: The architecture provides soft real-time liveness:

Under normal conditions, the game is always up on one enclave.

If it crashes or is compromised, the on-chain contracts detect the cessation of updates and enable a quick transition to a new enclave.

Some human or multi-sig involvement is currently anticipated for key transfer, which could introduce a few manual steps (thus a short downtime), but this is balanced with security.

Monitoring systems (off-chain) can alert the community if no heartbeats or if an attestation fails, so folks can react promptly. Over time, as Phala/TEE tech evolves, more of these steps (like verifying attestation or migrating keys) could be automated or handled by smart contracts themselves.

Minimal Self-Hosted Components

We strive to minimize any centralized or self-hosted infrastructure:

Game Server: Hosted in the Phala network TEE – no traditional server or cloud VM run by the developers. The hardware is provided by a decentralized network of node operators. The deployment and management of this server are done via on-chain commands and secure enclaves.

Frontend/UI: Ideally, the game’s UI (if it’s web-based) can be served from a decentralized source. For example, we can compile the Next.js app to static files and upload to IPFS or a decentralized web host. Users would access via an ENS domain pointing to IPFS. If dynamic server-side rendering is needed, the TEE itself can serve it, but that ties UI to the enclave. A hybrid approach is possible: use a static frontend that queries the TEE via WebSockets/HTTP for game data. This avoids needing a separate web server.

No Proprietary APIs: The system avoids any external API providers (like OpenAI API keys, centralized cloud storage keys, etc.). All AI inference and training happens on the local GPU (no calls to third-party AI services). Storage uses public IPFS/Filecoin networks (no accounts needed, though we might use the game’s wallet to pay minor fees on Filecoin). Authentication uses wallets and signatures. For example, if certain game actions need user authentication, we’d use wallet signatures or NFT ownership checks rather than usernames/passwords.

DevOps and Monitoring: Traditional games might use monitoring dashboards, but here we can leverage on-chain monitoring. The contract events (heartbeats, etc.) serve as a log of performance. Anyone can set up a dashboard to visualize these (for community transparency). The only “off-chain” monitoring could be community-run bots that notify in Discord if something’s wrong. These aren’t critical components, just nice-to-have.

Backups: State backups exist on IPFS which is decentralized, but we need to ensure pinning. Possibly the team or community should run a few IPFS pinning nodes to ensure the data is retained (or use services like Pinata, but that requires an API key – instead maybe use Filecoin persistent storage deals). This is one area where a small bit of centralized effort (pinning nodes) might be used initially until we have enough guarantee from Filecoin/Arweave. These pinning nodes don’t have sensitive info; they just store encrypted blobs, so trust is not a big issue.

Security Council Operations: Council members may need to run a secure environment to perform MPC or store their key shares. That could be their own machines or even their own TEEs. While this is off-chain, it’s decentralized among council members. They will also use multi-sig on-chain to execute their actions. So no single server is critical.

In summary, the only persistent server component is the Phala TEE node itself running the game. All other aspects are either on-chain or distributed. Even the TEE node is not “owned” by us; it’s rented from a decentralized cloud with on-chain payment. If that provider stops, another provider with compatible hardware can step in. This approach drastically reduces reliance on any single entity’s infrastructure (unlike a typical game server which might sit on AWS with an AWS account – here there is no AWS account, just smart contracts and decentralized services).

Security Considerations and Council Role

While the architecture is decentralized, it’s important to outline the trust assumptions and trade-offs clearly:

Trusted Computing Base (TCB): The TEE hardware (Intel CPU, NVIDIA GPU) and Phala’s runtime form the TCB. We trust Intel and NVIDIA’s confidential computing features to not be malicious (but acknowledge possible bugs). The a16z primer notes that TEEs, while powerful, rely on trusting the hardware vendor and are vulnerable to certain side-channel attacks
a16zcrypto.com
a16zcrypto.com
. To mitigate this, we treat the TEE as providing confidentiality and some integrity, but not absolute. We design for possible failure: if the TEE were compromised, what’s the worst case? The attacker might learn the secret state (violating game privacy) or mess with the game’s behavior. However, they still cannot directly steal funds or break the blockchain rules – the contracts only accept properly signed commands and these are limited in scope (they can withdraw limited funds, cannot arbitrarily take all money at once due to rate limits and multi-sig oversight). We also can recover by rotating keys if a TEE is suspected compromised.

Blockchain Trust: We rely on the security of the underlying EVM chain for the contracts (e.g., Ethereum’s security). If using Ethereum mainnet, this is very robust (expensive but secure). If using a sidechain/L2, we trade some security for cost savings. That decision will depend on budget (see cost analysis).

Council Multi-sig: The Security Council is a trusted human layer to cover gaps that automation can’t. The council could, in theory, collude to do malicious things like delay key rotations (to help an attacker keep access) or misuse their ability if we extended it. We restrict their power strictly to key management in the contracts, and social consensus in the community serves as a check on them (they are known and can be replaced by DAO vote if needed). They add a slight centralization, but it’s a limited and accountable one – a common trade-off in decentralized systems where a “multisig emergency brake” exists.

DAO Governance Risks: The 30-day token lock for voting helps reduce governance attacks, but governance itself can be attacked if someone accumulates a majority of tokens. They could then pass malicious proposals (like draining funds under some pretext). This is an inherent risk in token governance. Mitigations: wide token distribution, perhaps a security council veto (though that centralizes again), or parameter limits in contracts (e.g., contracts might have certain inviolable rules that even governance can’t change, like “council can only manage keys” or “cannot change operator without an attested enclave”). We might incorporate some safety limits in code and require a more complex upgrade to break those (which gives time for community to react if a rogue vote happens).

Player Trust: From a player’s perspective, how do they trust the game outcomes? Usually they’d either trust the server or see on-chain moves. Here they are mostly trusting the TEE, which is attested. We will make the attestation transparent (possibly even integrate with an ERC-8004 Verifiable Agents standard as mentioned in Phala’s docs
phala.com
phala.com
). This would allow, for example, an in-game action to include a reference to the Trust Center report, so players know they’re talking to the right AI/logic. We are basically leveraging “verifiable compute” to gain user trust: the game can prove it’s not cheating or running altered logic.

Now we’ll address trade-offs and cost estimates.

Trade-offs and Cost Analysis

Decentralization vs. Practicality: One major trade-off in this design is between full decentralization and current technical feasibility:

Automated Attestation Verification: In a purely trustless design, the Ethereum contract would verify the enclave attestation itself to authorize a new operator. In reality, verifying an Intel/NVIDIA attestation signature on-chain is impractical due to the size and complexity of the verification (would consume too much gas or require specialized precompiles). We chose to involve the Security Council or an off-chain step for this. This introduces a little trust (we trust the council to only approve valid attested enclaves) but is far more practical. In the future, a decentralized oracle network could do attestation verification and inform the contract.

Single-Enclave Execution: We run the game in one TEE at a time. This does create a temporary central point (that one machine) for the game operation. The positive is that it’s a controlled and secure point (due to TEE). The alternative, fully distributed computing (like using many TEEs in consensus), was deemed unnecessary and too complex for a single game instance. The game state is not easily partitionable or consensus-driven (unlike a blockchain, a game server usually is authoritative). So we accept one authority at a time, with fast failover as the remedy for downtime. This is similar to how a decentralized website might still be served by one server at a time but can be mirrored or restarted by others.

Council Multi-sig: We already discussed this trade-off – it’s a centralized element for security, but with limited scope and under DAO oversight. We believe this is a reasonable compromise to handle secrets management, given the lack of fully trustless key exchange methods between TEEs in production. The council’s presence is also an additional defense: if someone somehow hijacked the TEE and tried to refuse key rotation, the council could notice and take action (like pushing an update or even deciding to shut the game down to prevent further data leakage).

Security vs. Cost: Running a TEE with an H200 GPU is expensive. Let’s outline expected costs:

Hardware costs: The NVIDIA H200 is top-of-line (comparable to H100, but with more memory and bandwidth). Running such a GPU 24/7 will be costly. If we use a cloud provider or Phala’s network pricing: for reference, an NVIDIA H100 80GB on cloud costs around $3–$5 per hour in 2025. The H200 (if 2× memory and somewhat improved) might be $6–$10/hour. Phala might have additional costs due to TEE overhead and being decentralized. Let’s estimate $5/hour for simplicity. That’s $120 per day, or ~$3,600 per month. If the cluster is 8× H200 as on Phala’s site for full capacity
phala.com
, we obviously wouldn’t use all 8 for one game; we’d probably use 1 GPU (Phala might slice out one GPU from the server for us). So $3–$4k/month could keep this game running at current rates.

Bandwidth costs: The game state and data have to be transferred to IPFS nodes and possibly to users. IPFS usage itself is free, but someone has to serve the content. If we rely on IPFS public gateways, that’s not reliable; likely the Phala node or backup nodes will handle distributing data. Data volumes: If the AI model is large (say a few GB) and updated daily, we might be uploading GBs of data monthly. This could incur bandwidth costs on the node operator side (which presumably is included in their charge).

Storage costs: IPFS itself is just distribution; for persistence we likely use Filecoin deals or Arweave. Storing, say, 10 GB of data on Filecoin for a year could cost only a few dollars given current incentives (Filecoin storage deals are quite cheap). Arweave would be a bit more for permanent, but also not huge for that size. So storage is minor compared to compute.

On-chain transaction costs: Every day, the enclave will make at least one Ethereum transaction (state update, training log, etc.). If on mainnet, each might cost a few dollars in gas (depending on complexity, maybe $5–$10 for storing a CID in an event). Over a month, that’s maybe $300 in gas. If the game has lots of player interactions that go on-chain (perhaps not, if most logic is off-chain), that could increase. We might consider using an L2 (like Polygon, Arbitrum) to cut costs by 10× or more. But on an L2 we need to ensure bridging of attestation or using a decentralized sequencer… Given the relatively low throughput needed, using mainnet might be acceptable for maximum security. We can optimize by storing only hashes (32 bytes) rather than large data in events.

DevOps and Development costs: The complexity of building this (writing smart contracts, setting up TEE environment, etc.) is high – but that’s a one-time human cost, not runtime cost. Over time, software maintenance and monitoring will also require effort (likely by the DAO or core contributors funded by the DAO treasury).

Scalability vs. Cost: If the game user base grows, we might hit performance limits of a single node. The H200 is very powerful; it could likely handle many concurrent AI inferences and game sessions, but Node.js has its own scaling concerns. If needed, we could scale out by running multiple enclaves that handle different regions or shards of the game world. However, that introduces synchronization issues and more complex state sharing (maybe each shard has its own state). This is more of a game design question – for now, we assume one instance is enough for the expected usage (which might be dozens of concurrent players rather than millions).

Risks and Mitigations:

TEE Vulnerability: If a new Spectre-like attack is discovered that affects TDX or GPU enclaves, our private state could be at risk. Mitigation: immediate key rotation (so any stolen memory is useless) and possibly pause the game until a patch or new hardware is available. The council’s ability to rotate keys and even halt the game is the fallback here (they could essentially stop feeding the enclave funds so it shuts down gracefully if needed).

Operator Collusion with Players: Could the operator cheat in the game? For example, the operator might be a player themselves and try to give themselves an advantage by altering the code. Attestation prevents altering code without detection – the code hash would change, and players/community could see via Trust Center that it’s not the approved version. If an operator somehow found a way to input hidden commands to the AI to favor them, that’s beyond technical – it’s game design to ensure fairness. The DAO might need to oversee the game logic updates if cheating concerns arise.

Regulatory/Compliance: Because this uses encryption and possibly deals with user data, we should consider compliance (though if it’s just a game, not much personal data maybe). Phala advertises compliance readiness (HIPAA, GDPR) thanks to everything being confidential
phala.com
. Indeed, no personal data is exposed anywhere publicly. If needed, a feature could allow a user to request deletion of their data – which might just mean the TEE drops it and it doesn’t appear in future training data (historical encrypted state on IPFS can’t be “deleted”, but it’s encrypted and only accessible to the enclave, so effectively deleted if enclave discards keys or doesn’t include that data going forward).

Future Opportunities: Our architecture, while complex, sets a precedent for autonomous AI agents in games running in a verifiable manner. We align with the emerging ERC-8004 standard for verifiable autonomous agents
phala.com
phala.com
 – meaning the AI running the game could eventually be treated as an on-chain agent whose code and actions are proven to users. If this standard matures, our game’s TEE attestation could be directly integrated into the agent’s on-chain identity (so that interacting contracts or players can automatically verify the agent’s integrity). This could open the door to on-chain rewards or payments to the AI agent (the game itself) in a fully trustless way, essentially creating a DAO-owned game agent.

To conclude, the plan outlined above is comprehensive and cutting-edge: it leverages confidential computing, decentralized storage, and blockchain governance to run an AI game with minimal trust required. We have addressed the major challenges of such a system – coordination without central servers, keeping an AI continually learning, and handling money transparently – by combining the strengths of TEEs and smart contracts. The costs are significant due to hardware, but with community support (staking and possibly monetization strategies), it can be sustainable. The trade-offs made (like having a security council and one-enclave-at-a-time) are mindful choices to balance decentralization with technical reality, and we documented how they are constrained to preserve the permissionless ethos as much as possible.

Overall, this design achieves an “always-on” autonomous game agent that is self-funding, self-improving (via daily AI training), and governed by its players, all while running on a highly secure, privacy-preserving infrastructure – a blueprint for the next generation of Web3 gaming.

Sources:

Phala Network Full-Stack TEE (Intel TDX + Nvidia Confidential GPU) ensures code and data are protected even from host access
phala.com
phala.com
. Keys are derived and kept within the enclave (hardware KMS) so they never exist outside in plaintext
phala.com
.

Phala DStack SDK allows deriving deterministic blockchain wallets inside TEEs
github.com
, enabling our game to manage an Ethereum address internally without external secrets.

Regular key rotation is recommended for forward security – replacing encryption keys limits the impact of any key compromise to only recent data
a16zcrypto.com
.

A combined TEE + MPC approach can facilitate trustless key management and rotation: TEEs perform operations on key shares and MPC ensures no single party ever has the full key, even during transitions
medium.com
. This eliminates exposure windows when shifting keys or operators.

The system aligns with emerging standards for verifiable agents (e.g., ERC-8004), using attestation to prove the agent’s (game’s) code and integrity to users
phala.com
phala.com
, building user trust through cryptographic proof rather than blind faith.