import { configureStore } from '@reduxjs/toolkit';
import projectReducer from './slices/projectSlice';
import aiConfigReducer from './slices/aiConfigSlice';

export const store = configureStore({
    reducer: {
        project: projectReducer,
        aiConfig: aiConfigReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
