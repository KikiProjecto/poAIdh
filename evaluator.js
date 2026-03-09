/**
 * evaluator.js
 * Evaluates claim submissions using Claude AI vision + deterministic scoring.
 * Produces a transparent, auditable score for each claim.
 *
 * Scoring rubric (deterministic + AI):
 *   1. Image/media present           → 0 or 30 pts (required)
 *   2. Description relevance to task → 0–30 pts (AI)
 *   3. Visual proof quality          → 0–25 pts (AI vision)
 *   4. Submission recency (earlier = small bonus) → 0–10 pts
 *   5. Description length/detail     → 0–5 pts (deterministic)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { log } = require('./utils');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MIN_CONFIDENCE_SCORE = 50; // Out of 100

/**
 * Evaluate all submissions and return ranked results with the winner.
 *
 * @param {Array} submissions - List of claim objects from monitor.js
 * @param {{ forceSelect: boolean }} options
 * @returns {{ winner, rankedClaims, reasoning, confident }}
 */
async function evaluateSubmissions(submissions, options = {}) {
  const { forceSelect = false } = options;

  log(`🧠 Evaluating ${submissions.length} submission(s)...`);

  const scoredClaims = [];

  for (const claim of submissions) {
    const score = await scoreClaim(claim);
    scoredClaims.push({ ...claim, score });
    log(`  📊 Claim #${claim.claimId} by ${claim.issuer}: ${score.total}/100 pts`);
  }

  // Sort by total score descending
  scoredClaims.sort((a, b) => b.score.total - a.score.total);

  const winner = scoredClaims[0];
  const confident = forceSelect || winner.score.total >= MIN_CONFIDENCE_SCORE;

  const reasoning = buildReasoning(winner, scoredClaims);

  return {
    winner,
    rankedClaims: scoredClaims,
    reasoning,
    confident,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Score a single claim using both deterministic rules and AI evaluation.
 */
async function scoreClaim(claim) {
  const breakdown = {
    mediaPresent: 0,       // max 30
    descriptionRelevance: 0, // max 30
    visualQuality: 0,      // max 25
    recencyBonus: 0,       // max 10
    descriptionDetail: 0,  // max 5
  };

  // 1. Deterministic: media present
  if (claim.imageUrl || claim.videoUrl) {
    breakdown.mediaPresent = 30;
  }

  // 2. Deterministic: description detail
  const descLen = (claim.description || '').length;
  breakdown.descriptionDetail = Math.min(5, Math.floor(descLen / 40));

  // 3. Recency bonus (earlier submissions get slightly more)
  if (claim.createdAt) {
    const ts = parseInt(claim.createdAt) * 1000;
    const ageHours = (Date.now() - ts) / (1000 * 60 * 60);
    breakdown.recencyBonus = Math.max(0, 10 - Math.floor(ageHours / 5));
  }

  // 4. AI evaluation: description relevance + visual quality
  const aiScores = await aiEvaluateClaim(claim);
  breakdown.descriptionRelevance = aiScores.relevance;
  breakdown.visualQuality = aiScores.visualQuality;

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { ...breakdown, total, aiReasoning: aiScores.reasoning };
}

/**
 * Use Claude to evaluate a claim's description relevance and visual quality.
 * Returns { relevance (0-30), visualQuality (0-25), reasoning }
 */
async function aiEvaluateClaim(claim) {
  const prompt = buildEvaluationPrompt(claim);

  const messages = [{ role: 'user', content: prompt }];

  // If there's an image URL, include it as a vision input
  if (claim.imageUrl) {
    try {
      const imageData = await fetchImageAsBase64(claim.imageUrl);
      if (imageData) {
        messages[0].content = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.mimeType,
              data: imageData.data,
            },
          },
          { type: 'text', text: prompt },
        ];
      }
    } catch (e) {
      log(`  ⚠️  Could not load image for AI vision: ${e.message}`);
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 500,
      system: `You are an impartial bounty judge. Evaluate claim submissions for real-world bounties.
Respond ONLY with valid JSON matching this schema:
{
  "relevance": <integer 0-30>,
  "visualQuality": <integer 0-25>,
  "reasoning": "<one sentence explanation>"
}
Be strict: only award full points for clear, genuine proof of the required IRL action.`,
      messages,
    });

    const text = response.content[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      relevance: Math.min(30, Math.max(0, parseInt(parsed.relevance) || 0)),
      visualQuality: Math.min(25, Math.max(0, parseInt(parsed.visualQuality) || 0)),
      reasoning: parsed.reasoning || 'No reasoning provided.',
    };
  } catch (e) {
    log(`  ⚠️  AI evaluation failed for claim #${claim.claimId}: ${e.message}`);
    // Fallback: basic heuristic scoring
    const hasDescription = (claim.description || '').length > 50;
    return {
      relevance: hasDescription ? 15 : 5,
      visualQuality: claim.imageUrl ? 12 : 0,
      reasoning: 'AI evaluation unavailable; scored by heuristics.',
    };
  }
}

function buildEvaluationPrompt(claim) {
  return `Evaluate this bounty claim submission:

Claim Name: ${claim.name}
Claim Description: ${claim.description || '(none provided)'}
Has Image: ${claim.imageUrl ? 'Yes' : 'No'}
Has Video: ${claim.videoUrl ? 'Yes' : 'No'}

Score this claim:
- relevance (0-30): How well does the description prove the real-world action was actually completed?
- visualQuality (0-25): How clear, genuine, and high-quality is the visual proof? (0 if no image)

Respond with JSON only.`;
}

/**
 * Fetch an image URL and return it as base64 for Claude vision.
 */
async function fetchImageAsBase64(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = await res.arrayBuffer();
  const data = Buffer.from(buffer).toString('base64');
  const mimeType = contentType.split(';')[0];
  return { data, mimeType };
}

/**
 * Build a human-readable explanation of the winner selection.
 */
function buildReasoning(winner, rankedClaims) {
  const lines = [
    `Winner: Claim #${winner.claimId} by ${winner.issuer}`,
    `Score: ${winner.score.total}/100`,
    ``,
    `Score Breakdown:`,
    `  - Media present:          ${winner.score.mediaPresent}/30`,
    `  - Description relevance:  ${winner.score.descriptionRelevance}/30`,
    `  - Visual quality:         ${winner.score.visualQuality}/25`,
    `  - Recency bonus:          ${winner.score.recencyBonus}/10`,
    `  - Description detail:     ${winner.score.descriptionDetail}/5`,
    ``,
    `AI Reasoning: ${winner.score.aiReasoning}`,
    ``,
    `All Submissions Ranked:`,
    ...rankedClaims.map((c, i) => `  ${i + 1}. Claim #${c.claimId} — ${c.score.total}/100 pts`),
  ];

  return lines.join('\n');
}

module.exports = { evaluateSubmissions };
