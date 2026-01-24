import type { LaunchConfiguration, Project, Feature, TestCase, AIConfig } from './index';

// ============================================================================
// IPC CHANNEL DEFINITIONS
// ============================================================================

/**
 * All available IPC channels for the Electron main process.
 * 
 * PATTERN: All data modifications follow Redux-First pattern:
 * 1. Redux updates immediately
 * 2. IPC calls persist to disk in background (fire-and-forget)
 * 
 * See docs/REDUX_ARCHITECTURE.md for full documentation.
 */
export type IPCChannel = 
    // Dialog
    | 'dialog:browse'
    
    // Project Operations
    | 'project:select'
    | 'project:create'
    | 'project:update'
    | 'project:delete'
    | 'project:get'
    | 'project:getFull'
    | 'project:list'
    
    // Feature Operations
    | 'feature:list'
    | 'feature:reorder'
    | 'feature:get'
    | 'feature:create'
    | 'feature:update'
    | 'feature:delete'
    
    // Test Case Operations
    | 'testcase:list'
    | 'testcase:reorder'
    | 'testcase:create'
    | 'testcase:update'
    | 'testcase:delete'
    
    // Launch Configuration Operations (Redux-first background persistence)
    | 'launchConfig:create'
    | 'launchConfig:update'
    | 'launchConfig:delete'
    
    // Image Operations
    | 'image:upload'
    
    // Test Run Operations
    | 'testrun:create'
    | 'testrun:list'
    | 'testrun:get'
    
    // AI Configuration
    | 'ai-config:get'
    | 'ai-config:save'
    | 'ai-config:clear';

// ============================================================================
// ELECTRON API INTERFACE
// ============================================================================

export interface ElectronAPI {
    ipcRenderer: {
        /**
         * Send a one-way message to the main process
         */
        send: (channel: string, args: unknown[]) => void;
        
        /**
         * Listen for messages from the main process
         */
        on: (channel: string, func: (...args: unknown[]) => void) => () => void;
        
        /**
         * Invoke a handler in the main process and wait for response.
         * 
         * @param channel - The IPC channel name
         * @param args - Arguments to pass to the handler
         * @returns Promise resolving to the handler's return value
         * 
         * @example
         * // Load full project data
         * const data = await window.electron.ipcRenderer.invoke('project:getFull', projectId);
         * 
         * @example  
         * // Create launch config (background persistence - fire and forget)
         * window.electron.ipcRenderer.invoke('launchConfig:create', projectId, config).catch(console.error);
         */
        invoke: <T = unknown>(channel: IPCChannel | string, ...args: unknown[]) => Promise<T>;
    };
}

// ============================================================================
// GLOBAL WINDOW EXTENSION
// ============================================================================

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

// ============================================================================
// IPC HANDLER RETURN TYPES (for reference)
// ============================================================================

export interface ProjectFullResponse {
    project: Project;
    features: Feature[];
    testCases: TestCase[];
}

export interface LaunchConfigCreateResponse extends LaunchConfiguration {}

export interface LaunchConfigUpdateResponse extends LaunchConfiguration {}

export interface LaunchConfigDeleteResponse {
    success: boolean;
}
