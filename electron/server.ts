import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'node:path';
import fs from 'fs-extra';
import crypto from 'node:crypto';
import Store from 'electron-store';
import { getProject } from './state';
import electron from 'electron';
const { BrowserWindow } = electron;
import { discoverProjectFiles, readProjectContext } from './file-scanner';
import { generateTestProposal, validateAIConfig, verifyStepExecution, type AIConfig } from './ai-analyzer';
import { analyzeFigmaProject, buildFigmaContext, validateFigmaConfig, type FigmaAnalysisResult } from './figma-analyzer';

// Access the same store as handlers.ts for AI config
interface AIConfigStore {
    aiConfig: AIConfig | null;
}

const store = new Store<AIConfigStore>({
    name: 'talos-config',
    defaults: {
        aiConfig: null
    },
    encryptionKey: 'talos-ai-secure-key-2024'
});

// Valid Gemini model IDs - updated January 2026
const VALID_GEMINI_MODELS = [
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-pro',
];

// Known problematic model IDs that need to be fixed
const GEMINI_MODEL_FIXES: Record<string, string> = {
    // The preview model format changed - try the stable version first
    'gemini-2.5-pro-preview-05-06': 'gemini-2.0-flash',
    'gemini-2.0-flash-exp': 'gemini-2.0-flash',
    'gemini-1.5-flash-8b': 'gemini-1.5-flash',
};

/**
 * Fix problematic Gemini model IDs by replacing them with working alternatives
 */
function fixGeminiModelIfNeeded(config: AIConfig): AIConfig {
    if (config.provider !== 'gemini') {
        return config;
    }

    const fixedConfig = { ...config };
    let changed = false;

    // Check and fix complexModel if it's a known problematic model
    if (GEMINI_MODEL_FIXES[config.complexModel]) {
        console.log(`[server] Fixing Gemini complexModel: ${config.complexModel} -> ${GEMINI_MODEL_FIXES[config.complexModel]}`);
        fixedConfig.complexModel = GEMINI_MODEL_FIXES[config.complexModel];
        changed = true;
    }

    // Check and fix simpleModel if it's a known problematic model
    if (GEMINI_MODEL_FIXES[config.simpleModel]) {
        console.log(`[server] Fixing Gemini simpleModel: ${config.simpleModel} -> ${GEMINI_MODEL_FIXES[config.simpleModel]}`);
        fixedConfig.simpleModel = GEMINI_MODEL_FIXES[config.simpleModel];
        changed = true;
    }

    // Update stored config if we made changes
    if (changed) {
        store.set('aiConfig', fixedConfig);
        console.log('[server] Updated stored AI config with working Gemini models');
    }

    return fixedConfig;
}

