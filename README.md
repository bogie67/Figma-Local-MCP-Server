# Figma Local MCP Server

A custom MCP server for Figma that runs entirely locally.

## Architecture

```
Figma Desktop → Figma Plugin → WebSocket Bridge → MCP Server → Claude/Codex
```

1. **Figma Plugin** - Runs in Figma Desktop with full access to the Plugin API
2. **Bridge Server** - WebSocket server that receives data from the plugin
3. **MCP Server** - Exposes Figma tools to Claude via MCP protocol

## Setup

### 1. Install Dependencies

```bash
yarn install
yarn build-plugin
```

### 2. Install the Figma Plugin

1. Open Figma Desktop
2. Go to Plugins → Development → Import plugin from manifest
3. Select `/figma-plugin/manifest.json`
4. The plugin will appear in your Plugins menu

### 3. Start the Bridge Server

In a terminal, run:

```bash
yarn bridge
```

This starts:
- WebSocket server on `ws://localhost:3000` (for Figma plugin)
- HTTP API on `http://localhost:3001` (for MCP server)

### 4. Add to Claude
```bash
claude mcp add figma-local node /Users/user/Desktop/my-mcp/mcp.js
codex mcp add figma-local node /Users/user/Desktop/my-mcp/mcp.js
```

Validate using
```bash
claude mcp list
codex mcp list
```

Remove using
```bash
claude mcp remove figma-local
codex mcp remove figma-local
```


Replace the path with your actual project path.

### 5. Run the Plugin

1. Open any Figma file
2. Go to Plugins → Development → Figma MCP Bridge
3. The plugin UI should show "Connected to bridge"


## Usage

Once everything is running, you can ask Claude to interact with your Figma files:

```
"What's in my current Figma page?"
"Find all buttons in this design"
"Get the properties of the selected node"
"Export this frame as PNG"
```

## Available Tools

- `get-figma-document` - Get current document structure
- `get-current-page` - Get detailed info about active page
- `get-selection` - Get currently selected nodes
- `get-all-pages` - List all pages
- `find-nodes` - Search for nodes by name
- `get-node-properties` - Get detailed properties of a node
- `export-node` - Export node as PNG/SVG/JPG
- `check-bridge-status` - Check if everything is connected

## Benefits vs API-based Approach

✅ No API key needed
✅ No rate limits
✅ Works with private/local files
✅ Real-time access to your current selection
✅ Full Plugin API capabilities
✅ No network latency (all local)

## Troubleshooting

**Plugin shows "Disconnected":**
- Make sure the bridge server is running (`yarn bridge`)
- Check that nothing else is using port 3000/3001

**Claude can't access Figma:**
- Verify the bridge server is running
- Run `check-bridge-status` tool to see connection state
- Make sure the plugin is open in Figma

**Build errors:**
- Run `yarn install` to ensure all dependencies are installed
- For plugin TypeScript errors, run `yarn build-plugin`

## Development

### Project Structure

```
my-mcp/
├── figma-plugin/
│   ├── manifest.json       # Plugin manifest
│   ├── code.ts            # Plugin main code
│   ├── ui.html            # Plugin UI
│   └── tsconfig.json      # TypeScript config
├── bridge-server.js       # WebSocket bridge
├── mcp.js                # MCP server with Figma tools
└── package.json
```

### Adding New Tools

1. Add handler in `figma-plugin/code.ts` (action switch statement)
2. Expose via MCP in `mcp.js` using `server.registerTool()`
3. Rebuild plugin: `yarn build-plugin`

## License

ISC
