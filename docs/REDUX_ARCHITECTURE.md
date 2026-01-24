# Redux-First Architecture Pattern

> **FOR AI ASSISTANTS**: This document describes the mandatory data flow pattern for this application. All data modifications MUST follow this pattern.

## Core Principle: Redux First, Then Disk

```
UI Component → Redux (immediate) → Disk (background)
```

**NEVER** the reverse:
```
❌ UI Component → Disk → Redux (WRONG!)
❌ UI Component → API → wait for response → Redux (WRONG!)
```

## Why This Pattern?

1. **Instant UI feedback** - Users see changes immediately without waiting for disk I/O
2. **Single source of truth** - Redux is always authoritative; disk is just persistence
3. **Consistent behavior** - All CRUD operations follow the same pattern
4. **Better UX** - App feels snappy and responsive

## The Pattern in Detail

### Step 1: Dispatch Redux Thunk
Component calls `dispatch(someThunk(data))`.

### Step 2: Thunk Updates Redux Immediately
Inside the thunk:
- Generate any needed IDs (using `crypto.randomUUID()`)
- Create the complete object
- Return it to Redux immediately

### Step 3: Background Disk Persistence
The thunk also fires an IPC call to persist data:
```typescript
// Fire and forget - don't await!
window.electron.ipcRenderer.invoke('entity:create', data).catch((error) => {
    console.error('[Redux] Background persist failed:', error);
});
```

### Step 4: Redux Reducer Updates State
The reducer receives the action and updates state. UI re-renders instantly.

## Implementation Examples

### Creating an Entity (Launch Config Example)

```typescript
// In projectSlice.ts
export const createLaunchConfigThunk = createAsyncThunk(
    'project/createLaunchConfig',
    async ({ projectId, data }, { getState, rejectWithValue }) => {
        try {
            console.log('[Redux] Creating launch config in Redux FIRST');
            
            // Generate ID and create complete object
            const newConfig: LaunchConfiguration = {
                _id: crypto.randomUUID(),
                name: data.name,
                type: data.type,
                // ... all fields
            };
            
            // Persist to disk in background (fire and forget)
            window.electron.ipcRenderer.invoke('launchConfig:create', projectId, newConfig).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            // Return to Redux immediately
            return { projectId, config: newConfig };
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);
```

### Updating an Entity

```typescript
export const updateLaunchConfigThunk = createAsyncThunk(
    'project/updateLaunchConfig',
    async ({ projectId, configId, data }, { getState, rejectWithValue }) => {
        try {
            console.log('[Redux] Updating launch config in Redux FIRST:', configId);
            
            // Get current state from Redux
            const state = getState() as { project: ProjectState };
            const currentProject = state.project.currentProject;
            const existingConfig = currentProject?.launchConfigurations?.find(c => c._id === configId);
            
            if (!existingConfig) {
                throw new Error('Config not found in Redux');
            }
            
            // Merge update
            const updatedConfig = { ...existingConfig, ...data, _id: configId };
            
            // Persist in background
            window.electron.ipcRenderer.invoke('launchConfig:update', projectId, configId, data).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            return { projectId, configId, config: updatedConfig };
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);
```

### Deleting an Entity

```typescript
export const deleteLaunchConfigThunk = createAsyncThunk(
    'project/deleteLaunchConfig',
    async ({ projectId, configId }, { rejectWithValue }) => {
        try {
            console.log('[Redux] Deleting launch config from Redux FIRST:', configId);
            
            // Persist in background
            window.electron.ipcRenderer.invoke('launchConfig:delete', projectId, configId).catch((error) => {
                console.error('[Redux] Background persist failed:', error);
            });
            
            // Return ID to remove from Redux immediately
            return { projectId, configId };
        } catch (error: any) {
            return rejectWithValue(error.message);
        }
    }
);
```

## Component Usage

Components should:
1. **Read from Redux** using `useAppSelector`
2. **Write via dispatch** using `useAppDispatch`
3. **Never call IPC directly** for data operations

```typescript
// ✅ CORRECT
const { currentProject } = useAppSelector((state) => state.project);
const dispatch = useAppDispatch();

const handleSave = async () => {
    await dispatch(createLaunchConfigThunk({ projectId, data })).unwrap();
    navigate('/somewhere');
};

// ❌ WRONG - Don't do this!
const handleSave = async () => {
    await window.electron.ipcRenderer.invoke('launchConfig:create', projectId, data);
    // This bypasses Redux - UI won't update!
};
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI COMPONENT                            │
│                                                                 │
│   1. dispatch(createEntityThunk(data))                          │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ASYNC THUNK                               │
│                                                                 │
│   2. Generate ID                                                │
│   3. Create complete entity object                              │
│   4. Fire IPC call (fire-and-forget) ─────────────────────┐     │
│   5. Return entity to Redux                                │     │
│                           │                                │     │
└───────────────────────────┼────────────────────────────────┼─────┘
                            │                                │
                            ▼                                ▼
┌───────────────────────────────────────────┐  ┌─────────────────┐
│              REDUX STORE                  │  │   ELECTRON IPC  │
│                                           │  │                 │
│   6. Reducer updates state                │  │ 7. Write to     │
│   7. UI re-renders immediately            │  │    plan.json    │
│                                           │  │    (background) │
└───────────────────────────────────────────┘  └─────────────────┘
```

## Entities Following This Pattern

| Entity | Create Thunk | Update Thunk | Delete Thunk |
|--------|--------------|--------------|--------------|
| Feature | `createFeatureThunk` | `updateFeatureThunk` | `deleteFeatureThunk` |
| TestCase | `createTestCaseThunk` | `updateTestCaseThunk` | `deleteTestCaseThunk` |
| LaunchConfig | `createLaunchConfigThunk` | `updateLaunchConfigThunk` | `deleteLaunchConfigThunk` |

## IPC Handler Naming Convention

All IPC handlers for background persistence follow this pattern:
- `entity:create` - Create new entity
- `entity:update` - Update existing entity  
- `entity:delete` - Delete entity

Examples:
- `launchConfig:create`
- `launchConfig:update`
- `launchConfig:delete`
- `feature:create`
- `testcase:update`

## DO NOT

1. **Never call IPC handlers directly from components** for data modification
2. **Never read from disk to update UI** - Redux is the source of truth
3. **Never bypass Redux for state updates** - all state goes through Redux
4. **Never await disk writes before updating UI** - use fire-and-forget pattern

## Loading Data

On app startup or navigation to a project:

```typescript
// Load everything in ONE call
const response = await window.electron.ipcRenderer.invoke('project:getFull', projectId);

// Put it all in Redux at once
return {
    project: response.project,
    features: response.features,
    testCases: response.testCases
};
```

This is the ONLY time we read from disk. After that, all reads come from Redux.

## File Locations

- Redux Store: `src/store/index.ts`
- Project Slice (all thunks): `src/store/slices/projectSlice.ts`
- IPC Handlers: `electron/handlers.ts`
- Type Definitions: `src/types/index.ts`

## Console Logging Pattern

All Redux operations log with `[Redux]` prefix:
```
[Redux] Creating launch config in Redux FIRST
[Redux] Background persist failed: ...
```

All IPC handlers log with `[handlers]` prefix:
```
[handlers] launchConfig:create - Persisting new config to disk
```

This makes debugging data flow easy to trace.

