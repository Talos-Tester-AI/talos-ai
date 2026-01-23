import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getProject, updateProject as apiUpdateProject } from '../api/client';
import type { Project } from '../types';

interface ProjectContextType {
    project: Project | null;
    loading: boolean;
    error: string | null;
    refreshProject: () => Promise<void>;
    updateProject: (data: Partial<Project>) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode; projectId?: string }> = ({ children, projectId }) => {
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(!!projectId);
    const [error, setError] = useState<string | null>(null);

    const refreshProject = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            console.log('[ProjectContext] Refreshing project data...', projectId);
            const res = await getProject(projectId);
            console.log('[ProjectContext] Project loaded:', res.data);
            setProject(res.data);
            setError(null);
        } catch (err: any) {
            console.error('[ProjectContext] Load failed:', err);
            setError(err.message || 'Failed to load project');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    const updateProject = useCallback(async (data: Partial<Project>) => {
        if (!projectId || !project) return;
        try {
            console.log('[ProjectContext] Updating project...', data);
            const res = await apiUpdateProject(projectId, data);
            console.log('[ProjectContext] Update successful, new state:', res.data);
            setProject(res.data);
        } catch (err: any) {
            console.error('[ProjectContext] Update failed:', err);
            throw err;
        }
    }, [projectId, project]);

    useEffect(() => {
        if (projectId) {
            refreshProject();
        }
    }, [projectId, refreshProject]);

    return (
        <ProjectContext.Provider value={{ project, loading, error, refreshProject, updateProject }}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
