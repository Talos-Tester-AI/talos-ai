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
import { generateTestProposal, validateAIConfig, type AIConfig } from './ai-analyzer';
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
                // Note: Frontend currently might expect base64 in SSE? 
                // For file storage, we want separate file.
                // Let's keep base64 in memory/SSE but remove from persistent file if needed.
                // Or just keep it. Talos-server keeps it in DB usually (or S3).
                // For local file, maybe keeping it in JSON makes single file huge.
                // Let's strip it from persisted JSON but keeping the file reference.
                result.screenshotPath = `screenshots/${filename}`;
                delete result.screenshotBase64;
            }

            // 2. Update run.json
            const runJsonPath = path.join(runDir, 'run.json');
            const runData = await fs.readJson(runJsonPath);

            // Look for existing step result to update or append
            // Step results in runData? 
            // Talos-server typically stores steps in separate collection or array in TestRun.
            // Let's assume runData has a 'results' array or similar.
            // If not, let's add it.
            if (!runData.stepResults) runData.stepResults = [];

            runData.stepResults.push(result);
            // Sort by start time? Or index. 
            runData.updatedAt = new Date().toISOString();

            await fs.writeJson(runJsonPath, runData, { spaces: 2 });

            // Notify Frontend via IPC and SSE
            mainWindow.webContents.send('agent:step-result', result);
            broadcast(testRunId, 'step_result', result);

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

                mainWindow.webContents.send('agent:run-status', { testRunId, status, message });
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
                mainWindow.webContents.send('agent:build-log', { testRunId, log });
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
            const { testRunId, testCaseId, passed, summary } = req.body;
            const runDir = await getRunDir(testRunId);
            if (runDir) {
                const runJsonPath = path.join(runDir, 'run.json');
                const runData = await fs.readJson(runJsonPath);

                if (!runData.testCasesComputed) runData.testCasesComputed = {};
                runData.testCasesComputed[testCaseId] = { passed, summary };

                await fs.writeJson(runJsonPath, runData, { spaces: 2 });
                mainWindow.webContents.send('agent:test-case-complete', req.body);
                // Broadcast with status property derived from passed boolean if needed, 
                // but req.body might not have 'status' string. Frontend expects 'status'.
                // req.body has { testRunId, testCaseId, passed, summary }
                broadcast(testRunId, 'test_case_complete', {
                    ...req.body,
                    status: passed ? 'passed' : 'failed'
                });
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
                mainWindow.webContents.send('agent:run-complete', req.body);
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
            mainWindow.webContents.send('project:updated', { id });

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
