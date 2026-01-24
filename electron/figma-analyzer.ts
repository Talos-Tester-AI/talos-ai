/**
 * Figma Integration Module
 * Analyzes Figma design files to extract screens and components for test context
 */

export interface FigmaScreen {
    nodeId: string;
    name: string;
    description?: string;
    children?: FigmaComponent[];
}

export interface FigmaComponent {
    nodeId: string;
    name: string;
    type: string;
    isInteractive?: boolean;
}

export interface FigmaAnalysisResult {
    screens: FigmaScreen[];
    components: FigmaComponent[];
    projectName?: string;
    lastModified?: string;
}

/**
 * Extract file key from Figma URL
 * Supports various Figma URL formats:
 * - https://www.figma.com/file/ABC123/Project-Name
 * - https://www.figma.com/design/ABC123/Project-Name
 * - https://figma.com/file/ABC123/Project-Name?node-id=...
 */
export function extractFileKey(figmaUrl: string): string | null {
    try {
        const url = new URL(figmaUrl);
        const pathParts = url.pathname.split('/');
        
        // Find the segment after 'file' or 'design'
        const fileIndex = pathParts.findIndex(p => p === 'file' || p === 'design');
        if (fileIndex !== -1 && pathParts[fileIndex + 1]) {
            return pathParts[fileIndex + 1];
        }
        
        return null;
    } catch (e) {
        console.error('[figma-analyzer] Invalid Figma URL:', figmaUrl);
        return null;
    }
}

/**
 * Interactive component types that should be identified for testing
 */
const INTERACTIVE_TYPES = [
    'INSTANCE',
    'COMPONENT',
    'COMPONENT_SET',
    'FRAME',
    'GROUP',
];

const INTERACTIVE_NAME_PATTERNS = [
    /button/i,
    /btn/i,
    /input/i,
    /field/i,
    /text.*field/i,
    /checkbox/i,
    /radio/i,
    /toggle/i,
    /switch/i,
    /dropdown/i,
    /select/i,
    /link/i,
    /tab/i,
    /menu/i,
    /modal/i,
    /dialog/i,
    /card/i,
    /list.*item/i,
    /nav/i,
    /header/i,
    /footer/i,
    /form/i,
    /search/i,
    /icon/i,
    /avatar/i,
    /badge/i,
    /chip/i,
    /slider/i,
    /progress/i,
    /spinner/i,
    /toast/i,
    /alert/i,
    /notification/i,
];

/**
 * Check if a component is likely interactive
 */
