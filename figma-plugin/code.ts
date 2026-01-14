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
        // === WRITE OPERATIONS ===
        case 'create-component':
          result = await createComponent(params.nodeId);
          break;
        case 'create-component-set':
          result = await createComponentSet(params.nodeIds, params.name);
          break;
        case 'rename-node':
          result = await renameNode(params.nodeId, params.newName);
          break;
        case 'move-node':
          result = await moveNode(params.nodeId, params.targetParentId, params.index);
          break;
        case 'duplicate-node':
          result = await duplicateNode(params.nodeId);
          break;
        case 'delete-node':
          result = await deleteNode(params.nodeId);
          break;
        case 'create-frame':
          result = await createFrame(params.name, params.x, params.y, params.width, params.height, params.parentId);
          break;
        case 'set-node-property':
          result = await setNodeProperty(params.nodeId, params.property, params.value);
          break;
        case 'group-nodes':
          result = await groupNodes(params.nodeIds, params.name);
          break;
        case 'clone-to-page':
          result = await cloneToPage(params.nodeId, params.pageId);
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

// === WRITE OPERATION IMPLEMENTATIONS ===

async function createComponent(nodeId: string) {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  if (!('parent' in node) || !node.parent) {
    throw new Error(`Node has no parent`);
  }

  const hasAutoLayout = 'layoutMode' in node && (node as any).layoutMode !== 'NONE';

  // Save original dimensions before any modifications
  const originalWidth = node.width;
  const originalHeight = node.height;

  // Create the component
  const component = figma.createComponent();
  component.name = node.name;
  component.x = node.x;
  component.y = node.y;

  // Copy visual styles from original node
  if ('fills' in node) {
    component.fills = JSON.parse(JSON.stringify(node.fills));
  }
  if ('strokes' in node) {
    component.strokes = JSON.parse(JSON.stringify(node.strokes));
  }
  if ('strokeWeight' in node) {
    component.strokeWeight = node.strokeWeight;
  }
  if ('effects' in node) {
    component.effects = JSON.parse(JSON.stringify(node.effects));
  }
  if ('cornerRadius' in node && typeof (node as any).cornerRadius === 'number') {
    component.cornerRadius = (node as any).cornerRadius;
  }
  if ('topLeftRadius' in node) {
    component.topLeftRadius = (node as any).topLeftRadius;
    component.topRightRadius = (node as any).topRightRadius;
    component.bottomLeftRadius = (node as any).bottomLeftRadius;
    component.bottomRightRadius = (node as any).bottomRightRadius;
  }
  if ('opacity' in node) {
    component.opacity = (node as any).opacity;
  }
  if ('blendMode' in node) {
    component.blendMode = (node as any).blendMode;
  }
  if ('clipsContent' in node) {
    component.clipsContent = (node as any).clipsContent;
  }

  // Apply auto-layout BEFORE adding children if original has it
  if (hasAutoLayout) {
    component.layoutMode = (node as any).layoutMode;
    if ('primaryAxisAlignItems' in node) {
      component.primaryAxisAlignItems = (node as any).primaryAxisAlignItems;
    }
    if ('counterAxisAlignItems' in node) {
      component.counterAxisAlignItems = (node as any).counterAxisAlignItems;
    }
    if ('paddingTop' in node) {
      component.paddingTop = (node as any).paddingTop;
      component.paddingRight = (node as any).paddingRight;
      component.paddingBottom = (node as any).paddingBottom;
      component.paddingLeft = (node as any).paddingLeft;
    }
    if ('itemSpacing' in node) {
      component.itemSpacing = (node as any).itemSpacing;
    }
    if ('layoutWrap' in node) {
      component.layoutWrap = (node as any).layoutWrap;
    }
  }

  // Clone children from original node and copy their layout properties
  if ('children' in node) {
    const originalChildren = (node as FrameNode).children;
    for (const originalChild of originalChildren) {
      const childClone = originalChild.clone();
      component.appendChild(childClone);

      // Copy child layout properties (critical for auto-layout alignment)
      if (hasAutoLayout) {
        if ('layoutAlign' in originalChild) {
          (childClone as any).layoutAlign = (originalChild as any).layoutAlign;
        }
        if ('layoutGrow' in originalChild) {
          (childClone as any).layoutGrow = (originalChild as any).layoutGrow;
        }
        if ('layoutPositioning' in originalChild) {
          (childClone as any).layoutPositioning = (originalChild as any).layoutPositioning;
        }
      } else {
        // For non-auto-layout, preserve absolute positions
        if ('x' in originalChild && 'y' in originalChild) {
          (childClone as any).x = originalChild.x;
          (childClone as any).y = originalChild.y;
        }
      }

      // Copy constraints for non-auto-layout or absolute positioned children
      if ('constraints' in originalChild) {
        (childClone as any).constraints = (originalChild as any).constraints;
      }
    }
  }

  // Apply sizing modes and resize AFTER children are added
  if (hasAutoLayout) {
    if ('primaryAxisSizingMode' in node) {
      component.primaryAxisSizingMode = (node as any).primaryAxisSizingMode;
    }
    if ('counterAxisSizingMode' in node) {
      component.counterAxisSizingMode = (node as any).counterAxisSizingMode;
    }
  }

  // Force resize to original dimensions (after layout is set up)
  component.resize(originalWidth, originalHeight);

  // Insert component where the original was
  const parent = node.parent;
  const index = parent.children.indexOf(node);
  parent.insertChild(index, component);

  // Remove original
  node.remove();

  return {
    id: component.id,
    name: component.name,
    type: component.type,
    message: `Created component "${component.name}" from node`
  };
}

