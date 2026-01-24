import type {
  Project,
  Feature,
  TestCase,
  SuiteRun,
  FeatureRun,
  TestCaseRun,
  TestRun,
  TestRunConfig,
  SelectedTestCase,
  AIConfig
} from '../types';

// Wrapper to mimic Axios response
const invoke = async <T>(channel: string, ...args: any[]) => {
  const data = await window.electron.ipcRenderer.invoke(channel, ...args);
  return { data: data as T };
};

// Projects
export const getProjects = () => invoke<Project[]>('project:list');
export const getProject = (id: string) => invoke<Project>('project:get', id);
export const createProject = (data: any) => invoke<Project>('project:create', data); // Maps to Open Dialog or Create new
export const updateProject = (id: string, data: Partial<Project>) => invoke<Project>('project:update', id, data);
export const deleteProject = (id: string) => invoke('project:delete', id);

// Project Analysis
export const analyzeProject = (id: string, data?: any) => invoke('project:analyze', id, data);
export const importProposal = (id: string, data: any) => invoke('project:import-proposal', id, data);

// Features
export const getFeaturesByProject = (projectId: string) => invoke<Feature[]>('feature:list', projectId);
export const getFeature = (id: string) => invoke<Feature>('feature:get', id);
export const createFeature = (projectId: string, data: any) => invoke<Feature>('feature:create', projectId, data);
export const updateFeature = (id: string, data: Partial<Feature>) => invoke<Feature>('feature:update', id, data);
export const reorderFeatures = (projectId: string, featureIds: string[]) => invoke('feature:reorder', projectId, featureIds);
export const deleteFeature = (id: string) => invoke('feature:delete', id);

// Test Cases
export const getTestCasesByFeature = (featureId: string) => invoke<TestCase[]>('testcase:list', featureId);
export const getTestCase = (id: string) => invoke<TestCase>('testcase:get', id);
export const createTestCase = (featureId: string, data: any) => invoke<TestCase>('testcase:create', featureId, data);
export const updateTestCase = (id: string, data: Partial<TestCase>) => invoke<TestCase>('testcase:update', id, data);
export const reorderTestCases = (featureId: string, testCaseIds: string[]) => invoke('testcase:reorder', featureId, testCaseIds);
export const deleteTestCase = (id: string) => invoke('testcase:delete', id);

// Suite Runs (Legacy/Optional - maintain for compatibility)
export const getSuiteRuns = (projectId?: string) => invoke<SuiteRun[]>('suiterun:list', projectId);
export const getSuiteRun = (id: string) => invoke<SuiteRun>('suiterun:get', id);
export const createSuiteRun = (data: any) => invoke<SuiteRun>('suiterun:create', data);

// Feature Runs
export const getFeatureRunsBySuite = (suiteRunId: string) => invoke<FeatureRun[]>('featurerun:list', suiteRunId);
export const getFeatureRun = (id: string) => invoke<FeatureRun>('featurerun:get', id);

// Test Case Runs
export const getTestCaseRunsByFeatureRun = (featureRunId: string) => invoke<TestCaseRun[]>('testcaserun:list', featureRunId);
export const getTestCaseRun = (id: string) => invoke<TestCaseRun>('testcaserun:get', id);

// Test Runs (Android Executor)
export const getTestRuns = (projectId?: string, page?: number, limit?: number) =>
  invoke<any>('testrun:list', projectId, page, limit);
export const getTestRun = (id: string) => invoke<TestRun>('testrun:get', id);
export const createTestRun = (data: any) => invoke<TestRun>('testrun:create', data);
export const cancelTestRun = (id: string) => invoke('testrun:cancel', id);

// Test Run Configs
export const getRunConfigs = (projectId: string) => invoke<TestRunConfig[]>('config:list', projectId);
export const createRunConfig = (projectId: string, data: Partial<TestRunConfig>) => invoke<TestRunConfig>('config:create', projectId, data);
export const deleteRunConfig = (id: string) => invoke('config:delete', id);

// Images
export const uploadImage = (projectId: string, file: File) => {
  // We need to send file path or buffer. File object in renderer has 'path' property in Electron?
  // Actually, in Electron renderer, File object might have 'path'.
  // If not, we need to read it as ArrayBuffer.
  // For now, let's assume we can send the path if available or implement buffer transfer.
  // const path = (file as any).path;
  // return invoke<{ _id: string; originalName: string }>('image:upload', projectId, path);
  // BETTER: Send meta and handle file copy in backend if path is available.
  // If constructed from blob, we might need arrayBuffer.
  return invoke<{ _id: string; originalName: string }>('image:upload', projectId, {
    name: file.name,
    path: (file as any).path, // Only works if file selected from file system
    size: file.size,
    type: file.type
  });
};

// Electron Specific
export const selectProjectFolder = () => invoke<Project>('project:select');
export const browseDirectory = () => invoke<string | null>('dialog:browse');

// AI Configuration
export const getAIConfig = () => invoke<AIConfig | null>('ai-config:get');
export const saveAIConfig = (config: AIConfig) => invoke<AIConfig>('ai-config:save', config);
export const clearAIConfig = () => invoke<void>('ai-config:clear');
