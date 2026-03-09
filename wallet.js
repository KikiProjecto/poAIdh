/**
 * wallet.js
 * Manages the bot's EOA wallet and provides signing utilities.
 * Supports Arbitrum, Base, and Degen Chain.
 */

const { ethers } = require('ethers');
const { log } = require('./utils');

// Chain configs
const CHAINS = {
  arbitrum: {
    chainId: 42161,
    rpcUrl: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    contractAddress: process.env.ARB_CONTRACT_ADDRESS || '0xdffe8a4a4103f968ffd61fd082d08c41dcf9b940',
    name: 'Arbitrum One',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://arbiscan.io',
  },
  base: {
    chainId: 8453,
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    contractAddress: process.env.BASE_CONTRACT_ADDRESS || '',
    name: 'Base',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://basescan.org',
  },
  degen: {
    chainId: 666666666,
    rpcUrl: process.env.DEGEN_RPC_URL || 'https://rpc.degen.tips',
    contractAddress: process.env.DEGEN_CONTRACT_ADDRESS || '',
    name: 'Degen Chain',
    nativeCurrency: 'DEGEN',
    blockExplorer: 'https://explorer.degen.tips',
  },
};

const ACTIVE_CHAIN = process.env.CHAIN || 'arbitrum';

let _provider = null;
let _wallet = null;

/**
 * Get or create the provider for the active chain
 */
function getProvider() {
  if (_provider) return _provider;
  const chain = CHAINS[ACTIVE_CHAIN];
  if (!chain) throw new Error(`Unknown chain: ${ACTIVE_CHAIN}`);
  _provider = new ethers.JsonRpcProvider(chain.rpcUrl);
  return _provider;
}

/**
 * Get or create the bot's wallet (EOA) from private key in env
 */
function getWallet() {
  if (_wallet) return _wallet;
  const pk = process.env.BOT_PRIVATE_KEY;
  if (!pk) throw new Error('BOT_PRIVATE_KEY not set in environment');
  const provider = getProvider();
  _wallet = new ethers.Wallet(pk, provider);
  log(`🔑 Wallet loaded: ${_wallet.address}`);
  return _wallet;
}

/**
 * Get the active chain config
 */
function getChainConfig() {
  return CHAINS[ACTIVE_CHAIN];
}

/**
 * Get the current gas price with a small premium for reliability
 */
async function getGasPrice() {
  const provider = getProvider();
  const feeData = await provider.getFeeData();
  return feeData;
}

/**
 * Check the bot wallet's balance
 */
async function getBalance() {
  const wallet = getWallet();
  const balance = await getProvider().getBalance(wallet.address);
  return ethers.formatEther(balance);
}

module.exports = { getWallet, getProvider, getChainConfig, getGasPrice, getBalance, CHAINS, ACTIVE_CHAIN };
