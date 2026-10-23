# Drime MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets AI agents access your [Drime Cloud](https://drime.cloud) files. Browse, search, read, upload, and manage your documents directly from any MCP-compatible AI client (Claude Desktop, Cursor, Windsurf, etc.).

## Tools

| Tool | Description | Mode |
|------|-------------|------|
| `drime_get_user` | Get the authenticated user's account info | Read |
| `drime_list_workspaces` | List all accessible workspaces | Read |
| `drime_get_space_usage` | Get storage usage for a workspace | Read |
| `drime_list_files` | List files and folders in a directory (with filtering, sorting, pagination) | Read |
| `drime_search_files` | Search files by name across all directories | Read |
| `drime_get_file_info` | Get detailed metadata for a file or folder | Read |
| `drime_get_folders` | Get the folder tree structure | Read |
| `drime_read_file` | Download and read text-based file content (txt, md, json, code, etc.) | Read |
| `drime_upload_file` | Upload a file (base64-encoded content, up to 5MB) | Write |
| `drime_create_folder` | Create a new folder | Write |
| `drime_delete_files` | Move files/folders to trash | Write |
| `drime_move_files` | Move files/folders to a different location | Write |

## Prerequisites

- Node.js >= 20
- A Drime Cloud account
- A Drime API token ([get one here](https://app.drime.cloud/settings/developers))

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure your API token

```bash
export DRIME_API_TOKEN="your_token_here"
```

Or create a `.env` file:

```bash
cp .env.example .env
# Edit .env and set DRIME_API_TOKEN
```

### 4. Connect to an MCP client

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "drime": {
      "command": "node",
      "args": ["/absolute/path/to/Drime-MCP/dist/index.js"],
      "env": {
        "DRIME_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

#### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "mcpServers": {
    "drime": {
      "command": "node",
      "args": ["/absolute/path/to/Drime-MCP/dist/index.js"],
      "env": {
        "DRIME_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

### 5. Restart your AI client

The Drime tools should now appear in your AI agent's tool list.

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `DRIME_API_TOKEN` | Yes | — | Your Drime Cloud personal access token |
| `DRIME_READ_ONLY` | No | `true` | Read-only by default. Set to exactly `false` to enable write operations (upload, delete, move, create folder). Any other value keeps the server read-only |

## Development

```bash
# Run in dev mode (no build step, uses tsx)
npm run dev

# Run tests
npm test

# Watch tests
npm run test:watch

# Build for production
npm run build
```

## Security

- The API token is read from the `DRIME_API_TOKEN` environment variable — never hardcoded
- The token is validated on server startup (fails fast if invalid)
- Use `DRIME_READ_ONLY=true` for read-only access (e.g., when connecting to untrusted agents)
- Create a dedicated token with minimal permissions at [Drime Settings > Developers](https://app.drime.cloud/settings/developers)
- Never commit your `.env` file or token to version control

## Architecture

```
src/
├── index.ts              # MCP server entry point (stdio transport)
├── config.ts             # Environment-based configuration
├── types.ts              # TypeScript types for Drime API
├── drime-client.ts       # HTTP client for Drime Cloud REST API
└── tools/
    ├── index.ts          # Tool registry
    ├── user-tools.ts     # User, workspace, space usage tools
    ├── file-tools.ts     # List, search, file info, folder tree tools
    ├── content-tools.ts  # Read file content tool
    └── write-tools.ts    # Upload, create folder, delete, move tools
```

## License

MIT
