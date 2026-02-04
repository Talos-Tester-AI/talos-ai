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

export interface LaunchConfiguration {
    _id?: string;
    name: string;
    type: string;
    request: string;
    program?: string;
    cwd?: string;
    args?: string[];
    env?: Record<string, string>;
    status?: 'NEW' | 'MODIFIED' | 'UNCHANGED' | 'REMOVED';
    [key: string]: unknown;
}

export interface TestProposal {
    features: Feature[];
    launchConfigurations?: LaunchConfiguration[];
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
            return { features: [], launchConfigurations: [] };
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

        // Extract launch configurations if present
        const launchConfigurations: LaunchConfiguration[] = (parsed.launchConfigurations || []).map((lc: any) => ({
            name: lc.name || 'Unnamed Launch Config',
            type: lc.type || 'node',
            request: lc.request || 'launch',
            program: lc.program,
            cwd: lc.cwd,
            args: lc.args,
            env: lc.env,
            status: lc.status || 'NEW',
            // Include any additional fields
            ...lc
        }));

        console.log(`[ai-analyzer] Parsed ${features.length} features and ${launchConfigurations.length} launch configurations`);

        return { features, launchConfigurations };
    } catch (e) {
        console.error('[ai-analyzer] Failed to parse AI response:', e);
        console.error('[ai-analyzer] Response was:', jsonStr.substring(0, 500));
        return { features: [], launchConfigurations: [] };
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

export interface StepVerificationResult {
    passed: boolean;
    reasoning: string;
    observations: string[];
    referenceComparison?: {
        matches: boolean;
        differences: string[];
    };
    error?: string;
}

// Import prompts
import { getScreenshotComparisonPrompt } from './prompts/prompt-loader';

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 2000,
    retryableStatusCodes: number[] = [429, 500, 503]
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // Check if error is retryable
            let isRetryable = false;

            // Check formatted status code (Gemini/OpenAI often put it in status or error.status)
            const status = error.status || error.response?.status;
            if (status && retryableStatusCodes.includes(status)) {
                isRetryable = true;
            }
            // Check error message content for common rate limit strings
            if (error.message && (
                error.message.includes('429') ||
                error.message.includes('Too Many Requests') ||
                error.message.includes('Resource exhausted')
            )) {
                isRetryable = true;
            }

            if (!isRetryable || attempt === maxRetries - 1) {
                throw error;
            }

            // Wait with exponential backoff + jitter
            const delay = baseDelay * Math.pow(2, attempt) + (Math.random() * 1000);
            console.log(`[ai-analyzer] Request failed with ${status || 'error'}. Retrying in ${(delay / 1000).toFixed(1)}s (Attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

/**
 * Verify step execution using AI
 */
export async function verifyStepExecution(
    aiConfig: AIConfig,
    stepInstruction: string,
    screenshotBase64: string,
    expectedResult?: string,
    logs?: string[],
    referenceImageBase64?: string
): Promise<StepVerificationResult> {
    try {
        console.log(`[ai-analyzer] Verifying step: "${stepInstruction}"`);

        const systemPrompt = getScreenshotComparisonPrompt();

        let userPrompt = `Step Instruction: ${stepInstruction}\n`;
        if (expectedResult) {
            userPrompt += `Expected Result: ${expectedResult}\n`;
        }

        if (logs && logs.length > 0) {
            userPrompt += `\nDevice Logs (tail):\n${logs.slice(-20).join('\n')}\n`;
        }



        let responseText = '';

        if (aiConfig.provider === 'gemini') {
            await retryWithBackoff(async () => {
                const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
                const model = genAI.getGenerativeModel({
                    model: aiConfig.complexModel,
                    systemInstruction: systemPrompt
                });

                const promptParts: any[] = [userPrompt];
                if (screenshotBase64) {
                    promptParts.push({
                        inlineData: {
                            data: screenshotBase64,
                            mimeType: "image/png"
                        }
                    });
                }
                if (referenceImageBase64) {
                    promptParts.push({ text: "Reference Image:" });
                    promptParts.push({
                        inlineData: {
                            data: referenceImageBase64,
                            mimeType: "image/png"
                        }
                    });
                }

                const result = await model.generateContent(promptParts);
                responseText = result.response.text();
            });

        } else if (aiConfig.provider === 'openai') {
            await retryWithBackoff(async () => {
                const openai = new OpenAI({ apiKey: aiConfig.apiKey });

                const messages: any[] = [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: userPrompt },
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } }
                        ]
                    }
                ];

                if (referenceImageBase64) {
                    messages[1].content.push({ type: 'text', text: "Reference Image:" });
                    messages[1].content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${referenceImageBase64}` } });
                }

                const response = await openai.chat.completions.create({
                    model: aiConfig.complexModel, // gpt-4o or similar
                    messages: messages,
                    max_tokens: 1000,
                    response_format: { type: "json_object" }
                });
                responseText = response.choices[0].message.content || '';
            });

        } else if (aiConfig.provider === 'claude') {
            await retryWithBackoff(async () => {
                const anthropic = new Anthropic({ apiKey: aiConfig.apiKey });

                const messageContent: any[] = [
                    { type: 'text', text: userPrompt },
                    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } }
                ];

                if (referenceImageBase64) {
                    messageContent.push({ type: 'text', text: "Reference Image:" });
                    messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: referenceImageBase64 } });
                }

                const response = await anthropic.messages.create({
                    model: aiConfig.complexModel,
                    max_tokens: 1000,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: messageContent }]
                });

                const textBlock = response.content.find(block => block.type === 'text');
                responseText = textBlock?.type === 'text' ? textBlock.text : '';
            });
        }

        // Parse JSON
        // Clean markdown
        let jsonStr = responseText.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

        const result = JSON.parse(jsonStr) as StepVerificationResult;
        return result;

    } catch (error: any) {
        console.error('[ai-analyzer] Verification failed:', error);
        return {
            passed: false,
            reasoning: `AI Verification failed to execute: ${error.message}`,
            observations: [],
            error: error.message
        };
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

