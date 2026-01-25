import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildTestProposalPrompt } from './prompts/prompt-loader';

export type AIProvider = 'openai' | 'claude' | 'gemini';

export interface AIConfig {
    provider: AIProvider;
    apiKey: string;
    complexModel: string;
    simpleModel: string;
}

export interface TestStep {
    instruction: string;
    expectedResult: string;
}

export interface TestCase {
    title: string;
    description: string;
    status: 'NEW' | 'MODIFIED' | 'UNCHANGED' | 'REMOVED';
    steps: TestStep[];
    localSetup?: { instruction: string };
    localTeardown?: { instruction: string };
    relatedFigmaNodeIds?: string[];
}

export interface Feature {
    name: string;
    description: string;
    status: 'NEW' | 'MODIFIED' | 'UNCHANGED';
    globalSetup?: { instruction: string; timeout?: number };
    globalTeardown?: { instruction: string };
    testCases: TestCase[];
}

export interface TestProposal {
    features: Feature[];
}

export interface FigmaAnalysis {
    screens: Array<{
        nodeId: string;
        name: string;
        description?: string;
    }>;
    components: Array<{
        nodeId: string;
        name: string;
        type: string;
    }>;
}

export interface AnalysisResult {
    proposal: TestProposal;
    figmaAnalysis: FigmaAnalysis | null;
}


/**
 * Build the user prompt with project context
 */
function buildUserPrompt(
    projectContext: string, 
    baseUrl?: string, 
    systemContext?: string, 
    projectType?: string,
    existingFeatures?: string[]
): string {
    let prompt = '';
    
    // Add context information
    if (systemContext) {
        prompt += `Additional Context: ${systemContext}\n\n`;
    }
    if (baseUrl) {
        prompt += `Application Base URL: ${baseUrl}\n\n`;
    }
    if (projectType) {
        prompt += `Detected Project Type: ${projectType}\n\n`;
    }
    
    prompt += `Analyze the following source code and generate a comprehensive test proposal:\n\n${projectContext}`;
    
    if (existingFeatures && existingFeatures.length > 0) {
        prompt += `\n\nEXISTING TEST SUITE:\nThe following features already exist in the test plan. You can suggest modifications (status: "MODIFIED") or mark them as unchanged (status: "UNCHANGED") if the code doesn't affect them:\n${existingFeatures.join(', ')}`;
    }
    
    return prompt;
}

/**
 * Parse the AI response to extract the test proposal
 */
function parseAIResponse(response: string): TestProposal {
    // Try to extract JSON from the response
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
    }
    
    jsonStr = jsonStr.trim();
    
    try {
        const parsed = JSON.parse(jsonStr);
        
        // Validate structure
        if (!parsed.features || !Array.isArray(parsed.features)) {
            console.error('[ai-analyzer] Invalid response structure, missing features array');
            return { features: [] };
        }
        
        // Ensure all features have required fields
        const features: Feature[] = parsed.features.map((f: any) => ({
            name: f.name || 'Unnamed Feature',
            description: f.description || '',
            status: f.status || 'NEW',
            globalSetup: f.globalSetup,
            globalTeardown: f.globalTeardown,
            testCases: (f.testCases || []).map((tc: any) => ({
                title: tc.title || 'Unnamed Test Case',
                description: tc.description || '',
                status: tc.status || 'NEW',
                steps: (tc.steps || []).map((s: any) => ({
                    instruction: s.instruction || '',
                    expectedResult: s.expectedResult || '',
                })),
                localSetup: tc.localSetup,
                localTeardown: tc.localTeardown,
                relatedFigmaNodeIds: tc.relatedFigmaNodeIds,
            })),
        }));
        
        return { features };
    } catch (e) {
        console.error('[ai-analyzer] Failed to parse AI response:', e);
        console.error('[ai-analyzer] Response was:', jsonStr.substring(0, 500));
        return { features: [] };
    }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string
): Promise<string> {
    const openai = new OpenAI({ apiKey });
    
    const response = await openai.chat.completions.create({
        model: model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 8000,
    });
    
    return response.choices[0]?.message?.content || '';
}

/**
 * Call Anthropic Claude API
 */
async function callClaude(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string
): Promise<string> {
    const anthropic = new Anthropic({ apiKey });
    
    const response = await anthropic.messages.create({
        model: model,
        max_tokens: 8000,
        system: systemPrompt,
        messages: [
            { role: 'user', content: userPrompt },
        ],
    });
    
    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
}

/**
 * Call Google Gemini API
 */
async function callGemini(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string
): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
        model: model,
        systemInstruction: systemPrompt,
    });
    
    const result = await geminiModel.generateContent(userPrompt);
    const response = await result.response;
    return response.text();
}

/**
 * Generate test proposal using configured AI provider
 */
export async function generateTestProposal(
    aiConfig: AIConfig,
    projectContext: string,
    baseUrl?: string,
    systemContext?: string,
    projectType?: string,
    existingFeatures?: string[],
    onProgress?: (message: string) => void
): Promise<TestProposal> {
    const systemPrompt = buildTestProposalPrompt();
    const userPrompt = buildUserPrompt(projectContext, baseUrl, systemContext, projectType, existingFeatures);
    
    onProgress?.(`Calling ${aiConfig.provider} API with model ${aiConfig.complexModel}...`);
    console.log(`[ai-analyzer] Calling ${aiConfig.provider} API with model ${aiConfig.complexModel}`);
    console.log(`[ai-analyzer] Context size: ${(projectContext.length / 1024).toFixed(2)} KB`);
    
    let responseText = '';
    
    try {
        switch (aiConfig.provider) {
            case 'openai':
                responseText = await callOpenAI(aiConfig.apiKey, aiConfig.complexModel, systemPrompt, userPrompt);
                break;
            case 'claude':
                responseText = await callClaude(aiConfig.apiKey, aiConfig.complexModel, systemPrompt, userPrompt);
                break;
            case 'gemini':
                responseText = await callGemini(aiConfig.apiKey, aiConfig.complexModel, systemPrompt, userPrompt);
                break;
            default:
                throw new Error(`Unsupported AI provider: ${aiConfig.provider}`);
        }
        
        console.log(`[ai-analyzer] Received response, length: ${responseText.length}`);
        onProgress?.('Parsing AI response...');
        
        return parseAIResponse(responseText);
    } catch (e: any) {
        console.error(`[ai-analyzer] Error calling ${aiConfig.provider}:`, e);
        throw new Error(`AI API error: ${e.message || 'Unknown error'}`);
    }
}

/**
 * Validate AI configuration
 */
export function validateAIConfig(config: any): config is AIConfig {
    return (
        config &&
        typeof config.provider === 'string' &&
        ['openai', 'claude', 'gemini'].includes(config.provider) &&
        typeof config.apiKey === 'string' &&
        config.apiKey.length > 0 &&
        typeof config.complexModel === 'string' &&
        config.complexModel.length > 0
    );
}

