# 🤖 POIDH Autonomous Bounty Bot

A fully autonomous AI agent that creates, monitors, evaluates, and pays out POIDH bounties **entirely on its own** — no human intervention after deployment.

---

## Table of Contents

- [What This Bot Does](#what-this-bot-does)
- [Architecture](#architecture)
- [Setup](#setup)
- [How Autonomy Is Enforced](#how-autonomy-is-enforced)
- [Evaluation Logic](#evaluation-logic)
- [Social Transparency](#social-transparency)
- [Deployment](#deployment)
- [Assumptions & Limitations](#assumptions--limitations)
- [Bounty Compliance Checklist](#bounty-compliance-checklist)

---

## What This Bot Does

The bot runs through a complete bounty lifecycle automatically:

```
1. CREATE  → Creates a real-world-action bounty on poidh.xyz (funds from its own wallet)
2. MONITOR → Polls on-chain events + POIDH API for new claim submissions
3. EVALUATE → Scores each claim using AI vision (Claude) + deterministic rules
4. SELECT  → Picks the highest-scoring submission as winner
5. PAY     → Calls acceptClaim() on-chain — funds transfer automatically
6. EXPLAIN → Posts full reasoning to X (Twitter) and/or Farcaster
```

All steps happen automatically. The bot's wallet signs every transaction. No MetaMask, no human approval.

---

## Architecture

```
poidh-bounty-bot/
├── src/
│   ├── index.js       # Orchestrator — runs the full lifecycle, manages phases
│   ├── wallet.js      # EOA wallet management, chain selection, gas pricing
│   ├── contract.js    # POIDH contract ABI + ethers.js interaction layer
│   ├── bounty.js      # Creates real-world-action bounties
│   ├── monitor.js     # Monitors on-chain events + POIDH API for submissions
│   ├── evaluator.js   # AI + deterministic scoring of each claim
│   ├── payout.js      # Executes acceptClaim / voteClaim / cancelBounty
│   ├── social.js      # Posts decision to X and Farcaster
│   └── utils.js       # Logging + persistent state to disk
├── .env.example       # All required environment variables documented
├── Dockerfile         # Container-based deployment
├── package.json
└── README.md
```

### Data Flow

```
index.js (orchestrator)
    │
    ├─→ bounty.js      → contract.js → wallet.js (creates bounty on-chain)
    │
    ├─→ monitor.js     → contract.js (reads ClaimCreated events)
    │                  → POIDH API   (enriches with image URLs)
    │
    ├─→ evaluator.js   → Anthropic API (Claude vision scoring)
    │                  + deterministic rules (media, description length, recency)
    │
    ├─→ payout.js      → contract.js → wallet.js (acceptClaim tx)
    │
    └─→ social.js      → X API / Neynar (Farcaster) (posts reasoning)
```

### State Machine

```
[start]
   │
   ▼
{no state}  ──→  CREATE bounty  ──→  phase: "monitoring"
                                            │
                                            ▼
                                     POLL for claims
                                            │
                              ┌─────────────┴──────────────┐
                              │ confident winner found OR   │
                              │ deadline passed             │
                              ▼                             │
                        phase: "payout"       ◄─────────────┘
                              │
                              ▼
                        EXECUTE acceptClaim
                              │
                              ▼
                        phase: "social"
                              │
                              ▼
                        POST to X/Farcaster
                              │
                              ▼
                        phase: "complete" ✅
```

State is persisted to `bot-state.json` so the bot resumes correctly after any restart.

---

## Setup

### Prerequisites

- Node.js ≥ 18.12
- An Ethereum wallet with funds (≥ 0.005 ETH on Arbitrum recommended)
- Anthropic API key (for AI evaluation)
- Twitter API credentials OR Neynar/Farcaster credentials (for social posting)

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/poidh-bounty-bot
cd poidh-bounty-bot
npm install
cp .env.example .env
```

### Configuration

Edit `.env`:

```env
# Required — bot's signing wallet
BOT_PRIVATE_KEY=0x...your_private_key...

# Required — select chain
CHAIN=arbitrum

# Required — RPC (use Alchemy or Infura for reliability)
ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY

# Required — AI evaluation
ANTHROPIC_API_KEY=sk-ant-...

# Required — at least one social platform
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_SECRET=...

# Optional — Farcaster
NEYNAR_API_KEY=...
FARCASTER_SIGNER_UUID=...

# Bounty settings
BOUNTY_AMOUNT_ETH=0.002        # ~$5-6 at current prices
BOUNTY_DURATION_HOURS=48       # Closes after 48h
POLL_INTERVAL_MS=60000         # Check for new submissions every 60s
```

> ⚠️ **Security:** Never commit `.env` to git. The bot's private key controls real funds.

### Verify wallet balance

```bash
npm run check-balance
```

### Run

```bash
npm start
```

The bot will:
1. Create a bounty immediately
2. Poll for submissions every 60 seconds
3. Evaluate and pay the winner automatically
4. Post reasoning to social media

---

## How Autonomy Is Enforced

Every step that could require human action has been automated:

| Step | How it's automated |
|------|--------------------|
| Wallet signing | `ethers.Wallet` with private key from env — no MetaMask |
| Bounty creation | `contract.createSoloBounty()` called programmatically |
| Submission monitoring | On-chain event polling via `contract.queryFilter()` |
| Winner selection | Deterministic scoring + Claude AI — no human input |
| Payout | `contract.acceptClaim()` called from bot wallet |
| Social posting | Twitter API v2 / Neynar API — no manual posting |
| Resumability | State saved to `bot-state.json` — bot resumes after restart |

**The only human action required is the initial `npm start`.** After that, the bot runs unattended.

---

## Evaluation Logic

Claims are scored out of **100 points** using a hybrid approach:

### Deterministic Rules (no AI bias)

| Criterion | Points | Logic |
|-----------|--------|-------|
| Media present (image/video) | 0 or 30 | Binary: does the claim have visual proof? |
| Description detail | 0–5 | Length-based: 1 pt per 40 characters |
| Recency bonus | 0–10 | Earlier submissions get a small bonus (max 10 pts) |

### AI Evaluation (Claude Vision)

| Criterion | Points | Logic |
|-----------|--------|-------|
| Description relevance | 0–30 | Does the text prove the IRL action was completed? |
| Visual quality | 0–25 | Is the image clear, genuine, and relevant to the task? |

Claude is prompted with the claim description and image (if available) and returns a JSON score. The prompt is strict and reproducible — the full prompt is in `src/evaluator.js`.

### Winner Selection

The highest total score wins. If the bot reaches the deadline with submissions but no score ≥ 50/100, it selects the best available submission anyway (`forceSelect: true`).

### Auditability

Every score breakdown is logged to `bot.log` and posted to social media. The full evaluation JSON is saved to `bot-state.json`. Anyone can reproduce the scoring by running `evaluator.js` on the same claims.

---

## Social Transparency

After paying the winner, the bot posts:

**Main post (≤280 chars):**
```
🤖 POIDH Bot Decision

Bounty #42 is complete!
Winner: Claim #7 by 0xaBcD...1234
Score: 78/100

Reason: Clear before/after photo of park cleanup with visible trash bag...

Payout TX: https://arbiscan.io/tx/0x...
Bounty: https://poidh.xyz/bounty/42

#poidh #crypto #autonomousAI
```

**Follow-up thread with full breakdown:**
```
📊 Full Scoring Breakdown (Claim #7):

• Media present: 30/30
• Description relevance: 22/30
• Visual quality: 18/25
• Recency bonus: 6/10
• Detail score: 2/5

Total: 78/100

AI Reasoning: The submission shows a clear before/after comparison of a park area with a full trash bag, directly satisfying the bounty requirements.
```

The bot account can respond to follow-up questions about its logic because the full scoring breakdown is always publicly posted.

---

## Deployment

### Option 1: Direct (Mac Mini / VPS)

```bash
# Install pm2 for process management
npm install -g pm2

# Run bot with auto-restart
pm2 start src/index.js --name poidh-bot

# Auto-start on system reboot
pm2 startup
pm2 save

# View logs
pm2 logs poidh-bot
```

### Option 2: Docker

```bash
# Build
docker build -t poidh-bot .

# Run with env file and persistent state volume
docker run -d \
  --name poidh-bot \
  --env-file .env \
  -v poidh-bot-state:/app/state \
  --restart unless-stopped \
  poidh-bot

# View logs
docker logs -f poidh-bot
```

### Option 3: GitHub Actions (Scheduled)

Create `.github/workflows/run-bot.yml` with a `schedule` trigger to run the bot on a cron schedule (e.g., daily). Use GitHub Secrets for all environment variables.

---

## Assumptions & Limitations

### Assumptions

- **POIDH contract ABI stability:** The bot targets the current deployed contract. If POIDH upgrades contracts, the ABI and contract address must be updated in `contract.js`.
- **Claim metadata availability:** The bot reads claim descriptions from on-chain events. Rich metadata (images) depends on POIDH's API being available. If the API is down, the bot falls back to on-chain data only and may not be able to evaluate visual quality.
- **Honest submissions:** The bot trusts that claims are genuine. It does not cross-reference external databases.
- **Network reliability:** The bot uses public RPC endpoints by default. For production reliability, use a paid RPC provider (Alchemy/Infura).

### Limitations

- **Single winner only:** POIDH solo bounties support exactly one winner. Secondary rewards must be sent manually.
- **Vision model limits:** Claude vision can evaluate JPEG/PNG images. Video content is scored by description only.
- **Gas price spikes:** On Arbitrum these are rare, but the bot uses `maxFeePerGas` from the network's current fee data. Extreme gas spikes may cause transactions to fail (they will not be broadcast above the fee cap).
- **No appeal mechanism:** Once `acceptClaim` is called, the payout is final and irreversible on-chain.
- **Social API rate limits:** If the bot runs many bounties back-to-back, Twitter API rate limits may apply. The bot logs failures and continues.

### Security Notes

- The bot's private key has access to real funds. Use a dedicated wallet with only the funds needed.
- Never share your `.env` file or commit it to version control.
- The `bot-state.json` file does not contain private keys and is safe to commit, but is excluded by `.gitignore` by default.

---

## Bounty Compliance Checklist

- ✅ Controls its own EOA wallet (no MetaMask, no human signing)
- ✅ Creates a poidh bounty (solo bounty via `createSoloBounty`)
- ✅ Monitors submissions automatically (on-chain event polling)
- ✅ Evaluates submissions using deterministic logic + AI
- ✅ Selects a winner autonomously
- ✅ Executes `acceptClaim` without human input
- ✅ Posts winning decision to X and/or Farcaster
- ✅ Clearly explains reasoning (score breakdown + AI rationale)
- ✅ Bounty requires real-world actions (photos, physical tasks)
- ✅ Fully open-source and reproducible from this repository
- ✅ Clean README with setup, architecture, autonomy explanation, assumptions, limitations


