/**
 * contract.js
 * POIDH smart contract ABI and interaction helpers.
 * Supports both solo bounties (acceptClaim) and open bounties (vote flow).
 */

const { ethers } = require('ethers');
const { getWallet, getChainConfig } = require('./wallet');

// Minimal ABI covering all functions the bot needs
const POIDH_ABI = [
  // Create solo bounty
  "function createSoloBounty(string name, string description) external payable returns (uint256)",
  // Create open bounty
  "function createOpenBounty(string name, string description) external payable returns (uint256)",
  // Accept a claim (solo bounty — bounty creator calls this)
  "function acceptClaim(uint256 bountyId, uint256 claimId) external",
  // Vote on a claim (open bounty)
  "function voteClaim(uint256 bountyId, uint256 claimId) external",
  // Cancel a bounty and reclaim funds
  "function cancelBounty(uint256 bountyId) external",
  // View functions
  "function getBounty(uint256 bountyId) external view returns (tuple(uint256 id, address issuer, string name, string description, uint256 amount, bool claimed, uint256 claimsLength, uint256 createdAt))",
  "function getClaim(uint256 bountyId, uint256 claimIndex) external view returns (tuple(uint256 id, address issuer, string name, string description, uint256 createdAt))",
  // Events
  "event BountyCreated(uint256 indexed bountyId, address indexed issuer, uint256 amount)",
  "event ClaimCreated(uint256 indexed bountyId, uint256 indexed claimId, address indexed issuer)",
  "event ClaimAccepted(uint256 indexed bountyId, uint256 indexed claimId)",
];

let _contract = null;

/**
 * Get or create the contract instance (with signer for write operations)
 */
function getContract() {
  if (_contract) return _contract;
  const wallet = getWallet();
  const { contractAddress } = getChainConfig();
  if (!contractAddress) throw new Error('Contract address not configured for this chain');
  _contract = new ethers.Contract(contractAddress, POIDH_ABI, wallet);
  return _contract;
}

/**
 * Get a read-only contract instance (no signer needed)
 */
function getReadContract() {
  const { getProvider } = require('./wallet');
  const { contractAddress } = getChainConfig();
  return new ethers.Contract(contractAddress, POIDH_ABI, getProvider());
}

module.exports = { getContract, getReadContract, POIDH_ABI };
