/**
 * utils.js
 * Logging and persistent state management.
 * State is saved to disk so the bot can resume if restarted.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.resolve(process.env.STATE_FILE || './bot-state.json');

/**
 * Structured logger with timestamps.
 */
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);

  // Also append to log file
  try {
    fs.appendFileSync('./bot.log', line + '\n');
  } catch (_) {}
}

/**
 * Load persistent state from disk.
 * Returns empty state object if none exists.
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    log(`⚠️  Could not load state file: ${e.message}`);
  }
  return {};
}

/**
 * Save persistent state to disk.
 */
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    log(`⚠️  Could not save state file: ${e.message}`);
  }
}

/**
 * Reset state (use with caution — only if you want to start a fresh bounty).
 */
function resetState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    log('🔄 State reset.');
  }
}

module.exports = { log, loadState, saveState, resetState };
