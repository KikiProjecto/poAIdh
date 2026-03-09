/**
 * monitor.js
 * Monitors the POIDH contract for new claim submissions on a bounty.
 * Polls both on-chain events and the POIDH subgraph/API for claim metadata.
 */

const { ethers } = require('ethers');
const { getReadContract } = require('./contract');
const { getProvider, getChainConfig } = require('./wallet');
const { log } = require('./utils');

const POIDH_API_BASE = process.env.POIDH_API_BASE || 'https://poidh.xyz/api';

/**
 * Fetch all claims for a bounty by scanning ClaimCreated events on-chain,
 * then enriching with POIDH API data (IPFS metadata, image URLs).
 *
 * @param {string} bountyId
 * @returns {Array<Claim>}
 */
async function monitorSubmissions(bountyId) {
  const contract = getReadContract();
  const provider = getProvider();

  // Get current block for range query
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 200000); // ~30 days on Arbitrum

  log(`🔍 Scanning blocks ${fromBlock}–${latestBlock} for claims on bounty #${bountyId}`);

  // Query ClaimCreated events
  const filter = contract.filters.ClaimCreated(BigInt(bountyId));
  const events = await contract.queryFilter(filter, fromBlock, latestBlock);

  const claims = [];

  for (const event of events) {
    const claimId = event.args.claimId.toString();
    const issuer = event.args.issuer;

    // Try to fetch claim details from chain
    let claimData = null;
    try {
      const bountyIdBig = BigInt(bountyId);
      // Get the bounty to find claim count, then iterate
      const bounty = await contract.getBounty(bountyIdBig);
      for (let i = 0; i < bounty.claimsLength; i++) {
        const c = await contract.getClaim(bountyIdBig, i);
        if (c.id.toString() === claimId) {
          claimData = c;
          break;
        }
      }
    } catch (e) {
      log(`⚠️  Could not fetch claim data for claim #${claimId}: ${e.message}`);
    }

    // Enrich with POIDH API if available
    const apiData = await fetchClaimFromAPI(bountyId, claimId);

    claims.push({
      claimId,
      issuer,
      name: claimData?.name || apiData?.name || `Claim #${claimId}`,
      description: claimData?.description || apiData?.description || '',
      imageUrl: apiData?.imageUrl || null,
      videoUrl: apiData?.videoUrl || null,
      createdAt: claimData?.createdAt?.toString() || null,
      rawApiData: apiData,
    });
  }

  return claims;
}

/**
 * Try to fetch claim metadata from POIDH's public API.
 * Returns null if unavailable (bot continues with on-chain data).
 */
async function fetchClaimFromAPI(bountyId, claimId) {
  try {
    const url = `${POIDH_API_BASE}/bounties/${bountyId}/claims/${claimId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

/**
 * Monitor using POIDH public REST API as primary source (faster than event scanning).
 * Falls back to on-chain if API is unavailable.
 */
async function monitorSubmissionsViaAPI(bountyId) {
  try {
    const url = `${POIDH_API_BASE}/bounties/${bountyId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    const claims = (data.claims || []).map(c => ({
      claimId: c.id?.toString(),
      issuer: c.issuer,
      name: c.name,
      description: c.description,
      imageUrl: c.imageUrl || c.image || null,
      videoUrl: c.videoUrl || null,
      createdAt: c.createdAt,
      rawApiData: c,
    }));
    log(`📡 API returned ${claims.length} claims for bounty #${bountyId}`);
    return claims;
  } catch (e) {
    log(`⚠️  API unavailable (${e.message}), falling back to on-chain scan`);
    return monitorSubmissions(bountyId);
  }
}

module.exports = { monitorSubmissions, monitorSubmissionsViaAPI };
