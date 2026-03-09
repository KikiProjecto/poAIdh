/**
 * payout.js
 * Executes the on-chain winner payout via acceptClaim (solo bounty).
 * Also handles open bounty vote flow and bounty cancellation.
 * NO MANUAL SIGNING — the bot's EOA wallet signs automatically.
 */

const { ethers } = require('ethers');
const { getContract } = require('./contract');
const { getGasPrice } = require('./wallet');
const { log } = require('./utils');

/**
 * Execute the acceptClaim transaction to pay the winner.
 * This transfers escrowed funds to the winning claimant.
 *
 * @param {string} bountyId
 * @param {string} claimId
 * @returns {{ txHash: string }}
 */
async function executeWinnerPayout(bountyId, claimId) {
  const contract = getContract();
  const feeData = await getGasPrice();

  log(`💸 Calling acceptClaim(bountyId=${bountyId}, claimId=${claimId})...`);

  const tx = await contract.acceptClaim(BigInt(bountyId), BigInt(claimId), {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  });

  log(`⏳ Payout transaction submitted: ${tx.hash}`);
  const receipt = await tx.wait(2);

  log(`✅ Payout confirmed in block ${receipt.blockNumber}`);

  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

/**
 * Vote on a claim in an open bounty.
 * Required if the bounty was created as an open bounty (community-voted).
 *
 * @param {string} bountyId
 * @param {string} claimId
 * @returns {{ txHash: string }}
 */
async function voteForClaim(bountyId, claimId) {
  const contract = getContract();
  const feeData = await getGasPrice();

  log(`🗳️  Voting for claim #${claimId} on open bounty #${bountyId}...`);

  const tx = await contract.voteClaim(BigInt(bountyId), BigInt(claimId), {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  });

  const receipt = await tx.wait(2);
  log(`✅ Vote confirmed: ${tx.hash}`);
  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

/**
 * Cancel a bounty and reclaim funds if no valid submissions were received.
 *
 * @param {string} bountyId
 * @returns {{ txHash: string }}
 */
async function cancelBounty(bountyId) {
  const contract = getContract();
  const feeData = await getGasPrice();

  log(`❌ Cancelling bounty #${bountyId} and reclaiming funds...`);

  const tx = await contract.cancelBounty(BigInt(bountyId), {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  });

  const receipt = await tx.wait(2);
  log(`✅ Bounty cancelled: ${tx.hash}`);
  return { txHash: tx.hash };
}

module.exports = { executeWinnerPayout, voteForClaim, cancelBounty };
