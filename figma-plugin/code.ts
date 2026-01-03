const BRIDGE_URL = 'ws://localhost:3000';
let ws: WebSocket | null = null;

function connectToBridge() {
  figma.ui.postMessage({ type: 'connect', url: BRIDGE_URL });
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'ws-connected') {
    console.log('Connected to bridge server');
    await sendDocumentUpdate();
  }

  if (msg.type === 'ws-request') {
    const { requestId, action, params } = msg.data;

    try {
      let result;

      switch (action) {
        case 'get-current-page':
          result = await getCurrentPage();
          break;
        case 'get-selection':
          result = await getSelection();
          break;
        case 'get-all-pages':
          result = await getAllPages();
          break;
        case 'find-nodes':
          result = await findNodes(params.query);
          break;
        case 'get-node-properties':
          result = await getNodeProperties(params.nodeId);
          break;
        case 'export-node':
          result = await exportNode(params.nodeId, params.format);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      figma.ui.postMessage({
        type: 'ws-response',
        requestId,
        result
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'ws-response',
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
};

async function sendDocumentUpdate() {
  const data = {
    type: 'document-update',
    document: {
      name: figma.root.name,
      pages: figma.root.children.map(serializePage),
      selection: figma.currentPage.selection.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type
      }))
    }
  };

  figma.ui.postMessage({ type: 'ws-send', data });
}

function serializePage(page: PageNode) {
  return {
    id: page.id,
    name: page.name,
    type: page.type,
    children: page.children.map(child => ({
      id: child.id,
      name: child.name,
      type: child.type
    }))
  };
}

async function getCurrentPage() {
  return {
    id: figma.currentPage.id,
    name: figma.currentPage.name,
    type: figma.currentPage.type,
    children: figma.currentPage.children.map(node => serializeNode(node))
  };
}

async function getSelection() {
  return figma.currentPage.selection.map(node => serializeNode(node));
}

async function getAllPages() {
  return figma.root.children.map(serializePage);
}

async function findNodes(query: string) {
  const results: SceneNode[] = [];

  function search(node: BaseNode) {
    if ('name' in node && node.name.toLowerCase().includes(query.toLowerCase())) {
      results.push(node as SceneNode);
    }
    if ('children' in node) {
      for (const child of node.children) {
        search(child);
      }
    }
  }

  search(figma.currentPage);
  return results.map(node => serializeNode(node));
}

async function getNodeProperties(nodeId: string) {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  return serializeNodeDetailed(node);
}

async function exportNode(nodeId: string, format: 'PNG' | 'SVG' | 'JPG' = 'PNG') {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const bytes = await node.exportAsync({ format });
  return {
    nodeId,
    format,
    data: Array.from(bytes)
  };
}

function serializeNode(node: BaseNode) {
  const base: any = {
    id: node.id,
    name: node.name,
    type: node.type
  };

  if ('children' in node) {
    base.children = node.children.map(child => ({
      id: child.id,
      name: child.name,
      type: child.type
    }));
  }

  return base;
}

function serializeNodeDetailed(node: BaseNode) {
  const data: any = serializeNode(node);

  if ('visible' in node) data.visible = node.visible;
  if ('locked' in node) data.locked = node.locked;

  if ('x' in node) data.x = node.x;
  if ('y' in node) data.y = node.y;
  if ('width' in node) data.width = node.width;
  if ('height' in node) data.height = node.height;

  if ('fills' in node) {
    data.fills = JSON.parse(JSON.stringify(node.fills));
  }
  if ('strokes' in node) {
    data.strokes = JSON.parse(JSON.stringify(node.strokes));
  }
  if ('effects' in node) {
    data.effects = JSON.parse(JSON.stringify(node.effects));
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    data.characters = textNode.characters;
    data.fontSize = textNode.fontSize;
    data.fontName = textNode.fontName;
  }

  return data;
}

figma.on('selectionchange', () => {
  sendDocumentUpdate();
});

figma.showUI(__html__, { width: 300, height: 200, themeColors: true });
connectToBridge();
