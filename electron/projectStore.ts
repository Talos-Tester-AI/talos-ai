import electron from 'electron';
const { app } = electron;
import path from 'node:path';
import fs from 'fs-extra';

/**
 * Persistent storage for the list of known/recent projects.
 * Stores in app's userData directory as recent-projects.json
 */

export interface StoredProject {
    _id: string;
    name: string;
    path: string;
    baseUrl?: string;
    systemContext?: string;
    createdAt: string;
    updatedAt: string;
}

const getStorePath = (): string => {
    return path.join(app.getPath('userData'), 'recent-projects.json');
};

/**
 * Get all projects from persistent storage.
 * Also validates that project folders still exist and filters out deleted ones.
 */
export async function getProjectsFromStore(): Promise<StoredProject[]> {
    const storePath = getStorePath();

    try {
        if (!await fs.pathExists(storePath)) {
            return [];
        }

        const data = await fs.readJson(storePath);
        const projects: StoredProject[] = data.projects || [];

        // Validate that each project's folder still exists
        const validProjects: StoredProject[] = [];
        let hasChanges = false;

        for (const project of projects) {
            if (await fs.pathExists(project.path)) {
                validProjects.push(project);
            } else {
                hasChanges = true;
                console.log(`[projectStore] Project folder no longer exists, removing: ${project.path}`);
            }
        }

        // If we removed any invalid projects, save the updated list
        if (hasChanges) {
            await fs.writeJson(storePath, { projects: validProjects }, { spaces: 2 });
        }

        return validProjects;
    } catch (error) {
        console.error('[projectStore] Failed to read projects:', error);
        return [];
    }
}

/**
 * Add a project to persistent storage.
 * If project already exists (by ID), updates it instead.
 */
export async function addProjectToStore(project: StoredProject): Promise<void> {
    const storePath = getStorePath();

    try {
        let projects: StoredProject[] = [];

        if (await fs.pathExists(storePath)) {
            const data = await fs.readJson(storePath);
            projects = data.projects || [];
        }

        // Check if project already exists
        const existingIndex = projects.findIndex(p => p._id === project._id);

        if (existingIndex >= 0) {
            // Update existing project
            projects[existingIndex] = {
                ...projects[existingIndex],
                ...project,
                updatedAt: new Date().toISOString()
            };
        } else {
            // Add new project at the beginning (most recent first)
            projects.unshift(project);
        }

        await fs.writeJson(storePath, { projects }, { spaces: 2 });
        console.log(`[projectStore] Project saved: ${project.name}`);
    } catch (error) {
        console.error('[projectStore] Failed to add project:', error);
        throw error;
    }
}

/**
 * Remove a project from persistent storage by ID.
 */
export async function removeProjectFromStore(id: string): Promise<void> {
    const storePath = getStorePath();

    try {
        if (!await fs.pathExists(storePath)) {
            return;
        }

        const data = await fs.readJson(storePath);
        const projects: StoredProject[] = data.projects || [];

        const filteredProjects = projects.filter(p => p._id !== id);

        if (filteredProjects.length !== projects.length) {
            await fs.writeJson(storePath, { projects: filteredProjects }, { spaces: 2 });
            console.log(`[projectStore] Project removed: ${id}`);
        }
    } catch (error) {
        console.error('[projectStore] Failed to remove project:', error);
        throw error;
    }
}

/**
 * Update a project in persistent storage.
 */
export async function updateProjectInStore(id: string, data: Partial<StoredProject>): Promise<void> {
    const storePath = getStorePath();

    try {
        if (!await fs.pathExists(storePath)) {
            return;
        }

        const storeData = await fs.readJson(storePath);
        const projects: StoredProject[] = storeData.projects || [];

        const index = projects.findIndex(p => p._id === id);

        if (index >= 0) {
            projects[index] = {
                ...projects[index],
                ...data,
                updatedAt: new Date().toISOString()
            };
            await fs.writeJson(storePath, { projects }, { spaces: 2 });
            console.log(`[projectStore] Project updated: ${id}`);
        }
    } catch (error) {
        console.error('[projectStore] Failed to update project:', error);
        throw error;
    }
}

