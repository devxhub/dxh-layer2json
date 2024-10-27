/* eslint-disable @typescript-eslint/no-explicit-any */
// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.

// Send the extracted layers to the UI
figma.showUI(__html__, { themeColors: true });

const layers: any[] = [];

// Helper function to extract common properties (like fills, strokes, and effects)
function extractCommonProperties(node: SceneNode) {
  return {
    fills: 'fills' in node ? node.fills : null,
    strokes: 'strokes' in node ? node.strokes : null,
    effects: 'effects' in node ? node.effects : null,
  };
}

// Helper function to extract the numeric part from node.id (after the colon)
function extractId(id: string): number {
  const parts = id.split(':');
  return parts.length > 1 ? parseInt(parts[1], 10) : parseInt(id, 10);
}

// Helper function to generate a UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Function to extract all layers, recursively traversing child layers
async function extractLayers(node: SceneNode) {
  const layer: any = {
    id: generateUUID(),
    type: node.type,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    zIndex: extractId(node.id),
    ...extractCommonProperties(node) // Add common properties
  };

  // If it's a text node, extract text-specific properties
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    layer.characters = textNode.characters;
    layer.fontSize = textNode.fontSize;
    layer.fontName = textNode.fontName;
  }

  // Check if it's an image or a node containing image data
  if (node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT') {
    const fills = (node as GeometryMixin).fills as Paint[];
    if (fills && fills[0].type === 'IMAGE') {
      const imageHash = fills[0].imageHash;
      if (imageHash) {
        const imageByHash = figma.getImageByHash(imageHash);
        if (imageByHash) {
          const imageBytes = await imageByHash.getBytesAsync();
          if (imageBytes) {
            layer.imageBytes = imageBytes;  // Store the image bytes in the layer
          } else {
            console.error(`Failed to extract image bytes for: ${node.name}`);
          }
        }
      }
    }
  }

  // Recursively extract children if applicable (for frames, groups, etc.)
  // If it's a frame, group, or component, recursively extract its children
  if ('children' in node) {
    const childLayers: any[] = [];
    for (const child of node.children) {
      const childLayer = await extractLayers(child);
      childLayers.push(childLayer);
    }
    layer.layers = childLayers;
  }  

  return layer;
}

// Traverse the selection and extract all layers using async/await
async function extractSelectedLayers() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    console.log("No layers selected.");
    return;
  }

  for (const node of selection) {
    const extractedLayer = await extractLayers(node);
    layers.push(extractedLayer);
  }

  figma.ui.postMessage(layers); // Move this line here to ensure it sends after processing
}

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'close') {
    figma.closePlugin();
  }

  if (msg.type === 'generate') {
    console.log('Generating JSON file...');
    await extractSelectedLayers(); // Ensures all layers are processed before sending
  }
};
