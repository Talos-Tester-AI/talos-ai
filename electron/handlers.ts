import electron from 'electron';
const { ipcMain, dialog, BrowserWindow, app } = electron;
import path from 'node:path';
import fs from 'fs-extra';
import { randomUUID } from 'node:crypto';
import { setProject, getProject, getServerPort } from './state';
import { addProjectToStore, getProjectsFromStore, removeProjectFromStore, updateProjectInStore } from './projectStore';
import Store from 'electron-store';

// Type definitions for plan structure
interface Feature {
    _id: string;
    name: string;
    projectId?: string;
    [key: string]: unknown;
}

interface TestCase {
    _id: string;
    featureId: string;
    projectId?: string;
    [key: string]: unknown;
}

interface ProjectData {
    _id?: string;
    name?: string;
    baseUrl?: string;
    systemContext?: string;
    createdAt?: string;
    updatedAt?: string;
    launchConfigurations?: unknown[];
    [key: string]: unknown;
}

interface Plan {
    project: ProjectData;
    features?: Feature[];
    testCases?: TestCase[];
}

// Executor configuration
const EXECUTOR_URL = process.env.EXECUTOR_URL || 'http://localhost:8000';

/**
 * Send the AI API key to the executor service.
 * This configures the executor to use the key for the upcoming test run.
 */
async function sendConfigToExecutor(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${EXECUTOR_URL}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geminiApiKey: apiKey })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[handlers] Failed to configure executor:', error);
            return false;
        }

        console.log('[handlers] Executor configured with API key');
        return true;
    } catch (error) {
        console.error('[handlers] Error connecting to executor:', error);
        return false;
    }
}

/**
 * Trigger test execution on the executor service.
 */
