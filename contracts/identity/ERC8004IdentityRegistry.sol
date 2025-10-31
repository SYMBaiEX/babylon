// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ERC8004IdentityRegistry
/// @notice ERC-8004 compliant identity registry for AI agents
/// @dev Each agent gets a unique NFT representing their identity
contract ERC8004IdentityRegistry is ERC721, Ownable {
    struct AgentProfile {
        string name;
        string endpoint; // A2A endpoint URL
        bytes32 capabilitiesHash; // Hash of agent capabilities
        uint256 registeredAt;
        bool isActive;
        string metadata; // JSON metadata
    }

    mapping(uint256 => AgentProfile) public profiles;
    mapping(address => uint256) public addressToTokenId;
    mapping(string => bool) public endpointTaken;

    uint256 private _nextTokenId = 1;

    event AgentRegistered(uint256 indexed tokenId, address indexed owner, string name, string endpoint);
    event AgentUpdated(uint256 indexed tokenId, string endpoint, bytes32 capabilitiesHash);
    event AgentDeactivated(uint256 indexed tokenId);
    event AgentReactivated(uint256 indexed tokenId);

    constructor() ERC721("BabylonAgent", "BAGENT") Ownable(msg.sender) {}

    /// @notice Register a new AI agent
    /// @param _name Agent name
    /// @param _endpoint A2A endpoint URL
    /// @param _capabilitiesHash Hash of capabilities
    /// @param _metadata JSON metadata string
    /// @return tokenId The minted token ID
    function registerAgent(
        string calldata _name,
        string calldata _endpoint,
        bytes32 _capabilitiesHash,
        string calldata _metadata
    ) external returns (uint256 tokenId) {
        require(addressToTokenId[msg.sender] == 0, "Already registered");
        require(!endpointTaken[_endpoint], "Endpoint already taken");
        require(bytes(_name).length > 0, "Name required");
        require(bytes(_endpoint).length > 0, "Endpoint required");

        tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        profiles[tokenId] = AgentProfile({
            name: _name,
            endpoint: _endpoint,
            capabilitiesHash: _capabilitiesHash,
            registeredAt: block.timestamp,
            isActive: true,
            metadata: _metadata
        });

        addressToTokenId[msg.sender] = tokenId;
        endpointTaken[_endpoint] = true;

        emit AgentRegistered(tokenId, msg.sender, _name, _endpoint);
    }

    /// @notice Update agent profile
    /// @param _endpoint New endpoint
    /// @param _capabilitiesHash New capabilities hash
    /// @param _metadata New metadata
    function updateAgent(
        string calldata _endpoint,
        bytes32 _capabilitiesHash,
        string calldata _metadata
    ) external {
        uint256 tokenId = addressToTokenId[msg.sender];
        require(tokenId != 0, "Not registered");
        require(ownerOf(tokenId) == msg.sender, "Not owner");

        AgentProfile storage profile = profiles[tokenId];

        // Update endpoint if changed
        if (keccak256(bytes(_endpoint)) != keccak256(bytes(profile.endpoint))) {
            require(!endpointTaken[_endpoint], "Endpoint taken");
            endpointTaken[profile.endpoint] = false;
            endpointTaken[_endpoint] = true;
            profile.endpoint = _endpoint;
        }

        profile.capabilitiesHash = _capabilitiesHash;
        profile.metadata = _metadata;

        emit AgentUpdated(tokenId, _endpoint, _capabilitiesHash);
    }

    /// @notice Deactivate agent
    function deactivateAgent() external {
        uint256 tokenId = addressToTokenId[msg.sender];
        require(tokenId != 0, "Not registered");
        require(ownerOf(tokenId) == msg.sender, "Not owner");

        profiles[tokenId].isActive = false;
        emit AgentDeactivated(tokenId);
    }

    /// @notice Reactivate agent
    function reactivateAgent() external {
        uint256 tokenId = addressToTokenId[msg.sender];
        require(tokenId != 0, "Not registered");
        require(ownerOf(tokenId) == msg.sender, "Not owner");

        profiles[tokenId].isActive = true;
        emit AgentReactivated(tokenId);
    }

    /// @notice Get agent profile
    function getAgentProfile(uint256 _tokenId) external view returns (
        string memory name,
        string memory endpoint,
        bytes32 capabilitiesHash,
        uint256 registeredAt,
        bool isActive,
        string memory metadata
    ) {
        AgentProfile storage profile = profiles[_tokenId];
        return (
            profile.name,
            profile.endpoint,
            profile.capabilitiesHash,
            profile.registeredAt,
            profile.isActive,
            profile.metadata
        );
    }

    /// @notice Check if address is a registered agent
    function isRegistered(address _address) external view returns (bool) {
        return addressToTokenId[_address] != 0;
    }

    /// @notice Get token ID for address
    function getTokenId(address _address) external view returns (uint256) {
        return addressToTokenId[_address];
    }

    /// @notice Verify agent ownership
    function verifyAgent(address _address, uint256 _tokenId) external view returns (bool) {
        return addressToTokenId[_address] == _tokenId && ownerOf(_tokenId) == _address;
    }

    /// @notice Get all active agent token IDs
    function getAllActiveAgents() external view returns (uint256[] memory) {
        uint256[] memory activeAgents = new uint256[](_nextTokenId - 1);
        uint256 count = 0;
        
        for (uint256 i = 1; i < _nextTokenId; i++) {
            if (profiles[i].isActive && ownerOf(i) != address(0)) {
                activeAgents[count] = i;
                count++;
            }
        }
        
        // Resize array to actual count
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = activeAgents[i];
        }
        
        return result;
    }

    /// @notice Check if endpoint is active
    function isEndpointActive(string memory endpoint) external view returns (bool) {
        if (!endpointTaken[endpoint]) return false;
        
        // Find token ID with this endpoint
        for (uint256 i = 1; i < _nextTokenId; i++) {
            if (keccak256(bytes(profiles[i].endpoint)) == keccak256(bytes(endpoint))) {
                return profiles[i].isActive && ownerOf(i) != address(0);
            }
        }
        
        return false;
    }

    /// @notice Get agents by capability hash
    function getAgentsByCapability(bytes32 capabilityHash) external view returns (uint256[] memory) {
        uint256[] memory matchingAgents = new uint256[](_nextTokenId - 1);
        uint256 count = 0;
        
        for (uint256 i = 1; i < _nextTokenId; i++) {
            if (profiles[i].capabilitiesHash == capabilityHash && profiles[i].isActive && ownerOf(i) != address(0)) {
                matchingAgents[count] = i;
                count++;
            }
        }
        
        // Resize array to actual count
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = matchingAgents[i];
        }
        
        return result;
    }

    /// @notice Override transfer to update address mapping
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Update address mapping on transfer
        if (from != address(0)) {
            addressToTokenId[from] = 0;
        }
        if (to != address(0)) {
            addressToTokenId[to] = tokenId;
        }

        return from;
    }
}
