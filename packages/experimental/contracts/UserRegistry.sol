// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UserRegistry
 * @notice On-chain PKI for permissionless peer authentication
 * @dev Implements user registration and reputation tracking as described in
 *      the Phala PBTS paper (https://eprint.iacr.org/2025/2131.pdf)
 *
 * Key insight from the paper:
 * > "The smart contract serves as PKI: registered users have on-chain
 * > public keys and reputation records. Peers authenticate DHT
 * > announcements using these credentials."
 */
contract UserRegistry {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    struct User {
        address publicKey;      // User's public key (address format)
        uint256 uploaded;       // Total bytes uploaded
        uint256 downloaded;     // Total bytes downloaded
        uint256 registeredAt;   // Registration timestamp
        bool active;            // Whether account is active
    }

    /// @notice Minimum reputation score to participate
    uint256 public immutable MIN_REPUTATION;

    /// @notice Initial upload credit for new users
    uint256 public immutable INITIAL_CREDIT;

    /// @notice Address of the authorized tracker (TEE)
    address public tracker;

    /// @notice Mapping from user ID (bytes32) to user data
    mapping(bytes32 => User) public users;

    /// @notice Mapping from address to user ID (for reverse lookup)
    mapping(address => bytes32) public addressToUserId;

    /// @notice Total registered users
    uint256 public totalUsers;

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event UserRegistered(bytes32 indexed userId, address indexed publicKey, uint256 timestamp);
    event ReputationUpdated(bytes32 indexed userId, uint256 uploaded, uint256 downloaded);
    event TrackerUpdated(address indexed oldTracker, address indexed newTracker);
    event UserDeactivated(bytes32 indexed userId);

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @param _minReputation Minimum upload/download ratio * 100 (e.g., 50 = 0.5 ratio)
     * @param _initialCredit Initial upload credit in bytes
     * @param _tracker Initial tracker address
     */
    constructor(uint256 _minReputation, uint256 _initialCredit, address _tracker) {
        MIN_REPUTATION = _minReputation;
        INITIAL_CREDIT = _initialCredit;
        tracker = _tracker;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REGISTRATION (Following PBTS Register algorithm)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a new user with signature verification
     * @param userId Unique user identifier
     * @param signature Signature over (register || userId || address(this))
     */
    function register(bytes32 userId, bytes calldata signature) external {
        require(users[userId].publicKey == address(0), "User already registered");
        require(addressToUserId[msg.sender] == bytes32(0), "Address already registered");

        // Verify signature (user proves ownership of their key)
        bytes32 messageHash = keccak256(abi.encodePacked("register", userId, address(this)));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address recovered = recoverSigner(ethSignedHash, signature);
        require(recovered == msg.sender, "Invalid signature");

        // Create user record
        users[userId] = User({
            publicKey: msg.sender,
            uploaded: INITIAL_CREDIT,
            downloaded: 0,
            registeredAt: block.timestamp,
            active: true
        });

        addressToUserId[msg.sender] = userId;
        totalUsers++;

        emit UserRegistered(userId, msg.sender, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REPUTATION UPDATES (Only by authorized tracker)
    // ═══════════════════════════════════════════════════════════════════════

    modifier onlyTracker() {
        require(msg.sender == tracker, "Only tracker can update reputation");
        _;
    }

    /**
     * @notice Update user reputation (called by tracker after verifying receipts)
     * @param userId User to update
     * @param uploadDelta Additional bytes uploaded
     * @param downloadDelta Additional bytes downloaded
     */
    function updateReputation(
        bytes32 userId,
        uint256 uploadDelta,
        uint256 downloadDelta
    ) external onlyTracker {
        User storage user = users[userId];
        require(user.publicKey != address(0), "User not registered");
        require(user.active, "User not active");

        user.uploaded += uploadDelta;
        user.downloaded += downloadDelta;

        emit ReputationUpdated(userId, user.uploaded, user.downloaded);
    }

    /**
     * @notice Batch update reputations (gas efficient for multiple updates)
     * @param userIds Array of user IDs
     * @param uploadDeltas Array of upload deltas
     * @param downloadDeltas Array of download deltas
     */
    function batchUpdateReputation(
        bytes32[] calldata userIds,
        uint256[] calldata uploadDeltas,
        uint256[] calldata downloadDeltas
    ) external onlyTracker {
        require(
            userIds.length == uploadDeltas.length && userIds.length == downloadDeltas.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < userIds.length; i++) {
            User storage user = users[userIds[i]];
            if (user.publicKey != address(0) && user.active) {
                user.uploaded += uploadDeltas[i];
                user.downloaded += downloadDeltas[i];
                emit ReputationUpdated(userIds[i], user.uploaded, user.downloaded);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Get user's reputation score (ratio * 100)
     * @dev Returns MAX_UINT256 if no downloads (infinite ratio)
     */
    function getReputation(bytes32 userId) external view returns (uint256) {
        User storage user = users[userId];
        if (user.downloaded == 0) {
            return type(uint256).max; // Infinite ratio
        }
        return (user.uploaded * 100) / user.downloaded;
    }

    /**
     * @notice Check if user meets minimum reputation requirement
     */
    function meetsMinReputation(bytes32 userId) external view returns (bool) {
        User storage user = users[userId];
        if (!user.active) return false;
        if (user.downloaded == 0) return true; // No downloads = infinite ratio
        return (user.uploaded * 100) / user.downloaded >= MIN_REPUTATION;
    }

    /**
     * @notice Get user by address
     */
    function getUserByAddress(address addr) external view returns (
        bytes32 userId,
        uint256 uploaded,
        uint256 downloaded,
        bool active
    ) {
        userId = addressToUserId[addr];
        User storage user = users[userId];
        return (userId, user.uploaded, user.downloaded, user.active);
    }

    /**
     * @notice Verify user owns their registered key (for peer auth)
     */
    function verifyUserSignature(
        bytes32 userId,
        bytes32 messageHash,
        bytes calldata signature
    ) external view returns (bool) {
        User storage user = users[userId];
        if (user.publicKey == address(0)) return false;

        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        address recovered = recoverSigner(ethSignedHash, signature);
        return recovered == user.publicKey;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update tracker address (for migration)
     * @dev Should be protected by multi-sig in production
     */
    function setTracker(address _newTracker) external {
        require(msg.sender == tracker, "Only current tracker");
        address oldTracker = tracker;
        tracker = _newTracker;
        emit TrackerUpdated(oldTracker, _newTracker);
    }

    /**
     * @notice Deactivate a user (for moderation)
     */
    function deactivateUser(bytes32 userId) external onlyTracker {
        users[userId].active = false;
        emit UserDeactivated(userId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════

    function recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "Invalid signature v value");
        return ecrecover(hash, v, r, s);
    }
}