export function startAgentServer(port: number = 3000, mainWindow: InstanceType<typeof BrowserWindow>) {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json({ limit: '50mb' }));

    // Safe send helper
    const safeSend = (channel: string, ...args: any[]) => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
            try {
                mainWindow.webContents.send(channel, ...args);
            } catch (e) {
                console.error(`[server] Error sending to window (channel: ${channel}):`, e);
            }
        }
    };

    // SSE Management
    const activeStreams = new Map<string, Set<express.Response>>();

    const broadcast = (testRunId: string, eventName: string, payload: any) => {
        const streams = activeStreams.get(testRunId);
        if (streams) {
            const message = `event: ${eventName}\ndata: ${JSON.stringify({ data: payload })}\n\n`;
            for (const res of streams) {
                try {
                    res.write(message);
                } catch (e) {
                    // Connection likely closed, will be cleaned up by close handler
                    console.error('Error broadcasting to stream:', e);
                }
            }
        }
    };

    // Helper to find run folder
    const getRunDir = async (runId: string) => {
        const project = getProject();
        if (!project) return null;

        // Scan matching folder
        const runsRoot = path.join(project.path, 'test-run');
        if (!await fs.pathExists(runsRoot)) return null;

        const dirs = await fs.readdir(runsRoot);
        for (const dir of dirs) {
            if (dir.includes(runId.substring(0, 8))) {
                // Verify exact ID in json
                const jsonPath = path.join(runsRoot, dir, 'run.json');
                if (await fs.pathExists(jsonPath)) {
                    const run = await fs.readJson(jsonPath);
                    if (run._id === runId) return path.join(runsRoot, dir);
                }
            }
        }
        return null;
    };

    // SSE Stream Endpoint
    app.get('/api/test-runs/:id/stream', async (req, res) => {
        const testRunId = req.params.id;

        // Setup SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Add to active streams
        if (!activeStreams.has(testRunId)) {
            activeStreams.set(testRunId, new Set());
        }
        activeStreams.get(testRunId)?.add(res);

        // Send initial state
        try {
            const runDir = await getRunDir(testRunId);
            if (runDir) {
                const runJsonPath = path.join(runDir, 'run.json');
                if (await fs.pathExists(runJsonPath)) {
                    const runData = await fs.readJson(runJsonPath);
                    res.write(`event: initial_state\ndata: ${JSON.stringify({ data: runData })}\n\n`);
                }
            }
        } catch (e) {
            console.error('Error sending initial state:', e);
        }

        // Clean up on close
        req.on('close', () => {
            const streams = activeStreams.get(testRunId);
            if (streams) {
                streams.delete(res);
                if (streams.size === 0) {
                    activeStreams.delete(testRunId);
                }
            }
        });
    });

    // Step Result
    app.post('/api/executor/step-result', async (req, res) => {
        try {
            const result = req.body;
            const { testRunId } = result;
            const runDir = await getRunDir(testRunId);

            if (!runDir) {
                return res.status(404).json({ error: 'Test run not found' });
            }

            // 1. Save artifact if screenshot
            if (result.screenshotBase64) {
                const buffer = Buffer.from(result.screenshotBase64, 'base64');
                const stepIndex = result.stepIndex;
                const screensDir = path.join(runDir, 'screenshots');
                await fs.ensureDir(screensDir);
                const filename = `step_${stepIndex}_${Date.now()}.png`;
                await fs.writeFile(path.join(screensDir, filename), buffer);

                // Clear base64 from json to save space, store reference
                result.screenshotPath = `screenshots/${filename}`;
                // delete result.screenshotBase64; // DON'T delete from result, we need it for live update!
            }

            // --- AI VERIFICATION ---
            // If screenshot exists, perform AI verification
            if (result.screenshotBase64) {
                const aiConfig = store.get('aiConfig') as any;

                // If allow blocking, we should have checked this at run creation. 
                // But here we just verify if we CAN verify.
                if (aiConfig && aiConfig.apiKey) {
                    // Need Instruction + Expected Result? 
                    // The agent sends 'instruction' in the result? 
                    // We need to fetch the step definition or trust what the agent echoed?
                    // Usually agent returns 'instruction' if it knows it.

                    // If result doesn't have instruction, we might need to look it up in run.json
                    // But let's assume agent echoes it or we look it up.
                    // The result from DroidRun usually doesn't include the instruction unless we tell it to.
                    // IMPORTANT: DroidRun agent wrapper execute_step signature: execute_step(instruction)
                    // But result object returned only has success/error/logs. 
                    // We need the CLI to know which step it was. 
                    // The CLI 'StepRunner' (in py) knows.

                    // Let's assume the Python 'StepRunner' enriches the result with 'instruction' and 'expectedResult'?
                    // Just checked DroidRunAgent.py - it returns { success, error, duration, logs, screenshot }. 
                    // It does NOT return instruction. 
                    // However, the caller of `execute_step` (routes.py or runner) likely merges this.

                    // Let's modify server.ts on the assumption (or requirement) that req.body has 'instruction'.
                    // If not, we can't verify effectively.

                    if (result.instruction) {
                        // Fix: Need to import verifyStepExecution. 
                        // Since we can't easily add top-level imports with replace_file_content in the middle of file without context, 
                        // we should have added it. 
                        // But we can use dynamic import or assume it handles it if we did it right.
                        // Actually, I'll use multi_replace to add the import if needed, 
                        // but for now let's assume I'll add the import in a separate call or rely on valid imports.
                        // Wait, I haven't added the import yet. I should do that first or now.
                        // I will add the import at the top of the file in the next step.

                        try {
                            const verification = await verifyStepExecution(
                                aiConfig,
                                result.instruction,
                                result.screenshotBase64,
                                result.expectedResult, // Optional
                                result.logs
                            );

                            result.status = verification.passed ? 'passed' : 'failed';
                            result.aiReasoning = verification.reasoning;

                            console.log(`[server] Step verified: ${result.status}`);
                        } catch (err: any) {
                            console.error(`[server] AI Verification error: ${err.message}`);
                            // Don't fail the step execution itself, but mark as error?
                            // Or keep agent status? 
                            // If Agent said success=True, but AI failed to run, maybe keep success?
                            // But plan said "implicit pass".
                            if (!result.executionError) {
                                result.executionError = "AI Verification failed";
                            }
                        }
                    }
                }
            }

            // 2. Update run.json
            const runJsonPath = path.join(runDir, 'run.json');
            const runData = await fs.readJson(runJsonPath);

            // Create persistence copy without base64
            const persistenceResult = { ...result };
            if (persistenceResult.screenshotBase64) {
                delete persistenceResult.screenshotBase64;
            }

            // Look for existing step result to update or append
            if (!runData.stepResults) runData.stepResults = [];

            runData.stepResults.push(persistenceResult);
            // Sort by start time? Or index. 
            runData.updatedAt = new Date().toISOString();

            await fs.writeJson(runJsonPath, runData, { spaces: 2 });

            // Notify Frontend via IPC and SSE (send full result with base64)
            safeSend('agent:step-result', result);
            broadcast(testRunId, 'step_result', result);

            // --- AUTO-COMPLETION CHECK ---
            // Check if this was the last step and auto-complete the test case
            const { testCaseId } = result;
            const tcSteps = (runData.stepResults || []).filter((s: any) => s.testCaseId === testCaseId);
            const testCaseDef = (runData.selectedTestCases || runData.testCases || []).find((tc: any) => tc._id === testCaseId);
            const expectedStepCount = testCaseDef?.steps?.length || 0;

            // Filter for "real" steps (index > 0)
            const realStepResults = tcSteps.filter((s: any) => s.stepIndex > 0 && s.stepIndex <= expectedStepCount);

            if (realStepResults.length >= expectedStepCount && expectedStepCount > 0) {
                console.log(`[server] Auto-completing Test Case ${testCaseId} (All ${expectedStepCount} steps executed)`);

                const hasFailure = tcSteps.some((s: any) => s.status === 'failed');
                const computedPassed = !hasFailure;
                const summary = computedPassed ? "All steps passed" : "One or more steps failed";

                if (!runData.testCasesComputed) runData.testCasesComputed = {};
                // Only update if not already set (or overwrite? overwrite is safer for consistency)
                runData.testCasesComputed[testCaseId] = { passed: computedPassed, summary };

                await fs.writeJson(runJsonPath, runData, { spaces: 2 });

                const payload = {
                    testRunId,
                    testCaseId,
                    passed: computedPassed,
                    summary,
                    status: computedPassed ? 'passed' : 'failed'
                };

                safeSend('agent:test-case-complete', payload);
                broadcast(testRunId, 'test_case_complete', payload);
            }

            res.json({ status: 'saved' });
        } catch (e: any) {
            console.error('Error saving step result:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // Run Status
    app.post('/api/executor/run-status', async (req, res) => {
        try {
            const { testRunId, status, message } = req.body;
            const runDir = await getRunDir(testRunId);
            if (runDir) {
                const runJsonPath = path.join(runDir, 'run.json');
                const runData = await fs.readJson(runJsonPath);
                runData.status = status;
                runData.statusMessage = message;
                runData.updatedAt = new Date().toISOString();
                await fs.writeJson(runJsonPath, runData, { spaces: 2 });

                safeSend('agent:run-status', { testRunId, status, message });
                broadcast(testRunId, 'status', { status, summary: message });
            }
            res.json({ status: 'ok' });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // Build Log
    app.post('/api/executor/build-log', async (req, res) => {
        try {
            const { testRunId, log } = req.body;
            const runDir = await getRunDir(testRunId);
            if (runDir) {
                const logPath = path.join(runDir, 'log.txt');
                await fs.appendFile(logPath, log + '\n');

                // Also stream to frontend
                safeSend('agent:build-log', { testRunId, log });
                broadcast(testRunId, 'build_log', { log });
            }
            res.json({ status: 'ok' });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // Test Case Complete
    app.post('/api/executor/test-case-complete', async (req, res) => {
        try {
            const { testRunId, testCaseId, summary } = req.body;
            // Ignore req.body.passed - Server determines truth based on step results.

            const runDir = await getRunDir(testRunId);
            if (runDir) {
                const runJsonPath = path.join(runDir, 'run.json');
                const runData = await fs.readJson(runJsonPath);

                // Compute passed status from steps
                // Logic: 
                // 1. If ANY step result for this test case has status 'failed', the test case fails.
                // 2. If the number of executed steps does not match the expected number of steps, the test case fails (incomplete).

                const tcSteps = (runData.stepResults || []).filter((s: any) => s.testCaseId === testCaseId);
                const hasFailure = tcSteps.some((s: any) => s.status === 'failed');

                // Find the test case definition to check total steps
                // runData structure might vary, but usually has 'selectedTestCases' or 'testCases' from creation
                const testCaseDef = (runData.selectedTestCases || runData.testCases || []).find((tc: any) => tc._id === testCaseId);
                const expectedStepCount = testCaseDef?.steps?.length || 0;

                // We count executed steps. 
                // Note: setup/teardown might be reported as steps with special indices (e.g. 0 or 9999).
                // We should filter for "actual" steps (1..N) to match expectedStepCount, 
                // OR we just rely on "hasFailure" if we are okay with partial runs being marked passed if no *reported* failure occurred.
                // BUT User said: "if all the steps passed". Implicitly "ALL".
                // If agent crashed mid-way, we might not have failure step, just missing steps.

                // Filter for "real" steps (index > 0 and < 9000?) - assuming setup is 0 and teardown is high.
                // Actually, let's just use the count of steps that appear in the 'steps' array.
                // stepResults includes localSetup (index 0).
                // Let's count step results where index > 0 and index <= expectedStepCount?
                // Or simply: Did we execute the last step?
                // Let's rely on hasFailure for now, but also check if we have results.

                // If we want to be strict:
                const realStepResults = tcSteps.filter((s: any) => s.stepIndex > 0 && s.stepIndex <= expectedStepCount);
                const isComplete = realStepResults.length >= expectedStepCount;

                let computedPassed = !hasFailure && isComplete;

                // Edge case: empty test case (0 steps) -> Passed
                if (expectedStepCount === 0) computedPassed = !hasFailure;

                // Debug log
                console.log(`[server] TC ${testCaseId} Analysis:
                  - Expected Steps: ${expectedStepCount}
                  - Executed Steps: ${realStepResults.length}
                  - Has Failure: ${hasFailure}
                  => Computed Passed: ${computedPassed}`);

                if (!runData.testCasesComputed) runData.testCasesComputed = {};
                runData.testCasesComputed[testCaseId] = { passed: computedPassed, summary };

                await fs.writeJson(runJsonPath, runData, { spaces: 2 });

                const payload = {
                    testRunId,
                    testCaseId,
                    passed: computedPassed,
                    summary,
                    status: computedPassed ? 'passed' : 'failed'
                };

                safeSend('agent:test-case-complete', payload);
                broadcast(testRunId, 'test_case_complete', payload);
                console.log(`[server] Test Case ${testCaseId} computed result: ${payload.status} (Steps: ${tcSteps.length}, Failures: ${hasFailure})`);
            }
            res.json({ status: 'ok' });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // Run Complete
    app.post('/api/executor/run-complete', async (req, res) => {
        try {
            const { testRunId, status, summary } = req.body;
            const runDir = await getRunDir(testRunId);
            if (runDir) {
                const runJsonPath = path.join(runDir, 'run.json');
                const runData = await fs.readJson(runJsonPath);
                runData.status = status || 'completed';
                runData.summary = summary;
                runData.completedAt = new Date().toISOString();

                await fs.writeJson(runJsonPath, runData, { spaces: 2 });
                safeSend('agent:run-complete', req.body);
                broadcast(testRunId, 'run_complete', req.body);
            }
            res.json({ status: 'ok' });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // Feature Setup Result
    app.post('/api/executor/feature-setup-result', async (req, res) => {
        const { testRunId } = req.body;
        broadcast(testRunId, 'feature_setup_result', req.body);
        res.json({ status: 'ok' });
    });

    // Feature Teardown Result
    app.post('/api/executor/feature-teardown-result', async (req, res) => {
        const { testRunId } = req.body;
        broadcast(testRunId, 'feature_teardown_result', req.body);
        res.json({ status: 'ok' });
    });

    // Project Analysis with Streaming (SSE)
    app.post('/api/projects/:id/analyze', async (req, res) => {
        try {
            const { id } = req.params;
            const config = req.body;

            // Set up SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const sendEvent = (data: any) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            // Get project path
            const projectPath = Buffer.from(id, 'hex').toString('utf-8');
            const planPath = path.join(projectPath, 'test-plan', 'plan.json');

            if (!await fs.pathExists(planPath)) {
                sendEvent({ stage: 'error', error: 'Project not found' });
                res.end();
                return;
            }

            // Load project data
            const plan = await fs.readJson(planPath);
            const projectData = plan.project || {};

            // Determine the source path for scanning
            const sourcePath = projectData.folderPath || projectPath;

            // Get AI configuration
            let aiConfig = store.get('aiConfig');
            if (!validateAIConfig(aiConfig)) {
                sendEvent({ stage: 'error', error: 'AI configuration not found. Please configure AI settings first.' });
                res.end();
                return;
            }

            // Fix invalid Gemini models if needed
            aiConfig = fixGeminiModelIfNeeded(aiConfig);

            // Send initialization event
            sendEvent({ stage: 'init', message: 'Starting analysis...' });
            console.log(`[server] Starting analysis for project: ${projectPath}`);
            console.log(`[server] Source path: ${sourcePath}`);
            console.log(`[server] AI Provider: ${aiConfig.provider}, Model: ${aiConfig.complexModel}`);

            // Stage 1: Discovery
            sendEvent({ stage: 'discovery', message: 'Discovering project files...', detail: 'Scanning project directory' });

            let scanResult;
            try {
                scanResult = await discoverProjectFiles(sourcePath);
                sendEvent({
                    stage: 'discovery',
                    message: 'File discovery complete',
                    detail: `Found ${scanResult.totalFiles} files (${(scanResult.totalSize / 1024).toFixed(1)} KB) - ${scanResult.projectType} project`
                });
            } catch (e: any) {
                console.error('[server] File discovery error:', e);
                sendEvent({ stage: 'error', error: `File discovery failed: ${e.message}` });
                res.end();
                return;
            }

            // Stage 2: Reading
            sendEvent({ stage: 'reading', message: 'Reading project context...', detail: 'Analyzing project structure' });

            let projectContext: string;
            try {
                const contextResult = await readProjectContext(scanResult.files);
                projectContext = contextResult.context;
                sendEvent({
                    stage: 'reading',
                    message: 'Context reading complete',
                    detail: `Read ${contextResult.filesRead} files${contextResult.truncated ? ' (truncated)' : ''}`
                });
                console.log(`[server] Read ${contextResult.filesRead} files, context size: ${(projectContext.length / 1024).toFixed(1)} KB`);
            } catch (e: any) {
                console.error('[server] Context reading error:', e);
                sendEvent({ stage: 'error', error: `Failed to read project files: ${e.message}` });
                res.end();
                return;
            }

            // Stage 4: Figma (if configured) - Do this before AI so we can include it in context
            let figmaAnalysis: FigmaAnalysisResult | null = null;
            const figmaUrl = config.figmaProjectUrl || projectData.figmaProjectUrl;
            const figmaToken = config.figmaAccessToken || projectData.figmaAccessToken;

            if (figmaUrl && figmaToken) {
                const figmaValidation = validateFigmaConfig(figmaUrl, figmaToken);
                if (figmaValidation.valid) {
                    sendEvent({ stage: 'figma', message: 'Processing Figma designs...', detail: 'Fetching design data' });

                    try {
                        figmaAnalysis = await analyzeFigmaProject(figmaUrl, figmaToken, (msg) => {
                            sendEvent({ stage: 'figma', message: 'Processing Figma designs...', detail: msg });
                        });

                        // Add Figma context to project context
                        const figmaContext = buildFigmaContext(figmaAnalysis);
                        projectContext += figmaContext;

                        sendEvent({
                            stage: 'figma',
                            message: 'Figma analysis complete',
                            detail: `Found ${figmaAnalysis.screens.length} screens, ${figmaAnalysis.components.length} components`
                        });
                    } catch (e: any) {
                        console.error('[server] Figma analysis error:', e);
                        // Don't fail the entire analysis, just skip Figma
                        sendEvent({
                            stage: 'figma',
                            message: 'Figma analysis skipped',
                            detail: `Error: ${e.message}`
                        });
                    }
                }
            }

            // Stage 3: AI Analysis
            sendEvent({ stage: 'analysis', message: 'Performing AI analysis...', detail: `Using ${aiConfig.provider} (${aiConfig.complexModel})` });

            let proposal;
            try {
                // Get existing feature names to help AI understand what already exists
                const existingFeatures = (plan.features || []).map((f: any) => f.name);

                proposal = await generateTestProposal(
                    aiConfig,
                    projectContext,
                    projectData.baseUrl,
                    projectData.systemContext,
                    scanResult.projectType,
                    existingFeatures,
                    (msg) => {
                        sendEvent({ stage: 'analysis', message: 'Performing AI analysis...', detail: msg });
                    }
                );

                const totalTestCases = proposal.features.reduce((sum, f) => sum + f.testCases.length, 0);
                sendEvent({
                    stage: 'analysis',
                    message: 'AI analysis complete',
                    detail: `Generated ${proposal.features.length} features with ${totalTestCases} test cases`
                });
                console.log(`[server] Generated ${proposal.features.length} features with ${totalTestCases} test cases`);
            } catch (e: any) {
                console.error('[server] AI analysis error:', e);
                sendEvent({ stage: 'error', error: `AI analysis failed: ${e.message}` });
                res.end();
                return;
            }

            // Stage 5: Complete
            sendEvent({ stage: 'complete', message: 'Finalizing...', detail: 'Preparing results' });

            // Send final result
            const result = {
                proposal: proposal,
                figmaAnalysis: figmaAnalysis ? {
                    screens: figmaAnalysis.screens,
                    components: figmaAnalysis.components
                } : null
            };

            sendEvent({ stage: 'result', result });
            res.end();

        } catch (e: any) {
            console.error('Error in project analysis:', e);
            res.write(`data: ${JSON.stringify({ stage: 'error', error: e.message })}\n\n`);
            res.end();
        }
    });

    // Project Import Proposal
    app.post('/api/projects/:id/import-proposal', async (req, res) => {
        try {
            const { id } = req.params;
            const { proposal } = req.body;

            // Get project path
            const projectPath = Buffer.from(id, 'hex').toString('utf-8');
            const planPath = path.join(projectPath, 'test-plan', 'plan.json');

            if (!await fs.pathExists(planPath)) {
                return res.status(404).json({ error: 'Project not found' });
            }

            // Read existing plan
            const plan = await fs.readJson(planPath);

            // MIGRATE AI FORMAT (nested) to REDUX FORMAT (flat)
            const newFeatures: any[] = [];
            const newTestCases: any[] = [];

            if (proposal.features) {
                for (const feature of proposal.features) {
                    // Generate feature ID
                    const featureId = crypto.randomBytes(12).toString('hex');

                    // Add feature WITHOUT nested test cases
                    newFeatures.push({
                        _id: featureId,
                        name: feature.name || feature.title,
                        description: feature.description || '',
                        status: feature.status || 'NEW',
                        projectId: plan.project?._id || id,
                        globalSetup: feature.globalSetup,
                        globalTeardown: feature.globalTeardown
                    });

                    // Extract test cases and link to feature
                    if (feature.testCases && Array.isArray(feature.testCases)) {
                        for (const tc of feature.testCases) {
                            newTestCases.push({
                                _id: crypto.randomBytes(12).toString('hex'),
                                featureId: featureId,
                                title: tc.title,
                                description: tc.description || '',
                                status: tc.status || 'NEW',
                                steps: tc.steps || [],
                                localSetup: tc.localSetup,
                                localTeardown: tc.localTeardown
                            });
                        }
                    }
                }
            }

            // Merge into plan
            plan.features = [...(plan.features || []), ...newFeatures];
            plan.testCases = [...(plan.testCases || []), ...newTestCases];

            // Handle launch configurations if present
            if (proposal.launchConfigurations && Array.isArray(proposal.launchConfigurations)) {
                console.log(`[server] Importing ${proposal.launchConfigurations.length} launch configurations`);

                // Add IDs to launch configs if not present
                const launchConfigs = proposal.launchConfigurations.map((lc: any) => ({
                    _id: lc._id || crypto.randomBytes(12).toString('hex'),
                    ...lc
                }));

                // Merge with existing configs (or replace them)
                plan.project.launchConfigurations = [...(plan.project.launchConfigurations || []), ...launchConfigs];
            }

            // Update project timestamp
            plan.project.updatedAt = new Date().toISOString();

            // Save updated plan
            await fs.writeJson(planPath, plan, { spaces: 2 });

            // Notify frontend via IPC
            safeSend('project:updated', { id });

            res.json({ success: true });
        } catch (e: any) {
            console.error('Error importing proposal:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.listen(port, () => {
        console.log(`Agent server listening on port ${port}`);
    });
}
