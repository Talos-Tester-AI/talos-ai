import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'node:path';
import fs from 'fs-extra';
import { getProject } from './state';
import { BrowserWindow } from 'electron';

export function startAgentServer(port: number = 3000, mainWindow: BrowserWindow) {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json({ limit: '50mb' }));

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

            // Notify Frontend via IPC
            mainWindow.webContents.send('agent:step-result', result);

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
            }
            res.json({ status: 'ok' });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // Feature Setup Result
    app.post('/api/executor/feature-setup-result', async (req, res) => {
        // Similar to step result but storing in run.json under separate key or generic events
        // For simplicity, just log it and notify frontend
        res.json({ status: 'ok' });
    });

    // Feature Teardown Result
    app.post('/api/executor/feature-teardown-result', async (req, res) => {
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

            // Send initialization event
            sendEvent({ stage: 'init', message: 'Starting analysis...' });

            // Stage 1: Discovery
            sendEvent({ stage: 'discovery', message: 'Discovering project files...', detail: 'Scanning project directory' });
            
            // Simulate discovery (you can implement actual file discovery here)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Stage 2: Reading
            sendEvent({ stage: 'reading', message: 'Reading project context...', detail: 'Analyzing project structure' });
            
            // Read project files (implement actual logic as needed)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Stage 3: AI Analysis
            sendEvent({ stage: 'analysis', message: 'Performing AI analysis...', detail: 'Generating test proposals' });
            
            // This is where you would call your AI analysis logic
            // For now, returning a placeholder result
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Stage 4: Figma (if configured)
            if (config.figmaProjectUrl && config.figmaAccessToken) {
                sendEvent({ stage: 'figma', message: 'Processing Figma designs...', detail: 'Analyzing UI components' });
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Stage 5: Complete
            sendEvent({ stage: 'complete', message: 'Finalizing...', detail: 'Preparing results' });
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Send final result
            const result = {
                proposal: {
                    features: [],
                    testCases: []
                },
                figmaAnalysis: null
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

            // Merge proposal into plan
            if (proposal.features) {
                plan.features = [...(plan.features || []), ...proposal.features];
            }
            if (proposal.testCases) {
                plan.testCases = [...(plan.testCases || []), ...proposal.testCases];
            }

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
