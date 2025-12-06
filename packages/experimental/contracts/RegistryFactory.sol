// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./UserRegistry.sol";

/**
 * @title RegistryFactory
 * @notice Factory for deploying UserRegistry contracts with migration support
 * @dev Implements the factory pattern from PBTS paper for reputation portability
 *
 * From the paper:
 * > "A factory pattern where a single factory contract deploys multiple
 * > reputation contracts, each maintaining user statistics for a tracker instance."
 * > "Single-hop inheritance preserves user scores while preventing conflicts
 * > in multi-level merging."
 */
contract RegistryFactory {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    struct RegistryInfo {
        address registry;           // Registry contract address
        address tracker;            // TEE tracker address
        bytes32 trackerCodeHash;    // Hash of tracker code (from attestation)
        address predecessor;        // Previous registry (for migration)
        uint256 deployedAt;         // Deployment timestamp
        bool active;                // Whether this registry is active
    }

    /// @notice All deployed registries
    mapping(address => RegistryInfo) public registries;

    /// @notice Registry addresses in order
    address[] public registryList;

    /// @notice Current active registry
    address public activeRegistry;

    /// @notice Required attestation verifier (could be on-chain or oracle)
    address public attestationVerifier;

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event RegistryDeployed(
        address indexed registry,
        address indexed tracker,
        bytes32 trackerCodeHash,
        address predecessor
    );
    event RegistryMigrated(address indexed oldRegistry, address indexed newRegistry);
    event AttestationVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    constructor(address _attestationVerifier) {
        attestationVerifier = _attestationVerifier;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEPLOYMENT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Deploy a new registry with TEE attestation
     * @param tracker TEE tracker address
     * @param trackerCodeHash Hash of the tracker code (from attestation)
     * @param attestation TEE attestation proof
     * @param minReputation Minimum reputation threshold
     * @param initialCredit Initial upload credit
     */
    function deployRegistry(
        address tracker,
        bytes32 trackerCodeHash,
        bytes calldata attestation,
        uint256 minReputation,
        uint256 initialCredit
    ) external returns (address) {
        // Verify attestation if verifier is set
        if (attestationVerifier != address(0)) {
            // In production, this would verify Intel TDX attestation
            // For now, we just check the attestation is not empty
            require(attestation.length > 0, "Invalid attestation");
        }

        // Deploy new registry
        UserRegistry registry = new UserRegistry(minReputation, initialCredit, tracker);
        address registryAddr = address(registry);

        // Record deployment
        registries[registryAddr] = RegistryInfo({
            registry: registryAddr,
            tracker: tracker,
            trackerCodeHash: trackerCodeHash,
            predecessor: address(0),
            deployedAt: block.timestamp,
            active: true
        });

        registryList.push(registryAddr);

        if (activeRegistry == address(0)) {
            activeRegistry = registryAddr;
        }

        emit RegistryDeployed(registryAddr, tracker, trackerCodeHash, address(0));
        return registryAddr;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MIGRATION (Following PBTS Migrate algorithm)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Migrate to a new registry, inheriting state from predecessor
     * @param oldRegistry Previous registry address
     * @param newTracker New TEE tracker address
     * @param newCodeHash New tracker code hash
     * @param attestation New TEE attestation
     *
     * From PBTS paper:
     * > "When a tracker becomes unavailable, reputation migrates to a new
     * > instance via Migrate. The new tracker generates a fresh instance ID
     * > and provides cryptographic attestation proving authenticity."
     */
    function migrate(
        address oldRegistry,
        address newTracker,
        bytes32 newCodeHash,
        bytes calldata attestation
    ) external returns (address) {
        RegistryInfo storage oldInfo = registries[oldRegistry];
        require(oldInfo.registry != address(0), "Old registry not found");
        require(oldInfo.active, "Old registry already migrated");

        // Verify new attestation
        if (attestationVerifier != address(0)) {
            require(attestation.length > 0, "Invalid attestation");
        }

        // Get old registry config
        UserRegistry oldReg = UserRegistry(oldRegistry);
        uint256 minRep = oldReg.MIN_REPUTATION();
        uint256 initCredit = oldReg.INITIAL_CREDIT();

        // Deploy new registry
        UserRegistry newRegistry = new UserRegistry(minRep, initCredit, newTracker);
        address newRegistryAddr = address(newRegistry);

        // Record with predecessor link (single-hop inheritance)
        registries[newRegistryAddr] = RegistryInfo({
            registry: newRegistryAddr,
            tracker: newTracker,
            trackerCodeHash: newCodeHash,
            predecessor: oldRegistry,
            deployedAt: block.timestamp,
            active: true
        });

        // Deactivate old registry
        oldInfo.active = false;

        registryList.push(newRegistryAddr);
        activeRegistry = newRegistryAddr;

        emit RegistryMigrated(oldRegistry, newRegistryAddr);
        emit RegistryDeployed(newRegistryAddr, newTracker, newCodeHash, oldRegistry);

        return newRegistryAddr;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Get registry count
     */
    function getRegistryCount() external view returns (uint256) {
        return registryList.length;
    }

    /**
     * @notice Get predecessor chain for a registry (for reputation lookup)
     * @dev Returns addresses in order from newest to oldest
     */
    function getPredecessorChain(address registry) external view returns (address[] memory) {
        // Count chain length
        uint256 length = 0;
        address current = registry;
        while (current != address(0)) {
            length++;
            current = registries[current].predecessor;
        }

        // Build chain array
        address[] memory chain = new address[](length);
        current = registry;
        for (uint256 i = 0; i < length; i++) {
            chain[i] = current;
            current = registries[current].predecessor;
        }

        return chain;
    }

    /**
     * @notice Check if a registry is the current active one
     */
    function isActiveRegistry(address registry) external view returns (bool) {
        return registry == activeRegistry && registries[registry].active;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update attestation verifier
     */
    function setAttestationVerifier(address _newVerifier) external {
        // In production, this should be protected by governance
        address oldVerifier = attestationVerifier;
        attestationVerifier = _newVerifier;
        emit AttestationVerifierUpdated(oldVerifier, _newVerifier);
    }
}

