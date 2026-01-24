import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { getProject, updateProject } from '../../api/client';
import type { Project } from '../../types';

interface ProjectState {
    currentProject: Project | null;
    loading: boolean;
    error: string | null;
}

const initialState: ProjectState = {
    currentProject: null,
    loading: false,
    error: null,
};

// Async Thunks
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
        // Fetch
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

        // Update
        builder.addCase(updateProjectThunk.pending, (state) => {
            // Typically we might not want to set full loading screen for update, 
            // but let's do it for safety or checking.
            // Or we can just rely on the UI to show saving state.
            // For now, let's NOT set global loading to avoid flickering the whole page 
            // if we are just saving a form.
        });
        builder.addCase(updateProjectThunk.fulfilled, (state, action: PayloadAction<Project>) => {
            console.log('[Redux] Update fulfilled, new state:', action.payload);
            state.currentProject = action.payload;
        });
        builder.addCase(updateProjectThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });
    },
});

export const { clearProject } = projectSlice.actions;
export default projectSlice.reducer;