async function triggerExecution(executionRequest: any): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch(`${EXECUTOR_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(executionRequest)
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[handlers] Executor returned error:', error);
            return { success: false, error };
        }

        const result = await response.json();
        console.log('[handlers] Execution started:', result);
        return { success: true };
    } catch (error: any) {
        console.error('[handlers] Error triggering execution:', error);
        return { success: false, error: error.message || 'Failed to connect to executor' };
    }
}

// Initialize electron-store for AI configuration
interface AIConfigStore {
    aiConfig: {
        provider: 'openai' | 'claude' | 'gemini';
        apiKey: string;
        complexModel: string;
        simpleModel: string;
    } | null;
}

const store = new Store<AIConfigStore>({
    name: 'talos-config',
    defaults: {
        aiConfig: null
    },
    encryptionKey: 'talos-ai-secure-key-2024' // Basic encryption for API keys
});

// Mapping of hex-encoded path (ID) to actual path
const getPathFromId = (id: string) => Buffer.from(id, 'hex').toString('utf-8');
const getIdFromPath = (p: string) => Buffer.from(p).toString('hex');
const encodeId = (p: string) => Buffer.from(p).toString('hex');
// const decodeId = (id: string) => Buffer.from(id, 'hex').toString('utf-8');

export function setupHandlers(mainWindow: InstanceType<typeof BrowserWindow>) {
    // Browse Directory
    ipcMain.handle('dialog:browse', async () => {
        try {
            console.log('[handlers] dialog:browse called');
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Select Project Folder',
                properties: ['openDirectory'],
                buttonLabel: 'Select Folder'
            });
            console.log('[handlers] dialog result:', result);
            if (result.canceled || result.filePaths.length === 0) return null;
            return result.filePaths[0];
        } catch (error) {
            console.error('[handlers] Error in dialog:browse:', error);
            throw error;
        }
    });

    // Project Selection
    ipcMain.handle('project:select', async () => {
        try {
            console.log('[handlers] project:select called');
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Open Project Folder',
                properties: ['openDirectory'],
                buttonLabel: 'Open Project'
            });
            console.log('[handlers] project:select result:', result);

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }

            const projectPath = result.filePaths[0];
            const projectId = encodeId(projectPath);

            setProject({ id: projectId, path: projectPath }); // Update state

            const planPath = path.join(projectPath, 'test-plan', 'plan.json');

            // Ensure structure exists
            await fs.ensureDir(path.join(projectPath, 'test-plan'));
            await fs.ensureDir(path.join(projectPath, 'test-run'));

            let projectData;
            if (await fs.pathExists(planPath)) {
                const plan = await fs.readJson(planPath);
                projectData = plan.project;
            } else {
                // Create new project structure
                projectData = {
                    _id: projectId,
                    name: path.basename(projectPath),
                    baseUrl: '',
                    systemContext: 'New Talos Project',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const initialPlan = {
                    project: projectData,
                    features: [],
                    testCases: []
                };

                await fs.writeJson(planPath, initialPlan, { spaces: 2 });
            }

            // Add to persistent store
            await addProjectToStore({
                _id: projectId,
                name: projectData.name,
                path: projectPath,
                baseUrl: projectData.baseUrl,
                systemContext: projectData.systemContext,
                createdAt: projectData.createdAt,
                updatedAt: projectData.updatedAt
            });

            // Ensure ID matches path (in case moved)
            return { ...projectData, _id: projectId };
        } catch (error) {
            console.error('[handlers] Error in project:select:', error);
            throw error;
        }
    });

    // Project Create
    ipcMain.handle('project:create', async (_, data) => {
        // If folderPath is provided, use it. Otherwise open dialog.
        let parentFolderPath = data.folderPath;

        if (!parentFolderPath) {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Select Parent Folder for New Project',
                properties: ['openDirectory', 'createDirectory']
            });

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }
            parentFolderPath = result.filePaths[0];
        }

        // Construct the full project path: parent/ProjectName
        if (!data.name) {
            throw new Error("Project name is required to create a project directory.");
        }

        const projectPath = path.join(parentFolderPath, data.name);

        // Check if directory already exists to prevent accidental overwrite or confusion
        if (await fs.pathExists(projectPath)) {
            // It's okay if it exists but is empty? 
            // For safety, let's just error if it exists for now, consistent with "New Project" semantics
            // Or only error if it already has a plan.json?
            // User requested "ensure valid directory name and create new directory".
            // If it exists, we should probably warn.
            const files = await fs.readdir(projectPath);
            if (files.length > 0) {
                throw new Error(`Directory already exists and is not empty: ${projectPath}`);
            }
        }

        // Create the directory
        await fs.ensureDir(projectPath);

        const projectId = encodeId(projectPath);

        setProject({ id: projectId, path: projectPath });

        const planPath = path.join(projectPath, 'test-plan', 'plan.json');

        // Ensure structure exists inside the NEW project directory
        await fs.ensureDir(path.join(projectPath, 'test-plan'));
        await fs.ensureDir(path.join(projectPath, 'test-run'));

        // Initialize with form data
        const projectData = {
            _id: projectId,
            name: data.name,
            baseUrl: data.baseUrl || '',
            systemContext: data.systemContext || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const initialPlan = {
            project: projectData,
            features: [],
            testCases: []
        };

        await fs.writeJson(planPath, initialPlan, { spaces: 2 });

        // Add to persistent store
        await addProjectToStore({
            _id: projectId,
            name: projectData.name,
            path: projectPath,
            baseUrl: projectData.baseUrl,
            systemContext: projectData.systemContext,
            createdAt: projectData.createdAt,
            updatedAt: projectData.updatedAt
        });

        return { ...projectData, _id: projectId };
    });

    // Project Update
    ipcMain.handle('project:update', async (_, id, data) => {
        try {
            console.log(`[handlers] project:update called for project ${id}`);
            console.log(`[handlers] Update payload keys: ${Object.keys(data).join(', ')}`);
            if (data.launchConfigurations) {
                console.log(`[handlers] Saving ${data.launchConfigurations.length} configs`);
                // Log the first config to sanity check structure
                if (data.launchConfigurations.length > 0) {
                    console.log(`[handlers] First config sample:`, JSON.stringify(data.launchConfigurations[0], null, 2));
                }
            }

            const currentProject = getProject();
            if (!currentProject || currentProject.id !== id) {
                console.error(`[handlers] Project ID mismatch. Current: ${currentProject?.id}, Request: ${id}`);
                throw new Error("Project not active");
            }

            const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
            if (!await fs.pathExists(planPath)) {
                console.error(`[handlers] Plan file missing at ${planPath}`);
                throw new Error('Project plan file not found');
            }

            const plan = await fs.readJson(planPath);

            // Critical trace: Log what we are about to write if it involves launch configs
            if (data.launchConfigurations) {
                // Double check we are actually updating the object
            }

            // Update fields
            plan.project = {
                ...plan.project,
                ...data,
                updatedAt: new Date().toISOString()
            };

            await fs.writeJson(planPath, plan, { spaces: 2 });
            console.log(`[handlers] project:update write successful to ${planPath}`);

            // Update persistent store
            await updateProjectInStore(id, data);

            return plan.project;
        } catch (error) {
            console.error(`[handlers] project:update failed:`, error);
            throw error;
        }
    });

    // Project Delete
    ipcMain.handle('project:delete', async (_, id) => {
        const currentProject = getProject();
        // For safety, we only allow deleting the currently open project for now, 
        // effectively "closing and deleting" it. 
        // In a real app we might just delete the config entry, but here we might delete the folder? 
        // Let's just delete the plan.json or rename it? 
        // User asked for delete, let's be careful. 
        // For now, let's just clear the current project state and maybe delete the plan file?
        // Actually, let's just implement it as 'close project' or 'remove from list' if we had a list.
        // But since we track by folder, 'delete' on FS is dangerous.
        // Let's assuming "Delete" means "Move to Trash".

        // Remove from persistent store
        await removeProjectFromStore(id);

        if (currentProject && currentProject.id === id) {
            // const trash = await import('trash'); // if available
            // For now, let's just rename it to .deleted
            // Or better, just unset the project.
            setProject(null);
        }

        // If we want to support actual deletion:
        // await shell.trasItem(currentProject.path);

        return { success: true };
    });

    // Project Select (Existing)

    // Get Project (just metadata)
    ipcMain.handle('project:get', async (_, id) => {
        const projectPath = getPathFromId(id);
        const planPath = path.join(projectPath, 'test-plan', 'plan.json');
        if (!await fs.pathExists(planPath)) throw new Error('Project not found');
        const plan = await fs.readJson(planPath);
        return { ...plan.project, _id: id };
    });

    // Get FULL Project (project + features + testCases) - ONE CALL FOR REDUX
    ipcMain.handle('project:getFull', async (_, id) => {
        console.log('[handlers] project:getFull - Loading EVERYTHING for project:', id);
        const projectPath = getPathFromId(id);
        const planPath = path.join(projectPath, 'test-plan', 'plan.json');
        if (!await fs.pathExists(planPath)) throw new Error('Project not found');

        // Set this project as active so subsequent operations work
        setProject({ id, path: projectPath });

        const plan = await fs.readJson(planPath) as Plan;

        const result = {
            project: { ...plan.project, _id: id },
            features: plan.features || [],
            testCases: plan.testCases || []
        };

        console.log('[handlers] project:getFull - Returning', result.features.length, 'features and', result.testCases.length, 'test cases');
        return result;
    });

    // List all known projects from persistent storage
    ipcMain.handle('project:list', async () => {
        return await getProjectsFromStore();
    });

    // Features List
    ipcMain.handle('feature:list', async (_, projectId) => {
        const projectPath = getPathFromId(projectId);
        const planPath = path.join(projectPath, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);
        return plan.features || [];
    });

    // Feature Reorder
    ipcMain.handle('feature:reorder', async (_, projectId, featureIds) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");

        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath) as Plan;

        // Sort features based on the new order of IDs
        const newFeatures: Feature[] = [];
        const featureMap = new Map((plan.features || []).map((f) => [f._id, f]));

        for (const id of featureIds) {
            if (featureMap.has(id)) {
                const feature = featureMap.get(id);
                if (feature) newFeatures.push(feature);
                featureMap.delete(id);
            }
        }

        // Append any remaining features (shouldn't happen usually but good for safety)
        for (const [, f] of featureMap) {
            newFeatures.push(f);
        }

        plan.features = newFeatures;
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return plan.features;
    });

    // Feature Get
    ipcMain.handle('feature:get', async (_, id) => {
        console.log('[handlers] feature:get called for ID:', id);
        let currentProject = getProject();

        // If no project is selected, try to find the project containing this feature
        if (!currentProject) {
            console.log('[handlers] No current project, searching all known projects...');
            const projects = await getProjectsFromStore();
            console.log('[handlers] Found', projects.length, 'projects in store');

            for (const proj of projects) {
                const planPath = path.join(proj.path, 'test-plan', 'plan.json');
                console.log('[handlers] Checking project:', proj.name, 'at', planPath);

                if (await fs.pathExists(planPath)) {
                    const plan = await fs.readJson(planPath) as Plan;
                    console.log('[handlers] Project has', (plan.features || []).length, 'features');
                    const feature = plan.features?.find((f) => f._id === id);
                    if (feature) {
                        // Found the feature! Set this as the active project
                        console.log('[handlers] Found feature in project:', proj.name);
                        setProject({ id: proj._id, path: proj.path });
                        currentProject = getProject();
                        break;
                    }
                } else {
                    console.log('[handlers] Plan file does not exist at', planPath);
                }
            }

            if (!currentProject) {
                console.error('[handlers] Feature not found in any project. Projects checked:', projects.length);
                throw new Error("No project selected and feature not found in any known project");
            }
        }

        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath) as Plan;

        const feature = plan.features?.find((f) => f._id === id);
        if (!feature) {
            console.error('[handlers] Feature not found in current project plan');
            throw new Error("Feature not found");
        }
        console.log('[handlers] Returning feature:', feature.name);
        return feature;
    });

    // Feature Create
    ipcMain.handle('feature:create', async (_, projectId, data) => {
        const projectPath = getPathFromId(projectId);
        const planPath = path.join(projectPath, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);

        const newFeature = {
            _id: randomUUID(),
            ...data,
            projectId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        plan.features = [...(plan.features || []), newFeature];
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return newFeature;
    });

    // Feature Update
    ipcMain.handle('feature:update', async (_, id, data) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");

        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath) as Plan;

        const index = plan.features?.findIndex((f) => f._id === id) ?? -1;
        if (index === -1) throw new Error("Feature not found");

        if (plan.features) {
            plan.features[index] = { ...plan.features[index], ...data, updatedAt: new Date().toISOString() };
        }
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return plan.features?.[index];
    });

    // Feature Delete
    ipcMain.handle('feature:delete', async (_, id) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");
        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath) as Plan;

        plan.features = plan.features?.filter((f) => f._id !== id);
        // Also delete test cases?
        plan.testCases = plan.testCases?.filter((tc) => tc.featureId !== id);

        await fs.writeJson(planPath, plan, { spaces: 2 });
        return { success: true };
    });

    // Test Cases List - STATELESS, searches all projects
    ipcMain.handle('testcase:list', async (_, featureId) => {
        console.log('[handlers] testcase:list called for feature:', featureId);

        // Search ALL projects to find the one containing this feature
        const projects = await getProjectsFromStore();
        console.log('[handlers] Searching', projects.length, 'projects for feature', featureId);

        for (const proj of projects) {
            const planPath = path.join(proj.path, 'test-plan', 'plan.json');
            if (await fs.pathExists(planPath)) {
                const plan = await fs.readJson(planPath) as Plan;
                const feature = plan.features?.find((f) => f._id === featureId);
                if (feature) {
                    console.log('[handlers] Found feature in project:', proj.name, '- returning test cases');
                    return plan.testCases?.filter((tc) => tc.featureId === featureId) || [];
                }
            }
        }

        console.error('[handlers] Feature not found in any project:', featureId);
        return [];
    });

    // Test Case Reorder
    ipcMain.handle('testcase:reorder', async (_, featureId, testCaseIds) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");

        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath) as Plan;

        // We only reorder test cases belonging to this feature.
        // Others must remain untouched.
        const otherTestCases = plan.testCases?.filter((tc) => tc.featureId !== featureId) || [];
        const featureTestCases = plan.testCases?.filter((tc) => tc.featureId === featureId) || [];

        const newFeatureTestCases: TestCase[] = [];
        const tcMap = new Map(featureTestCases.map((tc) => [tc._id, tc]));

        for (const id of testCaseIds) {
            if (tcMap.has(id)) {
                const tc = tcMap.get(id);
                if (tc) newFeatureTestCases.push(tc);
                tcMap.delete(id);
            }
        }

        // Append checks
        for (const [, tc] of tcMap) {
            newFeatureTestCases.push(tc);
        }

        // Update TestStep order field? Or just array order? 
        // Talos usually relies on array order, but let's just save the array.

        plan.testCases = [...otherTestCases, ...newFeatureTestCases];
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return newFeatureTestCases;
    });

    // Test Case Create
    ipcMain.handle('testcase:create', async (_, featureId, data) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");
        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);

        const newTestCase = {
            _id: randomUUID(),
            ...data,
            featureId,
            projectId: currentProject.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        plan.testCases = [...(plan.testCases || []), newTestCase];
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return newTestCase;
    });

    // Test Case Update (STATELESS - auto-discovers project)
    ipcMain.handle('testcase:update', async (_, id, data) => {
        console.log('[handlers] testcase:update - Searching for test case:', id);

        // Search all known projects to find the one containing this test case
        const projects = await getProjectsFromStore();

        for (const proj of projects) {
            try {
                const planPath = path.join(proj.path, 'test-plan', 'plan.json');
                if (!await fs.pathExists(planPath)) continue;

                const plan = await fs.readJson(planPath) as Plan;
                if (!plan.testCases) continue;

                const index = plan.testCases.findIndex((tc) => tc._id === id);

                if (index !== -1) {
                    // Found it! Update the test case
                    plan.testCases[index] = {
                        ...plan.testCases[index],
                        ...data,
                        updatedAt: new Date().toISOString()
                    };
                    await fs.writeJson(planPath, plan, { spaces: 2 });
                    console.log('[handlers] testcase:update - Updated in project:', proj._id);
                    return plan.testCases[index];
                }
            } catch {
                continue;
            }
        }

        throw new Error('Test Case not found in any project');
    });

    // Test Case Delete (STATELESS - auto-discovers project)
    ipcMain.handle('testcase:delete', async (_, id) => {
        console.log('[handlers] testcase:delete - Searching for test case:', id);

        // Search all known projects to find the one containing this test case
        const projects = await getProjectsFromStore();

        for (const proj of projects) {
            try {
                const planPath = path.join(proj.path, 'test-plan', 'plan.json');
                if (!await fs.pathExists(planPath)) continue;

                const plan = await fs.readJson(planPath) as Plan;
                if (!plan.testCases) continue;

                const found = plan.testCases.some((tc) => tc._id === id);

                if (found) {
                    // Found it! Delete the test case
                    plan.testCases = plan.testCases.filter((tc) => tc._id !== id);
                    await fs.writeJson(planPath, plan, { spaces: 2 });
                    console.log('[handlers] testcase:delete - Deleted from project:', proj._id);
                    return { success: true };
                }
            } catch {
                continue;
            }
        }

        throw new Error('Test Case not found in any project');
    });

    // Image Upload
    ipcMain.handle('image:upload', async (_, projectId, fileData) => {
        // fileData: { name, path, size, type }
        // We need to copy fileData.path to project/test-plan/images/
        const currentProject = getProject();
        if (!currentProject || currentProject.id !== projectId && projectId) {
            // If projectId is provided, check if it matches current. 
            // Ideally we just use currentProject.
        }
        if (!currentProject) throw new Error("No project selected");

        const imagesDir = path.join(currentProject.path, 'test-plan', 'images');
        await fs.ensureDir(imagesDir);

        const ext = path.extname(fileData.name);
        const newFilename = `${randomUUID()}${ext}`;
        const destPath = path.join(imagesDir, newFilename);

        await fs.copy(fileData.path, destPath);

        // Return object expected by frontend: { _id, originalName }
        // Frontend constructs URL based on ID? 
        // Webapp serves /api/images/:id
        // Here we need to serve via custom protocol or static file.
        // Let's return the filename as ID.
        return {
            _id: newFilename,
            originalName: fileData.name,
            url: `file://${destPath}` // Or use a custom protocol for better security
        };
    });

    // Test Run Cancel
    ipcMain.handle('testrun:cancel', async (_, runId) => {
        console.log('[handlers] testrun:cancel called for:', runId);
        try {
            // Call executor to cancel
            const response = await fetch(`${EXECUTOR_URL}/execute/cancel/${runId}`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('[handlers] Failed to cancel test run on executor:', error);
                throw new Error(`Failed to cancel: ${error}`);
            }

            const result = await response.json();
            console.log('[handlers] Cancellation result:', result);
            return result;
        } catch (error) {
            console.error('[handlers] Error cancelling test run:', error);
            throw error;
        }
    });

    // Test Run Create
    ipcMain.handle('testrun:create', async (_, data) => {
        // data: { projectId, selectedFeatureIds, selectedTestCases, selectedLaunchConfigIds, scope }
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");

        // Create run folder
        const runId = randomUUID();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const runDirName = `${timestamp}_${runId.substring(0, 8)}`;
        const runPath = path.join(currentProject.path, 'test-run', runDirName);
        await fs.ensureDir(runPath);

        const runData = {
            _id: runId,
            ...data,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            logPath: path.join(runPath, 'log.txt')
        };

        await fs.writeJson(path.join(runPath, 'run.json'), runData, { spaces: 2 });
        await fs.writeFile(path.join(runPath, 'log.txt'), '');

        // === Send AI configuration to executor ===
        const aiConfig = store.get('aiConfig');

        // CRITICAL: Block test execution if no AI key is configured
        if (!aiConfig?.apiKey) {
            console.error('[handlers] AI Configuration Missing - Blocking test run creation');
            throw new Error("AI Configuration Missing: Please configure an API Key in settings before starting a test. This is required for result verification.");
        }

        if (aiConfig?.apiKey) {
            const configSuccess = await sendConfigToExecutor(aiConfig.apiKey);
            if (!configSuccess) {
                console.warn('[handlers] Could not configure executor with API key, execution may fail');
            }
        }

        // === Build execution request and trigger executor ===
        try {
            const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
            const plan = await fs.readJson(planPath) as Plan;

            // Determine which test cases to run based on scope
            let testCasesToRun: TestCase[] = [];
            let featuresToRun: Feature[] = [];

            const scope = data.scope || 'project';
            const selectedFeatureIds = data.selectedFeatureIds || [];
            const selectedTestCases = data.selectedTestCases || [];
            const selectedLaunchConfigIds = data.selectedLaunchConfigIds || [];

            if (scope === 'project') {
                // Run all test cases
                testCasesToRun = plan.testCases || [];
                featuresToRun = plan.features || [];
            } else if (scope === 'features' && selectedFeatureIds.length > 0) {
                // Run test cases from selected features
                featuresToRun = (plan.features || []).filter((f) => selectedFeatureIds.includes(f._id));
                testCasesToRun = (plan.testCases || []).filter((tc) => selectedFeatureIds.includes(tc.featureId));
            } else if (scope === 'testcases' && selectedTestCases.length > 0) {
                // Run specific test cases
                const selectedIds = selectedTestCases.map((s: { testCaseId: string }) => s.testCaseId);
                testCasesToRun = (plan.testCases || []).filter((tc) => selectedIds.includes(tc._id));
                const featureIds = [...new Set(testCasesToRun.map((tc) => tc.featureId))];
                featuresToRun = (plan.features || []).filter((f) => featureIds.includes(f._id));
            }

            // PRIORITIZE: Sort test cases to ensure they execute grouped by feature
            // This prevents "jumping" between features and ensures global setup/teardown runs correctly once per feature
            const featureOrderMap = new Map<string, number>();
            featuresToRun.forEach((f, index) => {
                featureOrderMap.set(f._id, index);
            });

            testCasesToRun.sort((a, b) => {
                const orderA = featureOrderMap.get(a.featureId) ?? 9999;
                const orderB = featureOrderMap.get(b.featureId) ?? 9999;
                return orderA - orderB;
            });

            // Get launch configuration (use first selected for now)
            let launchConfig: Record<string, unknown> | null | undefined = null;
            if (selectedLaunchConfigIds.length > 0 && plan.project?.launchConfigurations) {
                const configs = plan.project.launchConfigurations as Array<Record<string, unknown> & { _id?: string }>;
                launchConfig = configs.find((lc) => lc._id === selectedLaunchConfigIds[0]);
            }

            // Build features map for the executor
            const featuresMap: Record<string, any> = {};
            for (const feature of featuresToRun) {
                featuresMap[feature._id] = {
                    name: feature.name,
                    globalSetup: ((feature as any).globalSetup && (feature as any).globalSetup.instruction) ? (feature as any).globalSetup : null,
                    globalTeardown: ((feature as any).globalTeardown && (feature as any).globalTeardown.instruction) ? (feature as any).globalTeardown : null
                };
            }

            // Build test cases in executor format
            const serverPort = getServerPort() || 3101;
            const serverUrl = `http://127.0.0.1:${serverPort}`;

            const testCasesForExecutor = testCasesToRun.map((tc: any) => {
                const feature = featuresToRun.find((f: any) => f._id === tc.featureId);
                return {
                    testRunId: runId,
                    serverUrl: serverUrl,  // Pass the CLI server URL to the agent
                    featureId: tc.featureId,
                    featureName: feature?.name || 'Unknown Feature',
                    testCaseId: tc._id,
                    testCaseTitle: tc.title,
                    steps: (tc.steps || []).map((step: any, idx: number) => ({
                        order: step.order ?? idx,
                        instruction: step.instruction,
                        expectedResult: step.expectedResult || null,
                        expectedImage: step.expectedImage || null
                    })),
                    localSetup: tc.localSetup || null,
                    localTeardown: tc.localTeardown || null
                };
            });

            // Determine workspace folder (prioritize explicit folderPath from project settings)
            const workspaceFolder = (plan.project.folderPath as string) || currentProject.path;

            // Build execution request
            const executionRequest = {
                testRunId: runId,
                projectId: currentProject.id,
                serverUrl: serverUrl,
                aiConfig: aiConfig ? {
                    provider: aiConfig.provider,
                    apiKey: aiConfig.apiKey,
                    model: aiConfig.complexModel // Use complex model for agent execution
                } : null,
                deviceId: (launchConfig as any)?.options?.deviceId || null,
                launchConfig: launchConfig ? {
                    ...launchConfig,
                    cwd: ((launchConfig as any).cwd || workspaceFolder).replace(/\$\{workspaceFolder\}/g, workspaceFolder)
                } : null,
                features: featuresMap,
                testCases: testCasesForExecutor
            };

            console.log(`[handlers] Triggering execution for ${testCasesForExecutor.length} test cases`);

            // Construct Test Structure for UI to display pending steps immediately
            const testStructure = featuresToRun.map(feature => {
                const featureTestCases = testCasesToRun
                    .filter(tc => tc.featureId === feature._id)
                    .map(tc => ({
                        testCaseId: tc._id,
                        testCaseTitle: (tc as any).title || 'Untitled Test Case',
                        steps: ((tc as any).steps || []).map((step: any, idx: number) => ({
                            order: step.order ?? idx,
                            instruction: step.instruction,
                            expectedResult: step.expectedResult
                        }))
                    }));

                return {
                    featureId: feature._id,
                    featureName: feature.name,
                    globalSetup: ((feature as any).globalSetup && (feature as any).globalSetup.instruction) ? {
                        instruction: (feature as any).globalSetup.instruction,
                        waitTimeMs: (feature as any).globalSetup.waitTimeMs
                    } : undefined,
                    globalTeardown: ((feature as any).globalTeardown && (feature as any).globalTeardown.instruction) ? {
                        instruction: (feature as any).globalTeardown.instruction,
                        waitTimeMs: (feature as any).globalTeardown.waitTimeMs
                    } : undefined,
                    testCases: featureTestCases
                };
            });

            // Update status to running before triggering
            (runData as any).testStructure = testStructure;
            runData.status = 'running';
            await fs.writeJson(path.join(runPath, 'run.json'), runData, { spaces: 2 });

            // Trigger execution (don't await - it runs in background on executor)
            triggerExecution(executionRequest).then(result => {
                if (!result.success) {
                    console.error('[handlers] Execution trigger failed:', result.error);
                    // Update run status to failed
                    fs.readJson(path.join(runPath, 'run.json')).then(currentRunData => {
                        currentRunData.status = 'failed';
                        currentRunData.statusMessage = result.error || 'Failed to start execution';
                        fs.writeJson(path.join(runPath, 'run.json'), currentRunData, { spaces: 2 });
                    });
                }
            });

        } catch (execError: any) {
            console.error('[handlers] Error preparing execution:', execError);
            // Update run status but don't fail the create operation
            runData.status = 'failed';
            runData.statusMessage = execError.message || 'Failed to prepare execution';
            await fs.writeJson(path.join(runPath, 'run.json'), runData, { spaces: 2 });
        }

        return runData;
    });

    // Test Run List
    ipcMain.handle('testrun:list', async (_, projectId) => {
        const currentProject = getProject();
        if (!currentProject) return [];
        const runsDir = path.join(currentProject.path, 'test-run');
        if (!await fs.pathExists(runsDir)) return [];

        const dirs = await fs.readdir(runsDir);
        const runs = [];

        for (const dir of dirs) {
            const runJsonPath = path.join(runsDir, dir, 'run.json');
            if (await fs.pathExists(runJsonPath)) {
                try {
                    const run = await fs.readJson(runJsonPath);
                    runs.push(run);
                } catch (e) { console.error(e); }
            }
        }

        // Sort by createdAt desc
        return runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    // Test Run Get
    ipcMain.handle('testrun:get', async (_, id) => {
        // We have to find the folder. Iterate?
        // Optimized: Store path map? Or just iterate.
        const currentProject = getProject();
        if (!currentProject) return null;
        const runsDir = path.join(currentProject.path, 'test-run');
        const dirs = await fs.readdir(runsDir);
        for (const dir of dirs) {
            const runJsonPath = path.join(runsDir, dir, 'run.json');
            if (await fs.pathExists(runJsonPath)) {
                const run = await fs.readJson(runJsonPath);
                if (run._id === id) return run;
            }
        }
        throw new Error("Run not found");
    });

    // AI Configuration Handlers
    ipcMain.handle('ai-config:get', async () => {
        try {
            const config = store.get('aiConfig');
            return config || null;
        } catch (error) {
            console.error('Failed to get AI config:', error);
            return null;
        }
    });

    ipcMain.handle('ai-config:save', async (_, config) => {
        try {
            store.set('aiConfig', config);
            console.log('[handlers] AI config saved successfully');
            return config;
        } catch (error) {
            console.error('Failed to save AI config:', error);
            throw error;
        }
    });

    ipcMain.handle('ai-config:clear', async () => {
        try {
            store.delete('aiConfig');
            console.log('[handlers] AI config cleared');
            return null;
        } catch (error) {
            console.error('Failed to clear AI config:', error);
            throw error;
        }
    });

    // ============================================================================
    // LAUNCH CONFIGURATION HANDLERS - Background persistence for Redux-first pattern
    // ============================================================================

    // Create launch config (called from Redux thunk for background persistence)
    ipcMain.handle('launchConfig:create', async (_, projectId, config) => {
        try {
            console.log('[handlers] launchConfig:create - Persisting new config to disk');

            const projectPath = getPathFromId(projectId);
            const planPath = path.join(projectPath, 'test-plan', 'plan.json');

            if (!await fs.pathExists(planPath)) {
                throw new Error('Project plan file not found');
            }

            const plan = await fs.readJson(planPath) as Plan;

            // Add the new config to launchConfigurations array
            const configs = plan.project.launchConfigurations || [];
            plan.project.launchConfigurations = [...configs, config];
            plan.project.updatedAt = new Date().toISOString();

            await fs.writeJson(planPath, plan, { spaces: 2 });
            console.log('[handlers] launchConfig:create - Persisted config:', config._id);

            return config;
        } catch (error) {
            console.error('[handlers] launchConfig:create failed:', error);
            throw error;
        }
    });

    // Update launch config (called from Redux thunk for background persistence)
    ipcMain.handle('launchConfig:update', async (_, projectId, configId, data) => {
        try {
            console.log('[handlers] launchConfig:update - Persisting config update to disk:', configId);

            const projectPath = getPathFromId(projectId);
            const planPath = path.join(projectPath, 'test-plan', 'plan.json');

            if (!await fs.pathExists(planPath)) {
                throw new Error('Project plan file not found');
            }

            const plan = await fs.readJson(planPath) as Plan;

            // Find and update the config
            const configs = (plan.project.launchConfigurations || []) as Array<{ _id?: string;[key: string]: unknown }>;
            const index = configs.findIndex(c => c._id === configId);

            if (index === -1) {
                throw new Error('Launch config not found');
            }

            configs[index] = { ...configs[index], ...data, _id: configId };
            plan.project.launchConfigurations = configs;
            plan.project.updatedAt = new Date().toISOString();

            await fs.writeJson(planPath, plan, { spaces: 2 });
            console.log('[handlers] launchConfig:update - Persisted update for config:', configId);

            return configs[index];
        } catch (error) {
            console.error('[handlers] launchConfig:update failed:', error);
            throw error;
        }
    });

    // Delete launch config (called from Redux thunk for background persistence)
    ipcMain.handle('launchConfig:delete', async (_, projectId, configId) => {
        try {
            console.log('[handlers] launchConfig:delete - Removing config from disk:', configId);

            const projectPath = getPathFromId(projectId);
            const planPath = path.join(projectPath, 'test-plan', 'plan.json');

            if (!await fs.pathExists(planPath)) {
                throw new Error('Project plan file not found');
            }

            const plan = await fs.readJson(planPath) as Plan;

            // Remove the config
            const configs = (plan.project.launchConfigurations || []) as Array<{ _id?: string;[key: string]: unknown }>;
            plan.project.launchConfigurations = configs.filter(c => c._id !== configId);
            plan.project.updatedAt = new Date().toISOString();

            await fs.writeJson(planPath, plan, { spaces: 2 });
            console.log('[handlers] launchConfig:delete - Removed config:', configId);

            return { success: true };
        } catch (error) {
            console.error('[handlers] launchConfig:delete failed:', error);
            throw error;
        }
    });
}