function isInteractiveComponent(name: string, type: string): boolean {
    // Check type
    if (!INTERACTIVE_TYPES.includes(type)) {
        return false;
    }
    
    // Check name patterns
    return INTERACTIVE_NAME_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Recursively extract components from Figma document tree
 */
function extractComponents(
    node: any,
    components: FigmaComponent[],
    maxDepth: number = 5,
    currentDepth: number = 0
): void {
    if (currentDepth > maxDepth || components.length > 200) {
        return;
    }
    
    const { id, name, type, children } = node;
    
    // Check if this is an interactive component
    if (isInteractiveComponent(name, type)) {
        components.push({
            nodeId: id,
            name: name,
            type: type,
            isInteractive: true,
        });
    }
    
    // Recurse into children
    if (children && Array.isArray(children)) {
        for (const child of children) {
            extractComponents(child, components, maxDepth, currentDepth + 1);
        }
    }
}

/**
 * Extract screens (top-level frames) from Figma document
 */
function extractScreens(document: any): FigmaScreen[] {
    const screens: FigmaScreen[] = [];
    
    // Navigate to the canvas (first page)
    const pages = document.children || [];
    
    for (const page of pages) {
        if (page.type !== 'CANVAS') continue;
        
        // Get top-level frames (screens)
        const frames = page.children || [];
        
        for (const frame of frames) {
            if (frame.type === 'FRAME' || frame.type === 'COMPONENT' || frame.type === 'COMPONENT_SET') {
                // Extract child components
                const childComponents: FigmaComponent[] = [];
                extractComponents(frame, childComponents);
                
                screens.push({
                    nodeId: frame.id,
                    name: frame.name,
                    description: frame.description,
                    children: childComponents,
                });
            }
        }
    }
    
    return screens;
}

/**
 * Fetch Figma file data from API
 */
async function fetchFigmaFile(fileKey: string, accessToken: string): Promise<any> {
    const url = `https://api.figma.com/v1/files/${fileKey}`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Figma-Token': accessToken,
        },
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Figma API error (${response.status}): ${errorText}`);
    }
    
    return response.json();
}

/**
 * Analyze a Figma project and extract screens and components
 */
export async function analyzeFigmaProject(
    figmaUrl: string,
    accessToken: string,
    onProgress?: (message: string) => void
): Promise<FigmaAnalysisResult> {
    // Extract file key from URL
    const fileKey = extractFileKey(figmaUrl);
    if (!fileKey) {
        throw new Error('Invalid Figma URL. Expected format: https://www.figma.com/file/FILE_KEY/...');
    }
    
    onProgress?.(`Fetching Figma file: ${fileKey}`);
    console.log(`[figma-analyzer] Fetching file: ${fileKey}`);
    
    // Fetch file data
    const fileData = await fetchFigmaFile(fileKey, accessToken);
    
    onProgress?.('Analyzing design structure...');
    console.log(`[figma-analyzer] Project: ${fileData.name}, Last modified: ${fileData.lastModified}`);
    
    // Extract screens
    const screens = extractScreens(fileData.document);
    console.log(`[figma-analyzer] Found ${screens.length} screens`);
    
    // Collect all unique components
    const allComponents: FigmaComponent[] = [];
    const seenIds = new Set<string>();
    
    for (const screen of screens) {
        if (screen.children) {
            for (const comp of screen.children) {
                if (!seenIds.has(comp.nodeId)) {
                    seenIds.add(comp.nodeId);
                    allComponents.push(comp);
                }
            }
        }
    }
    
    console.log(`[figma-analyzer] Found ${allComponents.length} interactive components`);
    
    return {
        screens: screens.map(s => ({
            nodeId: s.nodeId,
            name: s.name,
            description: s.description,
        })),
        components: allComponents,
        projectName: fileData.name,
        lastModified: fileData.lastModified,
    };
}

/**
 * Build a context string from Figma analysis for AI consumption
 */
export function buildFigmaContext(analysis: FigmaAnalysisResult): string {
    let context = `\n\n--- FIGMA DESIGN ANALYSIS ---\n`;
    context += `Project: ${analysis.projectName || 'Unknown'}\n`;
    context += `Last Modified: ${analysis.lastModified || 'Unknown'}\n\n`;
    
    context += `Screens/Pages (${analysis.screens.length}):\n`;
    for (const screen of analysis.screens) {
        context += `  - ${screen.name} (ID: ${screen.nodeId})`;
        if (screen.description) {
            context += `: ${screen.description}`;
        }
        context += '\n';
    }
    
    context += `\nInteractive Components (${analysis.components.length}):\n`;
    // Group components by type
    const byType = new Map<string, FigmaComponent[]>();
    for (const comp of analysis.components) {
        const list = byType.get(comp.type) || [];
        list.push(comp);
        byType.set(comp.type, list);
    }
    
    for (const [type, comps] of byType) {
        context += `  ${type}:\n`;
        for (const comp of comps.slice(0, 20)) { // Limit to 20 per type
            context += `    - ${comp.name} (ID: ${comp.nodeId})\n`;
        }
        if (comps.length > 20) {
            context += `    ... and ${comps.length - 20} more\n`;
        }
    }
    
    return context;
}

/**
 * Validate Figma configuration
 */
export function validateFigmaConfig(url?: string, token?: string): { valid: boolean; error?: string } {
    if (!url || !token) {
        return { valid: false, error: 'Figma URL and access token are required' };
    }
    
    const fileKey = extractFileKey(url);
    if (!fileKey) {
        return { valid: false, error: 'Invalid Figma URL format' };
    }
    
    if (token.length < 10) {
        return { valid: false, error: 'Invalid Figma access token' };
    }
    
    return { valid: true };
}

