import { logError } from './logger.js';

export interface ServerConfig {
  drimeToken: string;
  readOnly: boolean;
}

export function loadConfig(): ServerConfig {
  const drimeToken = process.env.DRIME_API_TOKEN;
  if (!drimeToken) {
    logError('DRIME_API_TOKEN environment variable is required.');
    logError('Get your token at: https://app.drime.cloud/settings/developers');
    logError('Then set it: export DRIME_API_TOKEN=your_token_here');
    process.exit(1);
  }

  return {
    drimeToken,
    // Secure by default: read-only unless the env var is exactly "false".
    // Typos or empty values keep the server read-only.
    readOnly: process.env.DRIME_READ_ONLY?.toLowerCase() !== 'false',
  };
}
