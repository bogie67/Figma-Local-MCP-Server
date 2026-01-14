import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BRIDGE_URL = 'http://localhost:3001';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

const server = new McpServer({
  name: "figma-local-mcp",
  version: "2.0.0",
});

async function callBridge(endpoint, options = {}, retries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${BRIDGE_URL}${endpoint}`, options);
      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || 'Bridge request failed';

        if (response.status === 503) {
          throw new Error(`Bridge Error: ${errorMsg}. Make sure the Figma plugin is connected and the bridge server is running (yarn bridge).`);
        } else if (response.status === 404) {
          throw new Error(`Bridge Error: ${errorMsg}. The requested endpoint was not found.`);
        } else {
          throw new Error(`Bridge Error: ${errorMsg}`);
        }
      }

      return data;
    } catch (error) {
      lastError = error;

      if (error.message.includes('404') || error.message.includes('plugin is connected')) {
        throw error;
      }

      if (attempt < retries) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.error(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${retries + 1} attempts. Last error: ${lastError.message}`);
}

function normalizeNodeId(input) {
  if (!input) return input;
  const trimmed = input.trim();

  if (/^\d+-\d+$/.test(trimmed)) {
    return trimmed.replace('-', ':');
  }

  return trimmed;
}

async function requestFigma(action, params) {
  const data = await callBridge('/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params })
  });
  return data.result;
}

server.registerTool(
  "get-figma-document",
  {
    title: "Get Figma Document",
    description: "Gets the current Figma document structure including all pages and top-level frames. Works entirely locally through the Figma plugin - no API key required.",
  },
  async () => {
    const doc = await callBridge('/document');
    return { content: [{ type: "text", text: JSON.stringify(doc, null, 2) }] };
  }
);

