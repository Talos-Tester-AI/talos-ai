import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'fs-extra';
import { randomUUID } from 'node:crypto';
import { setProject, getProject } from './state';

// Mapping of hex-encoded path (ID) to actual path
const getPathFromId = (id: string) => Buffer.from(id, 'hex').toString('utf-8');
const getIdFromPath = (p: string) => Buffer.from(p).toString('hex');
const encodeId = (p: string) => Buffer.from(p).toString('hex');
// const decodeId = (id: string) => Buffer.from(id, 'hex').toString('utf-8');

export function setupHandlers(mainWindow: BrowserWindow) {
    // Browse Directory
    ipcMain.handle('dialog:browse', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory']
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    // Project Selection
    ipcMain.handle('project:select', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory']
        });

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

        // Ensure ID matches path (in case moved)
        return { ...projectData, _id: projectId };
    });

    // Project Create
    ipcMain.handle('project:create', async (_, data) => {
        // If folderPath is provided, use it. Otherwise open dialog.
        let projectPath = data.folderPath;

        if (!projectPath) {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Select Folder for New Project',
                properties: ['openDirectory', 'createDirectory']
            });

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }
            projectPath = result.filePaths[0];
        }

        const projectId = encodeId(projectPath);

        setProject({ id: projectId, path: projectPath });

        const planPath = path.join(projectPath, 'test-plan', 'plan.json');

        // Ensure structure exists
        await fs.ensureDir(path.join(projectPath, 'test-plan'));
        await fs.ensureDir(path.join(projectPath, 'test-run'));

        // Initialize with form data
        const projectData = {
            _id: projectId,
            name: data.name || path.basename(projectPath),
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

        if (currentProject && currentProject.id === id) {
            // const trash = await import('trash'); // if available
            // For now, let's just rename it to .deleted
            // Or better, just unset the project.
            setProject(null);
            return { success: true };
        }

        // If we want to support actual deletion:
        // await shell.trasItem(currentProject.path);

        return { success: true };
    });

    // Project Select (Existing)

    // Get Project
    ipcMain.handle('project:get', async (_, id) => {
        const projectPath = getPathFromId(id);
        const planPath = path.join(projectPath, 'test-plan', 'plan.json');
        if (!await fs.pathExists(planPath)) throw new Error('Project not found');
        const plan = await fs.readJson(planPath);
        return { ...plan.project, _id: id };
    });

    // Recent Projects (Mock for now, normally stored in app.getPath('userData')/config.json)
    ipcMain.handle('project:list', async () => {
        return []; // Implement persistent store later
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
        const plan = await fs.readJson(planPath);

        // Sort features based on the new order of IDs
        const newFeatures = [];
        const featureMap = new Map(plan.features.map((f: any) => [f._id, f]));

        for (const id of featureIds) {
            if (featureMap.has(id)) {
                newFeatures.push(featureMap.get(id));
                featureMap.delete(id);
            }
        }

        // Append any remaining features (shouldn't happen usually but good for safety)
        for (const [_, f] of featureMap) {
            newFeatures.push(f);
        }

        plan.features = newFeatures;
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return plan.features;
    });

    // Feature Get
    ipcMain.handle('feature:get', async (_, id) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");

        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);

        const feature = plan.features.find((f: any) => f._id === id);
        if (!feature) throw new Error("Feature not found");
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
        const plan = await fs.readJson(planPath);

        const index = plan.features.findIndex((f: any) => f._id === id);
        if (index === -1) throw new Error("Feature not found");

        plan.features[index] = { ...plan.features[index], ...data, updatedAt: new Date().toISOString() };
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return plan.features[index];
    });

    // Feature Delete
    ipcMain.handle('feature:delete', async (_, id) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");
        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);

        plan.features = plan.features.filter((f: any) => f._id !== id);
        // Also delete test cases?
        plan.testCases = plan.testCases.filter((tc: any) => tc.featureId !== id);

        await fs.writeJson(planPath, plan, { spaces: 2 });
        return { success: true };
    });

    // Test Cases List
    ipcMain.handle('testcase:list', async (_, featureId) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");
        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);
        return plan.testCases ? plan.testCases.filter((tc: any) => tc.featureId === featureId) : [];
    });

    // Test Case Reorder
    ipcMain.handle('testcase:reorder', async (_, featureId, testCaseIds) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");

        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);

        // We only reorder test cases belonging to this feature.
        // Others must remain untouched.
        const otherTestCases = plan.testCases.filter((tc: any) => tc.featureId !== featureId);
        const featureTestCases = plan.testCases.filter((tc: any) => tc.featureId === featureId);

        const newFeatureTestCases = [];
        const tcMap = new Map(featureTestCases.map((tc: any) => [tc._id, tc]));

        for (const id of testCaseIds) {
            if (tcMap.has(id)) {
                newFeatureTestCases.push(tcMap.get(id));
                tcMap.delete(id);
            }
        }

        // Append checks
        for (const [_, tc] of tcMap) {
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

    // Test Case Update
    ipcMain.handle('testcase:update', async (_, id, data) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");
        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);

        const index = plan.testCases.findIndex((tc: any) => tc._id === id);
        if (index === -1) throw new Error("Test Case not found");

        plan.testCases[index] = { ...plan.testCases[index], ...data, updatedAt: new Date().toISOString() };
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return plan.testCases[index];
    });

    // Test Case Delete
    ipcMain.handle('testcase:delete', async (_, id) => {
        const currentProject = getProject();
        if (!currentProject) throw new Error("No project selected");
        const planPath = path.join(currentProject.path, 'test-plan', 'plan.json');
        const plan = await fs.readJson(planPath);

        plan.testCases = plan.testCases.filter((tc: any) => tc._id !== id);
        await fs.writeJson(planPath, plan, { spaces: 2 });
        return { success: true };
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

    // Test Run Create
    ipcMain.handle('testrun:create', async (_, data) => {
        // data: { projectId, selectedFeatureIds, ... }
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
            status: 'running',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            logPath: path.join(runPath, 'log.txt') // Placeholder
        };

        await fs.writeJson(path.join(runPath, 'run.json'), runData, { spaces: 2 });

        // Create empty log file
        await fs.writeFile(path.join(runPath, 'log.txt'), '');

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
}
