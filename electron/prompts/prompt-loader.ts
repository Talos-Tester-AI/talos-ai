// Import prompts as raw strings at build time (Vite feature)
import fileDiscoveryPrompt from './file-discovery.txt?raw';
import testProposalPrompt from './test-proposal.txt?raw';
import figmaNodeAnalysisPrompt from './figma-node-analysis.txt?raw';
import screenshotComparisonPrompt from './screenshot-comparison.txt?raw';

/**
 * Get the file discovery prompt for identifying relevant project files
 */
export function getFileDiscoveryPrompt(): string {
    return fileDiscoveryPrompt;
}

/**
 * Get the test proposal prompt for generating test cases
 */
export function getTestProposalPrompt(): string {
    return testProposalPrompt;
}

/**
 * Get the Figma node analysis prompt for identifying nodes to capture
 */
export function getFigmaNodeAnalysisPrompt(): string {
    return figmaNodeAnalysisPrompt;
}

/**
 * Get the screenshot comparison prompt for validating test step execution
 */
export function getScreenshotComparisonPrompt(): string {
    return screenshotComparisonPrompt;
}

/**
 * Build the system prompt for test proposal generation
 * Returns the test proposal prompt (context should be passed in the user message)
 */
export function buildTestProposalPrompt(): string {
    return testProposalPrompt;
}