async function createComponentSet(nodeIds: string[], name: string) {
  const nodes = nodeIds.map(id => {
    const node = figma.getNodeById(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    return node as ComponentNode;
  });

  // Verify all are components
  for (const node of nodes) {
    if (node.type !== 'COMPONENT') {
      throw new Error(`Node ${node.id} is not a component (is ${node.type})`);
    }
  }

  const componentSet = figma.combineAsVariants(nodes, figma.currentPage);
  componentSet.name = name;

  return {
    id: componentSet.id,
    name: componentSet.name,
    type: componentSet.type,
    variants: componentSet.children.length,
    message: `Created component set "${name}" with ${nodes.length} variants`
  };
}

async function renameNode(nodeId: string, newName: string) {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const oldName = node.name;
  node.name = newName;

  return {
    id: node.id,
    oldName,
    newName: node.name,
    message: `Renamed "${oldName}" to "${newName}"`
  };
}

async function moveNode(nodeId: string, targetParentId: string, index?: number) {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const targetParent = figma.getNodeById(targetParentId) as (FrameNode | PageNode | GroupNode);
  if (!targetParent) {
    throw new Error(`Target parent not found: ${targetParentId}`);
  }

  if (!('children' in targetParent)) {
    throw new Error(`Target parent cannot have children`);
  }

  if (index !== undefined) {
    targetParent.insertChild(index, node);
  } else {
    targetParent.appendChild(node);
  }

  return {
    id: node.id,
    name: node.name,
    newParentId: targetParent.id,
    newParentName: targetParent.name,
    message: `Moved "${node.name}" to "${targetParent.name}"`
  };
}

async function duplicateNode(nodeId: string) {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const clone = node.clone();
  clone.name = `${node.name} (copy)`;
  clone.x = node.x + 20;
  clone.y = node.y + 20;

  return {
    id: clone.id,
    name: clone.name,
    type: clone.type,
    originalId: nodeId,
    message: `Duplicated "${node.name}"`
  };
}

async function deleteNode(nodeId: string) {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const name = node.name;
  node.remove();

  return {
    deletedId: nodeId,
    deletedName: name,
    message: `Deleted "${name}"`
  };
}

async function createFrame(name: string, x: number = 0, y: number = 0, width: number = 100, height: number = 100, parentId?: string) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.x = x;
  frame.y = y;
  frame.resize(width, height);

  if (parentId) {
    const parent = figma.getNodeById(parentId) as (FrameNode | PageNode);
    if (parent && 'children' in parent) {
      parent.appendChild(frame);
    }
  }

  return {
    id: frame.id,
    name: frame.name,
    type: frame.type,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    message: `Created frame "${name}"`
  };
}

async function setNodeProperty(nodeId: string, property: string, value: any) {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  // Handle common properties
  switch (property) {
    case 'x':
    case 'y':
      if ('x' in node) (node as any)[property] = value;
      break;
    case 'width':
    case 'height':
      if ('resize' in node) {
        const w = property === 'width' ? value : node.width;
        const h = property === 'height' ? value : node.height;
        (node as any).resize(w, h);
      }
      break;
    case 'visible':
      if ('visible' in node) node.visible = value;
      break;
    case 'locked':
      if ('locked' in node) node.locked = value;
      break;
    case 'opacity':
      if ('opacity' in node) (node as any).opacity = value;
      break;
    case 'cornerRadius':
      if ('cornerRadius' in node) (node as any).cornerRadius = value;
      break;
    case 'fills':
      if ('fills' in node) (node as any).fills = value;
      break;
    case 'strokes':
      if ('strokes' in node) (node as any).strokes = value;
      break;
    default:
      // Try direct assignment
      if (property in node) {
        (node as any)[property] = value;
      } else {
        throw new Error(`Unknown property: ${property}`);
      }
  }

  return {
    id: node.id,
    name: node.name,
    property,
    newValue: value,
    message: `Set ${property} to ${JSON.stringify(value)} on "${node.name}"`
  };
}

async function groupNodes(nodeIds: string[], name?: string) {
  const nodes = nodeIds.map(id => {
    const node = figma.getNodeById(id) as SceneNode;
    if (!node) throw new Error(`Node not found: ${id}`);
    return node;
  });

  if (nodes.length === 0) {
    throw new Error('No nodes to group');
  }

  const group = figma.group(nodes, figma.currentPage);
  if (name) group.name = name;

  return {
    id: group.id,
    name: group.name,
    type: group.type,
    childCount: group.children.length,
    message: `Grouped ${nodes.length} nodes into "${group.name}"`
  };
}

async function cloneToPage(nodeId: string, pageId: string) {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const page = figma.getNodeById(pageId) as PageNode;
  if (!page || page.type !== 'PAGE') {
    throw new Error(`Page not found: ${pageId}`);
  }

  const clone = node.clone();
  page.appendChild(clone);

  return {
    id: clone.id,
    name: clone.name,
    type: clone.type,
    pageId: page.id,
    pageName: page.name,
    message: `Cloned "${node.name}" to page "${page.name}"`
  };
}

figma.showUI(__html__, { width: 300, height: 200, themeColors: true });
connectToBridge();
