/**
 * social.js
 * Posts the bot's winning decision to X (Twitter) and/or Farcaster.
 * Explains reasoning publicly and can respond to follow-up questions.
 */

const { log } = require('./utils');
const { getChainConfig } = require('./wallet');

/**
 * Post the winning decision and reasoning to social media.
 * Supports X (via Twitter API v2) and Farcaster (via Neynar API).
 *
 * @param {{ bountyId, winner, evaluation, payoutTx }} params
 */
async function postDecisionToSocial({ bountyId, winner, evaluation, payoutTx }) {
  const chain = getChainConfig();
  const txUrl = `${chain.blockExplorer}/tx/${payoutTx}`;
  const bountyUrl = `https://poidh.xyz/bounty/${bountyId}`;

  const tweetText = buildTweetText({ bountyId, winner, evaluation, txUrl, bountyUrl });

  const posted = [];

  if (process.env.X_BEARER_TOKEN && process.env.X_API_KEY) {
    try {
      const result = await postToX(tweetText);
      posted.push({ platform: 'X', id: result.id, url: `https://x.com/i/web/status/${result.id}` });
      log(`📣 Posted to X: https://x.com/i/web/status/${result.id}`);

      // Post detailed thread
      const detailText = buildDetailThread({ winner, evaluation });
      await postToX(detailText, result.id);
    } catch (e) {
      log(`⚠️  X post failed: ${e.message}`);
    }
  }

  if (process.env.NEYNAR_API_KEY && process.env.FARCASTER_SIGNER_UUID) {
    try {
      const result = await postToFarcaster(tweetText);
      posted.push({ platform: 'Farcaster', hash: result.cast?.hash });
      log(`📣 Posted to Farcaster: ${result.cast?.hash}`);
    } catch (e) {
      log(`⚠️  Farcaster post failed: ${e.message}`);
    }
  }

  if (posted.length === 0) {
    log('⚠️  No social credentials configured. Decision logged to console only.');
    log('\n--- SOCIAL DECISION POST ---');
    log(tweetText);
    log('--- END ---\n');
  }

  return posted;
}

/**
 * Build the main announcement tweet (≤280 chars).
 */
function buildTweetText({ bountyId, winner, evaluation, txUrl, bountyUrl }) {
  const score = winner.score.total;
  const claimId = winner.claimId;
  const shortAddr = `${winner.issuer.slice(0, 6)}...${winner.issuer.slice(-4)}`;

  return (
    `🤖 POIDH Bot Decision\n\n` +
    `Bounty #${bountyId} is complete!\n` +
    `Winner: Claim #${claimId} by ${shortAddr}\n` +
    `Score: ${score}/100\n\n` +
    `Reason: ${winner.score.aiReasoning?.slice(0, 80)}...\n\n` +
    `Payout TX: ${txUrl}\n` +
    `Bounty: ${bountyUrl}\n\n` +
    `#poidh #crypto #autonomousAI`
  ).slice(0, 280);
}

/**
 * Build a detailed follow-up thread post with full scoring breakdown.
 */
function buildDetailThread({ winner, evaluation }) {
  return (
    `📊 Full Scoring Breakdown (Claim #${winner.claimId}):\n\n` +
    `• Media present: ${winner.score.mediaPresent}/30\n` +
    `• Description relevance: ${winner.score.descriptionRelevance}/30\n` +
    `• Visual quality: ${winner.score.visualQuality}/25\n` +
    `• Recency bonus: ${winner.score.recencyBonus}/10\n` +
    `• Detail score: ${winner.score.descriptionDetail}/5\n\n` +
    `Total: ${winner.score.total}/100\n\n` +
    `AI Reasoning: ${winner.score.aiReasoning}`
  ).slice(0, 280);
}

/**
 * Post to X (Twitter) using OAuth 1.0a via Twitter API v2.
 */
async function postToX(text, replyToId = null) {
  const { TwitterApi } = require('twitter-api-v2');

  const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  });

  const payload = { text };
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };

  const result = await client.v2.tweet(payload);
  return result.data;
}

/**
 * Post to Farcaster using Neynar API.
 */
async function postToFarcaster(text) {
  const res = await fetch('https://api.neynar.com/v2/farcaster/cast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': process.env.NEYNAR_API_KEY,
    },
    body: JSON.stringify({
      signer_uuid: process.env.FARCASTER_SIGNER_UUID,
      text,
      channel_id: 'poidh',
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Neynar API error: ${res.status}`);
  return res.json();
}

module.exports = { postDecisionToSocial };
