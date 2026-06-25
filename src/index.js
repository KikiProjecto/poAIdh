/**
 * POIDH Autonomous Bounty Bot
 * Fully autonomous bounty creator, monitor, evaluator, and payout executor.
 * No human intervention required after deployment.
 */

require('dotenv').config();
const { createBounty } = require('./bounty');
const { monitorSubmissions } = require('./monitor');
const { evaluateSubmissions } = require('./evaluator');
const { executeWinnerPayout } = require('./payout');
const { postDecisionToSocial } = require('./social');
const { log, loadState, saveState } = require('./utils');

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000'); // 1 min default
const BOUNTY_DURATION_HOURS = parseInt(process.env.BOUNTY_DURATION_HOURS || '48');

async function main() {
  log('🤖 POIDH Autonomous Bot starting...');

  let state = loadState();

  // Phase 1: Create bounty if we don't have one yet
  if (!state.bountyId) {
    log('📋 No active bounty — creating a new one...');
    const result = await createBounty();
    state.bountyId = result.bountyId;
    state.bountyTx = result.txHash;
    state.createdAt = Date.now();
    state.phase = 'monitoring';
    saveState(state);
    log(`✅ Bounty created. ID: ${state.bountyId} | TX: ${state.bountyTx}`);
  }

  // Phase 2: Monitor and evaluate
  if (state.phase === 'monitoring') {
    log(`👀 Monitoring bounty #${state.bountyId} for submissions...`);
    const deadline = state.createdAt + BOUNTY_DURATION_HOURS * 60 * 60 * 1000;

    while (Date.now() < deadline) {
      const submissions = await monitorSubmissions(state.bountyId);
      log(`📥 Found ${submissions.length} submission(s).`);

      if (submissions.length > 0) {
        const evaluation = await evaluateSubmissions(submissions);
        log(`🧠 Evaluation complete. Winner: Claim #${evaluation.winner.claimId}`);

        if (evaluation.confident) {
          state.winner = evaluation.winner;
          state.evaluation = evaluation;
          state.phase = 'payout';
          saveState(state);
          break;
        }
      }

      await sleep(POLL_INTERVAL_MS);
    }

    // If deadline passed with submissions but no confident winner, pick best
    if (state.phase === 'monitoring') {
      const submissions = await monitorSubmissions(state.bountyId);
      if (submissions.length > 0) {
        const evaluation = await evaluateSubmissions(submissions, { forceSelect: true });
        state.winner = evaluation.winner;
        state.evaluation = evaluation;
        state.phase = 'payout';
        saveState(state);
      } else {
        log('⏰ Deadline passed with no submissions. Cancelling bounty.');
        const { cancelBounty } = require('./payout');
        await cancelBounty(state.bountyId);
        state.phase = 'cancelled';
        saveState(state);
        return;
      }
    }
  }

  // Phase 3: Execute payout
  if (state.phase === 'payout') {
    log(`💸 Executing payout to winner claim #${state.winner.claimId}...`);
    const payoutResult = await executeWinnerPayout(state.bountyId, state.winner.claimId);
    state.payoutTx = payoutResult.txHash;
    state.phase = 'social';
    saveState(state);
    log(`✅ Payout executed. TX: ${state.payoutTx}`);
  }

  // Phase 4: Post to social media
  if (state.phase === 'social') {
    log('📣 Posting decision to social media...');
    await postDecisionToSocial({
      bountyId: state.bountyId,
      winner: state.winner,
      evaluation: state.evaluation,
      payoutTx: state.payoutTx,
    });
    state.phase = 'complete';
    saveState(state);
    log('🎉 Bot run complete!');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  log(`❌ Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
