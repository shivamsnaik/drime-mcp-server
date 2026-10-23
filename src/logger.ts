// Logging for MCP stdio servers.
// stdout is reserved for the MCP JSON-RPC protocol — all diagnostics go to stderr.

export function log(message: string): void {
  process.stderr.write(`[drime-mcp] ${message}\n`);
}

export function logError(message: string): void {
  process.stderr.write(`[drime-mcp] ERROR: ${message}\n`);
}
