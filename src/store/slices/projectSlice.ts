import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { getProject, getProjects, createProject, updateProject } from '../../api/client';
import type { Project } from '../../types';

interface ProjectState {
    currentProject: Project | null;
    projects: Project[];
    loading: boolean;
    error: string | null;
}

const initialState: ProjectState = {
    currentProject: null,
    projects: [],
    loading: false,
    error: null,
};

// Async Thunks

// Fetch all projects from persistent storage
export const fetchProjects = createAsyncThunk(
    'project/fetchProjects',
    async (_, { rejectWithValue }) => {
        try {
            console.log('[Redux] Fetching all projects');
            const response = await getProjects();
            return response.data;
        } catch (error: any) {
            console.error('[Redux] Fetch projects failed:', error);
            return rejectWithValue(error.message || 'Failed to fetch projects');
        }
    }
);

// Fetch a single project by ID
export const fetchProject = createAsyncThunk(
    'project/fetchProject',
    async (id: string, { rejectWithValue }) => {
        try {
            console.log('[Redux] Fetching project:', id);
            const response = await getProject(id);
            return response.data;
        } catch (error: any) {
            console.error('[Redux] Fetch failed:', error);
            return rejectWithValue(error.message || 'Failed to fetch project');
        }
    }
);

// Create a new project (saves to storage + loads into Redux)
export const createProjectThunk = createAsyncThunk(
    'project/createProject',
    async (data: { name: string; folderPath: string; baseUrl?: string; systemContext?: string }, { rejectWithValue }) => {
        try {
            console.log('[Redux] Creating project:', data);
            const response = await createProject(data);
            return response.data;
        } catch (error: any) {
            console.error('[Redux] Create project failed:', error);
            return rejectWithValue(error.message || 'Failed to create project');
        }
    }
);

export const updateProjectThunk = createAsyncThunk(
    'project/updateProject',
    async ({ id, data }: { id: string; data: Partial<Project> }, { rejectWithValue }) => {
        try {
            console.log('[Redux] Updating project:', id, data);
            const response = await updateProject(id, data);
            return response.data;
        } catch (error: any) {
            console.error('[Redux] Update failed:', error);
            return rejectWithValue(error.message || 'Failed to update project');
        }
    }
);

const projectSlice = createSlice({
    name: 'project',
    initialState,
    reducers: {
        clearProject: (state) => {
            state.currentProject = null;
            state.loading = false;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        // Fetch all projects
        builder.addCase(fetchProjects.pending, (state) => {
            state.loading = true;
            state.error = null;
        });
        builder.addCase(fetchProjects.fulfilled, (state, action: PayloadAction<Project[]>) => {
            state.loading = false;
            state.projects = action.payload;
        });
        builder.addCase(fetchProjects.rejected, (state, action) => {
            state.loading = false;
            state.error = action.payload as string;
        });

        // Fetch single project
        builder.addCase(fetchProject.pending, (state) => {
            state.loading = true;
            state.error = null;
        });
        builder.addCase(fetchProject.fulfilled, (state, action: PayloadAction<Project>) => {
            state.loading = false;
            state.currentProject = action.payload;
        });
        builder.addCase(fetchProject.rejected, (state, action) => {
            state.loading = false;
            state.error = action.payload as string;
        });

        // Create project
        builder.addCase(createProjectThunk.pending, (state) => {
            state.loading = true;
            state.error = null;
        });
        builder.addCase(createProjectThunk.fulfilled, (state, action: PayloadAction<Project>) => {
            state.loading = false;
            state.currentProject = action.payload;
            // Add to projects list
            state.projects.unshift(action.payload);
        });
        builder.addCase(createProjectThunk.rejected, (state, action) => {
            state.loading = false;
            state.error = action.payload as string;
        });

        // Update project
        builder.addCase(updateProjectThunk.pending, (state) => {
            // Don't set global loading to avoid flickering
        });
        builder.addCase(updateProjectThunk.fulfilled, (state, action: PayloadAction<Project>) => {
            console.log('[Redux] Update fulfilled, new state:', action.payload);
            state.currentProject = action.payload;
            // Update in projects list if present
            const index = state.projects.findIndex(p => p._id === action.payload._id);
            if (index >= 0) {
                state.projects[index] = action.payload;
            }
        });
        builder.addCase(updateProjectThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });
    },
});

export const { clearProject } = projectSlice.actions;
export default projectSlice.reducer;
