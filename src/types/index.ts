export interface LaunchConfiguration {
  _id?: string;
  name: string;
  type: string;
  request: 'launch' | 'attach';
  program: string;
  cwd?: string;
  args?: string[];
  env?: Record<string, string> | Map<string, string>;
  windows?: any;
  linux?: any;
  osx?: any;
  options?: any;
}

export interface Project {
  _id: string;
  name: string;

  baseUrl?: string;
  systemContext?: string;
  folderPath?: string;
  figmaProjectUrl?: string;
  figmaAccessToken?: string;
  launchConfigurations?: LaunchConfiguration[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GlobalSetup {
  instruction: string;
  timeout?: number;
  waitTimeMs?: number;
}

export interface GlobalTeardown {
  instruction: string;
  waitTimeMs?: number;
}

export interface Feature {
  _id: string;
  projectId: string;
  name: string;
  description: string;
  globalSetup?: GlobalSetup;
  globalTeardown?: GlobalTeardown;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalSetup {
  instruction: string;
}

export interface LocalTeardown {
  instruction: string;
}

export interface TestStep {
  order: number;
  instruction: string;
  expectedImage?: string;
  expectedResult?: string;
  waitTimeMs?: number;
}

export interface TestCase {
  _id: string;
  featureId: string;
  title: string;
  localSetup?: LocalSetup;
  steps: TestStep[];
  localTeardown?: LocalTeardown;
  createdAt?: string;
  updatedAt?: string;
}

export interface Environment {
  url: string;
  browser: string;
  viewport: string;
  os: string;
}

export interface Summary {
  totalFeatures: number;
  featuresPassed: number;
  featuresFailed: number;
  totalTests: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
}

export type RunStatus = 'passed' | 'failed' | 'running' | 'pending';

export interface SuiteRun {
  _id: string;
  projectId: string;
  name: string;
  triggeredBy: string;
  status: RunStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  environment: Environment;
  summary: Summary;
  createdAt?: string;
  updatedAt?: string;
}

export interface Log {
  ts: string;
  level: string;
  msg: string;
}

export interface SetupResult {
  status: 'passed' | 'failed';
  startTime: string;
  endTime: string;
  logs: Log[];
  createdData?: Record<string, any>;
}

export interface TeardownResult {
  status: 'passed' | 'failed';
  startTime: string;
  endTime: string;
  logs: Log[];
}

export interface FeatureRun {
  _id: string;
  suiteRunId: string;
  featureId: string;
  featureName: string;
  status: RunStatus;
  startTime: string;
  endTime?: string;
  globalSetupResult?: SetupResult;
  globalTeardownResult?: TeardownResult;
  createdAt?: string;
  updatedAt?: string;
}

export interface LLMExecutionLog {
  action: string;
  [key: string]: any;
}

export interface LocalSetupResult {
  status: 'passed' | 'failed';
  startTime: string;
  endTime: string;
  instruction: string;
  llmExecutionLog: LLMExecutionLog[];
  finalScreenshot?: string;
}

export interface StepResult {
  stepIndex: number;
  instruction: string;
  status: 'passed' | 'failed';
  startTime: string;
  endTime: string;
  llmReasoning?: string;
  expectedImage?: string;
  actualImage?: string;
  visualMatchScore?: number;
  visualDiffImage?: string;
  error?: string;
}

export interface LocalTeardownResult {
  status: 'passed' | 'failed';
  startTime: string;
  endTime: string;
  instruction: string;
  llmExecutionLog: LLMExecutionLog[];
  error?: string;
}

export interface TestCaseRun {
  _id: string;
  featureRunId: string;
  testCaseId: string;
  testTitle: string;
  status: RunStatus;
  startTime: string;
  endTime?: string;
  localSetupResult?: LocalSetupResult;
  stepResults: StepResult[];
  localTeardownResult?: LocalTeardownResult;
  createdAt?: string;
  updatedAt?: string;
}

// Test Run Types
export interface SelectedTestCase {
  featureId: string;
  testCaseIds: string[];
}

export interface TestRunConfig {
  _id: string;
  projectId: string;
  name: string;
  scope: 'project' | 'features' | 'testcases';
  selectedFeatureIds?: string[];
  selectedTestCases?: SelectedTestCase[];
  selectedLaunchConfigIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceInfo {
  deviceId: string;
  model: string;
  androidVersion: string;
}

export interface TestRunSummary {
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalTestCases: number;
  passedTestCases: number;
  failedTestCases: number;

}

export type TestRunStatus = 'pending' | 'building' | 'booting' | 'installing' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TestRun {
  _id: string;
  projectId: string;
  configId?: string;
  status: TestRunStatus;
  scope: 'project' | 'features' | 'testcases';
  selectedFeatureIds?: string[];
  selectedTestCases?: SelectedTestCase[];
  selectedLaunchConfigIds?: string[];
  deviceInfo?: DeviceInfo;
  startTime?: string;
  endTime?: string;
  summary: TestRunSummary;
  currentFeatureId?: string;
  currentTestCaseId?: string;
  currentStepIndex?: number;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  buildLogs?: string[];
  executionSteps?: any[];
  launchConfiguration?: LaunchConfiguration;
}

// SSE Event Types
export interface TestRunSSEEvent {
  type: 'status' | 'step_result' | 'test_case_complete' | 'feature_complete' | 'run_complete' | 'error' | 'build_log';
  testRunId: string;
  data: any;
  timestamp: string;
}

