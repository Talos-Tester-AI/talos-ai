import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { getProject, getProjects, createProject, updateProject, getFeaturesByProject, getTestCasesByFeature } from '../../api/client';
import type { Project, Feature, TestCase } from '../../types';

interface ProjectState {
    currentProject: Project | null;
    projects: Project[];
    features: Feature[];
    testCases: TestCase[];
    loading: boolean;
    error: string | null;
}

const initialState: ProjectState = {
    currentProject: null,
    projects: [],
    features: [],
    testCases: [],
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

// Fetch a single project by ID WITH ALL ITS DATA (features, test cases, etc.)
// LOADS EVERYTHING IN ONE CALL - NO LOOPS
export const fetchProject = createAsyncThunk(
    'project/fetchProject',
    async (id: string, { rejectWithValue }) => {
        try {
            console.log('[Redux] Loading ENTIRE project data in ONE call:', id);
            
            // ONE call to get the full plan which has project + features + testCases
            const response = await window.electron.ipcRenderer.invoke('project:getFull', id);
            
            console.log('[Redux] Loaded project with', response.features.length, 'features and', response.testCases.length, 'test cases');
            
            return {
                project: response.project,
                features: response.features,
                testCases: response.testCases
            };
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

// Update test case (updates Redux FIRST, then persists to disk in background)
export const updateTestCaseThunk = createAsyncThunk(
    'project/updateTestCase',
    async ({ id, data }: { id: string; data: Partial<TestCase> }, { getState, rejectWithValue }) => {
        try {
            console.log('[Redux] Updating test case in Redux FIRST:', id);
            
            // Get current test case from Redux
            const state = getState() as { project: ProjectState };
            const currentTestCase = state.project.testCases.find(tc => tc._id === id);
            
            if (!currentTestCase) {
                throw new Error('Test case not found in Redux');
            }
            
            // Merge the update with current data
            const updatedTestCase = { ...currentTestCase, ...data };
            
            // Persist to disk in background (fire and forget for UI responsiveness)
            window.electron.ipcRenderer.invoke('testcase:update', id, data).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            // Return updated test case to Redux immediately
            return updatedTestCase;
        } catch (error: any) {
            console.error('[Redux] Test case update failed:', error);
            return rejectWithValue(error.message || 'Failed to update test case');
        }
    }
);

// Create feature (updates Redux FIRST, then persists to disk in background)
export const createFeatureThunk = createAsyncThunk(
    'project/createFeature',
    async ({ projectId, data }: { projectId: string; data: any }, { rejectWithValue }) => {
        try {
            console.log('[Redux] Creating feature in Redux FIRST');
            
            // Generate ID and create feature object
            const newFeature: Feature = {
                _id: crypto.randomUUID(),
                projectId: projectId,
                name: data.name,
                description: data.description,
                globalSetup: data.globalSetup,
                globalTeardown: data.globalTeardown,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // Persist to disk in background
            window.electron.ipcRenderer.invoke('feature:create', projectId, newFeature).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            // Return new feature to Redux immediately
            return newFeature;
        } catch (error: any) {
            console.error('[Redux] Create feature failed:', error);
            return rejectWithValue(error.message || 'Failed to create feature');
        }
    }
);

// Delete feature (updates Redux FIRST, then persists to disk in background)
export const deleteFeatureThunk = createAsyncThunk(
    'project/deleteFeature',
    async (featureId: string, { rejectWithValue }) => {
        try {
            console.log('[Redux] Deleting feature from Redux FIRST:', featureId);
            
            // Persist to disk in background
            window.electron.ipcRenderer.invoke('feature:delete', featureId).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            // Return feature ID to remove from Redux
            return featureId;
        } catch (error: any) {
            console.error('[Redux] Delete feature failed:', error);
            return rejectWithValue(error.message || 'Failed to delete feature');
        }
    }
);

// Update feature (updates Redux FIRST, then persists to disk in background)
export const updateFeatureThunk = createAsyncThunk(
    'project/updateFeature',
    async ({ id, data }: { id: string; data: Partial<Feature> }, { getState, rejectWithValue }) => {
        try {
            console.log('[Redux] Updating feature in Redux FIRST:', id);
            
            // Get current feature from Redux
            const state = getState() as { project: ProjectState };
            const currentFeature = state.project.features.find(f => f._id === id);
            
            if (!currentFeature) {
                throw new Error('Feature not found in Redux');
            }
            
            // Merge the update
            const updatedFeature = { ...currentFeature, ...data, updatedAt: new Date().toISOString() };
            
            // Persist to disk in background
            window.electron.ipcRenderer.invoke('feature:update', id, data).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            return updatedFeature;
        } catch (error: any) {
            console.error('[Redux] Update feature failed:', error);
            return rejectWithValue(error.message || 'Failed to update feature');
        }
    }
);

// Create test case (updates Redux FIRST, then persists to disk in background)
export const createTestCaseThunk = createAsyncThunk(
    'project/createTestCase',
    async ({ featureId, data }: { featureId: string; data: any }, { rejectWithValue }) => {
        try {
            console.log('[Redux] Creating test case in Redux FIRST');
            
            // Generate ID and create test case object
            const newTestCase: TestCase = {
                _id: crypto.randomUUID(),
                featureId: featureId,
                title: data.title,
                description: data.description,
                status: 'NEW',
                steps: data.steps || [],
                localSetup: data.localSetup,
                localTeardown: data.localTeardown,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // Persist to disk in background
            window.electron.ipcRenderer.invoke('testcase:create', featureId, newTestCase).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            return newTestCase;
        } catch (error: any) {
            console.error('[Redux] Create test case failed:', error);
            return rejectWithValue(error.message || 'Failed to create test case');
        }
    }
);

// Delete test case (updates Redux FIRST, then persists to disk in background)
export const deleteTestCaseThunk = createAsyncThunk(
    'project/deleteTestCase',
    async (testCaseId: string, { rejectWithValue }) => {
        try {
            console.log('[Redux] Deleting test case from Redux FIRST:', testCaseId);
            
            // Persist to disk in background
            window.electron.ipcRenderer.invoke('testcase:delete', testCaseId).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            return testCaseId;
        } catch (error: any) {
            console.error('[Redux] Delete test case failed:', error);
            return rejectWithValue(error.message || 'Failed to delete test case');
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

        // Fetch single project WITH ALL DATA
        builder.addCase(fetchProject.pending, (state) => {
            state.loading = true;
            state.error = null;
        });
        builder.addCase(fetchProject.fulfilled, (state, action: PayloadAction<{ project: Project; features: Feature[]; testCases: TestCase[] }>) => {
            state.loading = false;
            state.currentProject = action.payload.project;
            state.features = action.payload.features;
            state.testCases = action.payload.testCases;
            console.log('[Redux] State updated with', state.features.length, 'features and', state.testCases.length, 'test cases');
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

        // Update test case
        builder.addCase(updateTestCaseThunk.fulfilled, (state, action: PayloadAction<TestCase>) => {
            console.log('[Redux] Test case updated:', action.payload._id);
            // Update in testCases array
            const index = state.testCases.findIndex(tc => tc._id === action.payload._id);
            if (index >= 0) {
                state.testCases[index] = action.payload;
            }
        });
        builder.addCase(updateTestCaseThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Create feature
        builder.addCase(createFeatureThunk.fulfilled, (state, action: PayloadAction<Feature>) => {
            console.log('[Redux] Feature created:', action.payload._id);
            state.features.push(action.payload);
        });
        builder.addCase(createFeatureThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Delete feature
        builder.addCase(deleteFeatureThunk.fulfilled, (state, action: PayloadAction<string>) => {
            console.log('[Redux] Feature deleted:', action.payload);
            state.features = state.features.filter(f => f._id !== action.payload);
            // Also remove all test cases for this feature
            state.testCases = state.testCases.filter(tc => tc.featureId !== action.payload);
        });
        builder.addCase(deleteFeatureThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Update feature
        builder.addCase(updateFeatureThunk.fulfilled, (state, action: PayloadAction<Feature>) => {
            console.log('[Redux] Feature updated:', action.payload._id);
            const index = state.features.findIndex(f => f._id === action.payload._id);
            if (index >= 0) {
                state.features[index] = action.payload;
            }
        });
        builder.addCase(updateFeatureThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Create test case
        builder.addCase(createTestCaseThunk.fulfilled, (state, action: PayloadAction<TestCase>) => {
            console.log('[Redux] Test case created:', action.payload._id);
            state.testCases.push(action.payload);
        });
        builder.addCase(createTestCaseThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Delete test case
        builder.addCase(deleteTestCaseThunk.fulfilled, (state, action: PayloadAction<string>) => {
            console.log('[Redux] Test case deleted:', action.payload);
            state.testCases = state.testCases.filter(tc => tc._id !== action.payload);
        });
        builder.addCase(deleteTestCaseThunk.rejected, (state, action) => {
            state.error = action.payload as string;
        });
    },
});

export const { clearProject } = projectSlice.actions;
export default projectSlice.reducer;
