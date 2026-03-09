/**
 * bounty.js
 * Creates real-world-action bounties on POIDH autonomously.
 * Bounty ideas are drawn from a curated set of IRL photo/video tasks.
 */

const { ethers } = require('ethers');
const { getContract } = require('./contract');
const { getGasPrice } = require('./wallet');
const { log } = require('./utils');

// A rotating set of IRL bounties the bot can create
const BOUNTY_TEMPLATES = [
  {
    name: 'Sunrise Photo Challenge',
    description:
      'Take a photo of a sunrise with a timestamp clearly visible (phone clock or newspaper). The photo must show the sun above the horizon. Post as your claim submission. Winner selected based on clearest proof and most compelling composition.',
  },
  {
    name: 'Random Act of Kindness',
    description:
      'Perform a random act of kindness for a stranger and document it with a photo or short video. Must show both you and the recipient (with their permission). Describe what you did in the claim text.',
  },
  {
    name: 'Local Park Cleanup',
    description:
      'Spend 15+ minutes picking up litter at a public park. Submit a before/after photo pair showing the area you cleaned. Bonus points for showing a full trash bag as proof of effort.',
  },
  {
    name: 'Public Library Visit',
    description:
      'Visit a public library and take a selfie with a book you checked out or read there. Include the library name and book title in your claim description.',
  },
  {
    name: 'Farmer\'s Market Find',
    description:
      'Visit a local farmer\'s market and photograph the most interesting or unusual produce/item you find. Include the vendor\'s name and item description in your claim.',
  },
];

/**
 * Pick a bounty template (cycles through them, or picks randomly)
 */
function selectBountyTemplate() {
  const index = Math.floor(Math.random() * BOUNTY_TEMPLATES.length);
  return BOUNTY_TEMPLATES[index];
}

/**
 * Create a solo bounty on POIDH with a real-world action requirement.
 * The bot funds the bounty from its own wallet.
 *
 * @returns {{ bountyId: string, txHash: string }}
 */
async function createBounty() {
  const contract = getContract();
  const template = selectBountyTemplate();
  const feeData = await getGasPrice();

  const bountyAmountEth = process.env.BOUNTY_AMOUNT_ETH || '0.002'; // ~$5–6
  const bountyAmountWei = ethers.parseEther(bountyAmountEth);

  log(`🎯 Selected bounty: "${template.name}"`);
  log(`💰 Funding bounty with ${bountyAmountEth} ETH`);

  const tx = await contract.createSoloBounty(template.name, template.description, {
    value: bountyAmountWei,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  });

  log(`⏳ Waiting for confirmation... TX: ${tx.hash}`);
  const receipt = await tx.wait(2); // Wait for 2 confirmations

  // Extract bountyId from BountyCreated event
  const iface = contract.interface;
  let bountyId = null;
  for (const log_ of receipt.logs) {
    try {
      const parsed = iface.parseLog(log_);
      if (parsed && parsed.name === 'BountyCreated') {
        bountyId = parsed.args.bountyId.toString();
        break;
      }
    } catch (_) {}
  }

  if (!bountyId) throw new Error('Could not parse bountyId from transaction logs');

  return { bountyId, txHash: tx.hash, template };
}

module.exports = { createBounty, BOUNTY_TEMPLATES };
