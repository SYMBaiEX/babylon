// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GameTreasury
 * @notice Manages funds for the permissionless AI game
 * @dev Holds operational funds, tracks state, handles operator payments
 */
contract GameTreasury is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COUNCIL_ROLE = keccak256("COUNCIL_ROLE");

    // State tracking
    string public currentStateCID;
    bytes32 public currentStateHash;
    uint256 public stateVersion;
    uint256 public keyVersion;
    uint256 public lastHeartbeat;
    
    // Operator management
    address public operator;
    bytes public operatorAttestation;
    uint256 public operatorRegisteredAt;
    
    // Withdrawal limits (daily)
    uint256 public dailyWithdrawalLimit;
    uint256 public withdrawnToday;
    uint256 public lastWithdrawalDay;
    
    // Heartbeat timeout (e.g., 1 hour)
    uint256 public heartbeatTimeout = 1 hours;
    
    // Training tracking
    uint256 public trainingEpoch;
    
    // Events
    event OperatorRegistered(address indexed operator, bytes attestation);
    event OperatorDeactivated(address indexed operator, string reason);
    event StateUpdated(string cid, bytes32 hash, uint256 version);
    event HeartbeatReceived(address indexed operator, uint256 timestamp);
    event FundsWithdrawn(address indexed operator, uint256 amount);
    event FundsDeposited(address indexed depositor, uint256 amount);
    event KeyRotationInitiated(uint256 newVersion, address indexed initiator);
    event TrainingRecorded(uint256 epoch, string datasetCID, bytes32 modelHash);
    event DailyLimitUpdated(uint256 newLimit);

    constructor(uint256 _dailyLimit) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(COUNCIL_ROLE, msg.sender);
        dailyWithdrawalLimit = _dailyLimit;
        keyVersion = 1;
    }

    // =========================================================================
    // Funding
    // =========================================================================

    /**
     * @notice Deposit funds into treasury
     */
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Explicit deposit function
     */
    function deposit() external payable {
        require(msg.value > 0, "Must deposit something");
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Get treasury balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // =========================================================================
    // Operator Management
    // =========================================================================

    /**
     * @notice Register a new TEE operator
     * @param _operator Address derived inside TEE
     * @param _attestation Remote attestation proof
     */
    function registerOperator(
        address _operator,
        bytes calldata _attestation
    ) external onlyRole(COUNCIL_ROLE) {
        require(_operator != address(0), "Invalid operator");
        require(
            operator == address(0) || !isOperatorActive(),
            "Active operator exists"
        );

        // Revoke old operator if exists
        if (operator != address(0)) {
            _revokeRole(OPERATOR_ROLE, operator);
        }

        operator = _operator;
        operatorAttestation = _attestation;
        operatorRegisteredAt = block.timestamp;
        lastHeartbeat = block.timestamp;

        _grantRole(OPERATOR_ROLE, _operator);

        emit OperatorRegistered(_operator, _attestation);
    }

    /**
     * @notice Check if operator is active (sent heartbeat recently)
     */
    function isOperatorActive() public view returns (bool) {
        if (operator == address(0)) return false;
        return block.timestamp - lastHeartbeat <= heartbeatTimeout;
    }

    /**
     * @notice Mark operator as inactive (can be called by anyone after timeout)
     */
    function markOperatorInactive() external {
        require(operator != address(0), "No operator");
        require(!isOperatorActive(), "Operator still active");

        address oldOperator = operator;
        _revokeRole(OPERATOR_ROLE, oldOperator);
        operator = address(0);

        emit OperatorDeactivated(oldOperator, "heartbeat_timeout");
    }

    // =========================================================================
    // Game State Management
    // =========================================================================

    /**
     * @notice Update game state (TEE only)
     * @param _cid IPFS CID of encrypted state
     * @param _hash Hash of the state for integrity
     */
    function updateState(
        string calldata _cid,
        bytes32 _hash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        currentStateCID = _cid;
        currentStateHash = _hash;
        stateVersion++;
        lastHeartbeat = block.timestamp;

        emit StateUpdated(_cid, _hash, stateVersion);
    }

    /**
     * @notice Send heartbeat to prove liveness
     */
    function heartbeat() external onlyRole(OPERATOR_ROLE) {
        lastHeartbeat = block.timestamp;
        emit HeartbeatReceived(msg.sender, block.timestamp);
    }

    /**
     * @notice Record a training cycle
     * @param _datasetCID Public IPFS CID of training data
     * @param _modelHash Hash of the updated model
     */
    function recordTraining(
        string calldata _datasetCID,
        bytes32 _modelHash
    ) external onlyRole(OPERATOR_ROLE) {
        trainingEpoch++;
        emit TrainingRecorded(trainingEpoch, _datasetCID, _modelHash);
    }

    // =========================================================================
    // Withdrawals (Rate Limited)
    // =========================================================================

    /**
     * @notice Withdraw funds for operational costs
     * @param _amount Amount to withdraw
     */
    function withdraw(
        uint256 _amount
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be positive");
        require(address(this).balance >= _amount, "Insufficient balance");

        // Reset daily counter if new day
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastWithdrawalDay) {
            withdrawnToday = 0;
            lastWithdrawalDay = currentDay;
        }

        require(
            withdrawnToday + _amount <= dailyWithdrawalLimit,
            "Exceeds daily limit"
        );

        withdrawnToday += _amount;

        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "Transfer failed");

        emit FundsWithdrawn(msg.sender, _amount);
    }

    // =========================================================================
    // Key Rotation (Council Only)
    // =========================================================================

    /**
     * @notice Initiate key rotation
     */
    function initiateKeyRotation() external onlyRole(COUNCIL_ROLE) {
        keyVersion++;
        emit KeyRotationInitiated(keyVersion, msg.sender);
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /**
     * @notice Update daily withdrawal limit
     */
    function setDailyLimit(
        uint256 _newLimit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        dailyWithdrawalLimit = _newLimit;
        emit DailyLimitUpdated(_newLimit);
    }

    /**
     * @notice Update heartbeat timeout
     */
    function setHeartbeatTimeout(
        uint256 _timeout
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        heartbeatTimeout = _timeout;
    }

    /**
     * @notice Add council member
     */
    function addCouncilMember(
        address _member
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(COUNCIL_ROLE, _member);
    }

    /**
     * @notice Remove council member
     */
    function removeCouncilMember(
        address _member
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(COUNCIL_ROLE, _member);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(COUNCIL_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(COUNCIL_ROLE) {
        _unpause();
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    /**
     * @notice Get current game state info
     */
    function getGameState()
        external
        view
        returns (
            string memory cid,
            bytes32 hash,
            uint256 version,
            uint256 keyVer,
            uint256 lastBeat,
            bool operatorActive
        )
    {
        return (
            currentStateCID,
            currentStateHash,
            stateVersion,
            keyVersion,
            lastHeartbeat,
            isOperatorActive()
        );
    }

    /**
     * @notice Get operator info
     */
    function getOperatorInfo()
        external
        view
        returns (
            address op,
            bytes memory attestation,
            uint256 registeredAt,
            bool active
        )
    {
        return (
            operator,
            operatorAttestation,
            operatorRegisteredAt,
            isOperatorActive()
        );
    }
}