server.registerTool(
  "get-current-page",
  {
    title: "Get Current Page",
    description: "Gets detailed information about the currently active page in Figma. Works entirely locally - no API key required.",
  },
  async () => {
    const result = await requestFigma('get-current-page');
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "get-selection",
  {
    title: "Get Selected Nodes",
    description: "Gets the currently selected nodes in Figma with their properties. Works entirely locally - no API key required.",
  },
  async () => {
    const result = await requestFigma('get-selection');
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "get-all-pages",
  {
    title: "Get All Pages",
    description: "Gets a list of all pages in the current Figma document. Works entirely locally - no API key required.",
  },
  async () => {
    const result = await requestFigma('get-all-pages');
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "find-nodes",
  {
    title: "Find Nodes",
    description: "Searches for nodes by name in the current page. Works entirely locally - no API key required.",
    inputSchema: {
      query: z.string()
    },
  },
  async ({ query }) => {
    const result = await requestFigma('find-nodes', { query });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "get-node-properties",
  {
    title: "Get Node Properties",
    description: "Gets detailed properties of a specific node by its ID, including style properties, dimensions, and more. Works entirely locally through the Figma plugin - no API key required.",
    inputSchema: {
      nodeId: z.string()
    },
  },
  async ({ nodeId }) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    const result = await requestFigma('get-node-properties', { nodeId: normalizedNodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "export-node",
  {
    title: "Export Node as Image",
    description: "Exports a node as an image in PNG, SVG, or JPG format. Works entirely locally through the Figma plugin - no API key required.",
    inputSchema: {
      nodeId: z.string(),
      format: z.enum(['PNG', 'SVG', 'JPG']).optional()
    },
  },
  async ({ nodeId, format }) => {
    const resolvedFormat = (format || 'PNG').toUpperCase();
    const normalizedNodeId = normalizeNodeId(nodeId);
    const result = await requestFigma('export-node', { nodeId: normalizedNodeId, format: resolvedFormat });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "get-batch-nodes",
  {
    title: "Get Batch Node Properties",
    description: "Gets detailed properties for multiple nodes at once. More efficient than calling get-node-properties multiple times. Works entirely locally - no API key required.",
    inputSchema: {
      nodeIds: z.array(z.string())
    },
  },
  async ({ nodeIds }) => {
    const normalizedNodeIds = nodeIds.map(normalizeNodeId);
    const result = await requestFigma('get-batch-nodes', { nodeIds: normalizedNodeIds });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "export-batch-nodes",
  {
    title: "Export Batch Nodes as Images",
    description: "Exports multiple nodes as images in one operation. More efficient than calling export-node multiple times. Works entirely locally - no API key required.",
    inputSchema: {
      nodeIds: z.array(z.string()),
      format: z.enum(['PNG', 'SVG', 'JPG']).optional()
    },
  },
  async ({ nodeIds, format }) => {
    const resolvedFormat = (format || 'PNG').toUpperCase();
    const normalizedNodeIds = nodeIds.map(normalizeNodeId);
    const result = await requestFigma('export-batch-nodes', { nodeIds: normalizedNodeIds, format: resolvedFormat });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "check-bridge-status",
  {
    title: "Check Bridge Status",
    description: "Checks if the Figma bridge server is running and if a Figma plugin is connected.",
  },
  async () => {
    const result = await callBridge('/health');
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// === WRITE OPERATIONS ===

server.registerTool(
  "create-component",
  {
    title: "Create Component",
    description: "Converts a node into a reusable Figma component. The original node is replaced with the new component.",
    inputSchema: {
      nodeId: z.string().describe("The ID of the node to convert to a component")
    },
  },
  async ({ nodeId }) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    const result = await requestFigma('create-component', { nodeId: normalizedNodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "create-component-set",
  {
    title: "Create Component Set (Variants)",
    description: "Combines multiple components into a component set with variants.",
    inputSchema: {
      nodeIds: z.array(z.string()).describe("Array of component node IDs to combine"),
      name: z.string().describe("Name for the component set")
    },
  },
  async ({ nodeIds, name }) => {
    const normalizedNodeIds = nodeIds.map(normalizeNodeId);
    const result = await requestFigma('create-component-set', { nodeIds: normalizedNodeIds, name });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "rename-node",
  {
    title: "Rename Node",
    description: "Renames a node in the Figma document.",
    inputSchema: {
      nodeId: z.string().describe("The ID of the node to rename"),
      newName: z.string().describe("The new name for the node")
    },
  },
  async ({ nodeId, newName }) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    const result = await requestFigma('rename-node', { nodeId: normalizedNodeId, newName });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "move-node",
  {
    title: "Move Node",
    description: "Moves a node to a different parent (frame, page, or group).",
    inputSchema: {
      nodeId: z.string().describe("The ID of the node to move"),
      targetParentId: z.string().describe("The ID of the target parent node"),
      index: z.number().optional().describe("Optional index position within the parent")
    },
  },
  async ({ nodeId, targetParentId, index }) => {
    const result = await requestFigma('move-node', {
      nodeId: normalizeNodeId(nodeId),
      targetParentId: normalizeNodeId(targetParentId),
      index
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "duplicate-node",
  {
    title: "Duplicate Node",
    description: "Creates a copy of a node.",
    inputSchema: {
      nodeId: z.string().describe("The ID of the node to duplicate")
    },
  },
  async ({ nodeId }) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    const result = await requestFigma('duplicate-node', { nodeId: normalizedNodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "delete-node",
  {
    title: "Delete Node",
    description: "Deletes a node from the Figma document. This action cannot be undone via the API.",
    inputSchema: {
      nodeId: z.string().describe("The ID of the node to delete")
    },
  },
  async ({ nodeId }) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    const result = await requestFigma('delete-node', { nodeId: normalizedNodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "create-frame",
  {
    title: "Create Frame",
    description: "Creates a new frame in the Figma document.",
    inputSchema: {
      name: z.string().describe("Name for the new frame"),
      x: z.number().optional().describe("X position (default: 0)"),
      y: z.number().optional().describe("Y position (default: 0)"),
      width: z.number().optional().describe("Width (default: 100)"),
      height: z.number().optional().describe("Height (default: 100)"),
      parentId: z.string().optional().describe("Optional parent node ID")
    },
  },
  async ({ name, x, y, width, height, parentId }) => {
    const result = await requestFigma('create-frame', {
      name, x, y, width, height,
      parentId: parentId ? normalizeNodeId(parentId) : undefined
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "set-node-property",
  {
    title: "Set Node Property",
    description: "Sets a property on a node (x, y, width, height, visible, locked, opacity, cornerRadius, fills, strokes).",
    inputSchema: {
      nodeId: z.string().describe("The ID of the node to modify"),
      property: z.string().describe("The property name to set"),
      value: z.any().describe("The new value for the property")
    },
  },
  async ({ nodeId, property, value }) => {
    const normalizedNodeId = normalizeNodeId(nodeId);
    const result = await requestFigma('set-node-property', { nodeId: normalizedNodeId, property, value });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "group-nodes",
  {
    title: "Group Nodes",
    description: "Groups multiple nodes together.",
    inputSchema: {
      nodeIds: z.array(z.string()).describe("Array of node IDs to group"),
      name: z.string().optional().describe("Optional name for the group")
    },
  },
  async ({ nodeIds, name }) => {
    const normalizedNodeIds = nodeIds.map(normalizeNodeId);
    const result = await requestFigma('group-nodes', { nodeIds: normalizedNodeIds, name });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "clone-to-page",
  {
    title: "Clone Node to Page",
    description: "Clones a node to a different page in the document.",
    inputSchema: {
      nodeId: z.string().describe("The ID of the node to clone"),
      pageId: z.string().describe("The ID of the target page")
    },
  },
  async ({ nodeId, pageId }) => {
    const result = await requestFigma('clone-to-page', {
      nodeId: normalizeNodeId(nodeId),
      pageId: normalizeNodeId(pageId)
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
