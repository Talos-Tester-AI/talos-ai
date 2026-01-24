import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { getAIConfig, saveAIConfig, clearAIConfig } from '../../api/client';
import type { AIConfig } from '../../types';

interface AIConfigState {
    config: AIConfig | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    initialized: boolean;
}

const initialState: AIConfigState = {
    config: null,
    loading: false,
    saving: false,
    error: null,
    initialized: false,
};

// Async Thunks
export const fetchAIConfig = createAsyncThunk(
    'aiConfig/fetchAIConfig',
    async (_, { rejectWithValue }) => {
        try {
            const response = await getAIConfig();
            return response.data;
        } catch (error: any) {
            return rejectWithValue(error.message || 'Failed to fetch AI configuration');
        }
    }
);

export const saveAIConfigThunk = createAsyncThunk(
    'aiConfig/saveAIConfig',
    async (config: AIConfig, { rejectWithValue }) => {
        try {
            const response = await saveAIConfig(config);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(error.message || 'Failed to save AI configuration');
        }
    }
);

export const clearAIConfigThunk = createAsyncThunk(
    'aiConfig/clearAIConfig',
    async (_, { rejectWithValue }) => {
        try {
            await clearAIConfig();
            return null;
        } catch (error: any) {
            return rejectWithValue(error.message || 'Failed to clear AI configuration');
        }
    }
);

const aiConfigSlice = createSlice({
    name: 'aiConfig',
    initialState,
    reducers: {
        resetError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        // Fetch
        builder.addCase(fetchAIConfig.pending, (state) => {
            state.loading = true;
            state.error = null;
        });
        builder.addCase(fetchAIConfig.fulfilled, (state, action: PayloadAction<AIConfig | null>) => {
            state.loading = false;
            state.config = action.payload;
            state.initialized = true;
        });
        builder.addCase(fetchAIConfig.rejected, (state, action) => {
            state.loading = false;
            state.error = action.payload as string;
            state.initialized = true;
        });

        // Save
        builder.addCase(saveAIConfigThunk.pending, (state) => {
            state.saving = true;
            state.error = null;
        });
        builder.addCase(saveAIConfigThunk.fulfilled, (state, action: PayloadAction<AIConfig>) => {
            state.saving = false;
            state.config = action.payload;
        });
        builder.addCase(saveAIConfigThunk.rejected, (state, action) => {
            state.saving = false;
            state.error = action.payload as string;
        });

        // Clear
        builder.addCase(clearAIConfigThunk.pending, (state) => {
            state.saving = true;
            state.error = null;
        });
        builder.addCase(clearAIConfigThunk.fulfilled, (state) => {
            state.saving = false;
            state.config = null;
        });
        builder.addCase(clearAIConfigThunk.rejected, (state, action) => {
            state.saving = false;
            state.error = action.payload as string;
        });
    },
});

export const { resetError } = aiConfigSlice.actions;
export default aiConfigSlice.reducer;

