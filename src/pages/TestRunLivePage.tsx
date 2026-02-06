import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader, StopCircle, Image, Brain, FileText } from 'lucide-react';
import { getTestRun, cancelTestRun, saveTestRun } from '../api/client';
import type { TestRun, TestRunSSEEvent } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface StepResultData {
  featureId: string;
  testCaseId: string;
  featureName?: string; // Added
  testCaseTitle?: string; // Added
  stepIndex: number;
  instruction: string;
  status: 'passed' | 'failed';
  expectedResult?: string;
  aiReasoning?: string;
  executionError?: string; // Added field
  screenshotBase64?: string;
  deviceLogs?: string[];
  startTime: string;
  endTime: string;
}

interface TestCaseProgress {
  testCaseId: string;
  title?: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  steps: StepResultData[];
  pendingSteps?: { order: number; instruction: string; expectedResult?: string }[]; // Steps not yet executed
  localSetup?: GlobalStepProgress;
  localTeardown?: GlobalStepProgress;
}

interface GlobalStepProgress {
  instruction: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  logs?: string[];
  startTime?: string;
  endTime?: string;
  error?: string;
}

interface FeatureProgress {
  featureId: string;
  name?: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  globalSetup?: GlobalStepProgress;
  globalTeardown?: GlobalStepProgress;
  testCases: Map<string, TestCaseProgress>;
}

// Structure received from initial_state for progressive display
interface TestStructureItem {
  featureId: string;
  featureName: string;
  globalSetup?: { instruction: string; waitTimeMs?: number };
  globalTeardown?: { instruction: string; waitTimeMs?: number };
  testCases: {
    testCaseId: string;
    testCaseTitle: string;
    steps: { order: number; instruction: string; expectedResult?: string }[];
  }[];
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'passed':
    case 'completed':
      return <CheckCircle size={20} className="text-green-600" />;
    case 'failed':
      return <XCircle size={20} className="text-red-600" />;
    case 'running':
    case 'building':
    case 'installing':
    case 'booting':
      return <Loader size={20} className="text-blue-600 animate-spin" />;
    case 'cancelled':
      return <StopCircle size={20} className="text-orange-600" />;
    default:
      return <Clock size={20} className="text-gray-400" />;
  }
};

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    running: 'bg-blue-100 text-blue-700',
    building: 'bg-yellow-100 text-yellow-700',
    installing: 'bg-purple-100 text-purple-700',
    booting: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-green-100 text-green-700',
    passed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-orange-100 text-orange-700'
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
      {status ? status.toUpperCase() : 'UNKNOWN'}
    </span>
  );
};

const LogsContainer = memo(({ logs }: { logs: string[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div ref={containerRef} className="bg-gray-900 text-gray-100 font-mono text-xs p-4 rounded-lg h-64 overflow-y-auto shadow-inner">
      {logs.length === 0 ? (
        <span className="text-gray-500 italic">Waiting for logs...</span>
      ) : (
        <pre className="whitespace-pre-wrap break-all font-inherit m-0">
          {logs.join('\n')}
        </pre>
      )}
    </div>
  );
});

// Components for optimized rendering
const TestCaseItem = memo(({
  testCase,
  onShowLogs,
  onShowReasoning,
  onShowScreenshot,
  onShowError
}: {
  testCase: TestCaseProgress;
  onShowLogs: (logs: string[]) => void;
  onShowReasoning: (reasoning: string) => void;
  onShowScreenshot: (base64: string) => void;
  onShowError: (error: string) => void;
}) => {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon(testCase.status)}
          <span className="font-medium truncate max-w-sm" title={testCase.title || testCase.testCaseId}>{testCase.title || `Test Case ${testCase.testCaseId.slice(-8)}`}</span>
        </div>
        <span className="text-sm text-gray-500">
          {testCase.steps.filter(s => s.status === 'passed').length}/{(testCase.pendingSteps?.length || 0) + testCase.steps.length} steps
        </span>
      </div>

      <div className="space-y-1 mt-2">
        {/* Local Setup */}
        {testCase.localSetup && (
          <div className={`flex items-start gap-2 p-2 rounded ${testCase.localSetup.status === 'running' ? 'bg-blue-50 border border-blue-200' :
            testCase.localSetup.status === 'passed' ? 'bg-gray-50 border border-gray-200' :
              testCase.localSetup.status === 'failed' ? 'bg-red-50 border border-red-200' :
                'bg-gray-50 border border-gray-200'
            }`}>
            <div className="flex-shrink-0 mt-0.5">
              {testCase.localSetup.status === 'running' && <Loader size={14} className="text-blue-600 animate-spin" />}
              {testCase.localSetup.status === 'passed' && <CheckCircle size={14} className="text-gray-500" />}
              {testCase.localSetup.status === 'failed' && <XCircle size={14} className="text-red-500" />}
              {testCase.localSetup.status === 'pending' && <Clock size={14} className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Local Setup</p>
              <p className="text-sm text-gray-900 truncate">{testCase.localSetup.instruction}</p>
              {testCase.localSetup.error && (
                <p className="text-xs text-red-600 font-mono mt-1">{testCase.localSetup.error}</p>
              )}
            </div>
          </div>
        )}

        {testCase.steps.map((step, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2 p-2 rounded ${step.status === 'passed' ? 'bg-green-50' : 'bg-red-50'}`}
          >
            <span className="flex-shrink-0 mt-0.5">
              {step.status === 'passed' ? (
                <CheckCircle size={14} className="text-green-600" />
              ) : (
                <XCircle size={14} className="text-red-600" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 truncate">{step.instruction}</p>
            </div>
            <div className="flex items-center gap-1">
              {step.deviceLogs && step.deviceLogs.length > 0 && (
                <button
                  className="p-1 hover:bg-white rounded text-blue-600 hover:text-blue-800 transition-colors"
                  onClick={() => onShowLogs(step.deviceLogs!)}
                  title="View Device Logs"
                >
                  <FileText size={16} />
                </button>
              )}
              {step.executionError && (
                <button
                  className="p-1 hover:bg-white rounded text-red-600 hover:text-red-800 transition-colors"
                  onClick={() => onShowError(step.executionError!)}
                  title="View Execution Error"
                >
                  <XCircle size={16} />
                </button>
              )}
              {step.aiReasoning && (
                <button
                  className="p-1 hover:bg-white rounded text-indigo-600 hover:text-indigo-800 transition-colors"
                  onClick={() => onShowReasoning(step.aiReasoning!)}
                  title="View AI Analysis"
                >
                  <Brain size={16} />
                </button>
              )}
              {step.screenshotBase64 && (
                <button
                  className="p-1 hover:bg-white rounded text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={() => onShowScreenshot(step.screenshotBase64!)}
                  title="View Screenshot"
                >
                  <Image size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {testCase.pendingSteps && testCase.pendingSteps.length > 0 && (
          testCase.pendingSteps.map((pendingStep, i) => {
            const isFirstPending = i === 0 && testCase.status === 'running';
            return (
              <div
                key={`pending-${pendingStep.order}`}
                className={`flex items-start gap-2 p-2 rounded ${isFirstPending ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'}`}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {isFirstPending ? (
                    <Loader size={14} className="text-blue-600 animate-spin" />
                  ) : (
                    <Clock size={14} className="text-gray-400" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${isFirstPending ? 'text-blue-900 font-medium' : 'text-gray-500'}`}>{pendingStep.instruction}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${isFirstPending ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                  {isFirstPending ? 'Running' : 'Pending'}
                </span>
              </div>
            );
          })
        )}

        {/* Local Teardown */}
        {testCase.localTeardown && (
          <div className={`flex items-start gap-2 p-2 rounded ${testCase.localTeardown.status === 'running' ? 'bg-blue-50 border border-blue-200' :
            testCase.localTeardown.status === 'passed' ? 'bg-gray-50 border border-gray-200' :
              testCase.localTeardown.status === 'failed' ? 'bg-red-50 border border-red-200' :
                'bg-gray-50 border border-gray-200'
            }`}>
            <div className="flex-shrink-0 mt-0.5">
              {testCase.localTeardown.status === 'running' && <Loader size={14} className="text-blue-600 animate-spin" />}
              {testCase.localTeardown.status === 'passed' && <CheckCircle size={14} className="text-gray-500" />}
              {testCase.localTeardown.status === 'failed' && <XCircle size={14} className="text-red-500" />}
              {testCase.localTeardown.status === 'pending' && <Clock size={14} className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-0.5">Local Teardown</p>
              <p className="text-sm text-gray-900 truncate">{testCase.localTeardown.instruction}</p>
              {testCase.localTeardown.error && (
                <p className="text-xs text-red-600 font-mono mt-1">{testCase.localTeardown.error}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const FeatureItem = memo(({
  feature,
  onShowLogs,
  onShowReasoning,
  onShowScreenshot,
  onShowError
}: {
  feature: FeatureProgress;
  onShowLogs: (logs: string[]) => void;
  onShowReasoning: (reasoning: string) => void;
  onShowScreenshot: (base64: string) => void;
  onShowError: (error: string) => void;
}) => {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {getStatusIcon(feature.status)}
          <h2 className="text-lg font-semibold truncate max-w-md" title={feature.name || feature.featureId}>{feature.name || `Feature: ${feature.featureId.slice(-8)}`}</h2>
        </div>
        {getStatusBadge(feature.status)}
      </div>

      <div className="space-y-3">
        {/* Global Setup */}
        {feature.globalSetup && (
          <div className={`border rounded-lg p-3 ${feature.globalSetup.status === 'running' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'} bg-slate-50`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Icon based on status */}
                {feature.globalSetup.status === 'passed' && <CheckCircle size={16} className="text-green-600" />}
                {feature.globalSetup.status === 'failed' && <XCircle size={16} className="text-red-600" />}
                {feature.globalSetup.status === 'running' && <Loader size={16} className="text-blue-600 animate-spin" />}
                {feature.globalSetup.status === 'pending' && <Clock size={16} className="text-gray-400" />}

                <span className="font-semibold text-sm">Global Setup</span>
                <span className="text-sm text-gray-700">- {feature.globalSetup.instruction}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${feature.globalSetup.status === 'passed' || feature.globalSetup.status === 'failed' ? 'bg-gray-200 text-gray-700' :
                feature.globalSetup.status === 'running' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                {feature.globalSetup.status === 'passed' || feature.globalSetup.status === 'failed' ? 'DONE' :
                  feature.globalSetup.status === 'running' ? 'LOADING' : 'PENDING'}
              </span>
            </div>
            {feature.globalSetup.error && (
              <div className="mt-2 text-xs text-red-600 font-mono bg-red-50 p-2 rounded">
                {feature.globalSetup.error}
              </div>
            )}
          </div>
        )}

        {Array.from(feature.testCases.entries()).map(([testCaseId, testCase]) => (
          <TestCaseItem
            key={testCaseId}
            testCase={testCase}
            onShowLogs={onShowLogs}
            onShowReasoning={onShowReasoning}
            onShowScreenshot={onShowScreenshot}
            onShowError={onShowError}
          />
        ))}

        {/* Global Teardown */}
        {feature.globalTeardown && (
          <div className={`border rounded-lg p-3 ${feature.globalTeardown.status === 'running' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'} bg-slate-50`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Icon based on status */}
                {feature.globalTeardown.status === 'passed' && <CheckCircle size={16} className="text-green-600" />}
                {feature.globalTeardown.status === 'failed' && <XCircle size={16} className="text-red-600" />}
                {feature.globalTeardown.status === 'running' && <Loader size={16} className="text-blue-600 animate-spin" />}
                {feature.globalTeardown.status === 'pending' && <Clock size={16} className="text-gray-400" />}

                <span className="font-semibold text-sm">Global Teardown</span>
                <span className="text-sm text-gray-700">- {feature.globalTeardown.instruction}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${feature.globalTeardown.status === 'passed' || feature.globalTeardown.status === 'failed' ? 'bg-gray-200 text-gray-700' :
                feature.globalTeardown.status === 'running' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                {feature.globalTeardown.status === 'passed' || feature.globalTeardown.status === 'failed' ? 'DONE' :
                  feature.globalTeardown.status === 'running' ? 'LOADING' : 'PENDING'}
              </span>
            </div>
            {feature.globalTeardown.error && (
              <div className="mt-2 text-xs text-red-600 font-mono bg-red-50 p-2 rounded">
                {feature.globalTeardown.error}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
});

export const TestRunLivePage = () => {
  const { id: testRunId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Progress tracking
  const [features, setFeatures] = useState<Map<string, FeatureProgress>>(new Map());
  const [currentStep, setCurrentStep] = useState<StepResultData | null>(null);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [lastEvent, setLastEvent] = useState<string>('Waiting for events...');


  // Screenshot modal
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [selectedReasoning, setSelectedReasoning] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [selectedLogs, setSelectedLogs] = useState<string[] | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (testRunId) {
      loadTestRun();
      connectSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [testRunId]);

  const loadTestRun = async () => {
    try {
      const response = await getTestRun(testRunId!);
      const run = response.data;
      setTestRun(run);
      if (run.buildLogs && run.buildLogs.length > 0) {
        setBuildLogs(run.buildLogs);
      }

      // Populate features map from persisting steps
      if (run.stepResults && run.stepResults.length > 0) {
        setFeatures(prev => {
          const newFeatures = new Map(prev);

          run.stepResults!.forEach((step: any) => {
            if (!newFeatures.has(step.featureId)) {
              newFeatures.set(step.featureId, {
                featureId: step.featureId,
                name: step.featureName, // Use enriched name
                status: 'running', // Will be updated by test case statuses
                testCases: new Map()
              });
            }

            const feature = newFeatures.get(step.featureId)!;

            // Handle Global Setup Persistence
            // Note: Since 'executionSteps' treats global setup as a step with type='global-setup', 
            // we should check for that if the backend provides it that way. 
            // However, the provided 'StepResultData' interface in this file matches 'step-result' which is for test cases.
            // But 'loadTestRun' uses 'testRun.executionSteps' which might contain 'type' field which we haven't typed yet in 'StepResultData'.
            // Let's assume for now we might need to enhance 'StepResultData' or check additional properties if we want to restore global setup state from history.
            // For now, let's focus on live updates. If persistence is needed, we'd need to expand 'StepResultData' to include 'type'.

            // To properly restore from history:
            if ((step as any).type === 'global-setup') {
              feature.globalSetup = {
                instruction: step.instruction,
                status: step.status as any,
                logs: step.deviceLogs,
                startTime: step.startTime,
                endTime: step.endTime,
                error: (step as any).executionError
              };
              return newFeatures; // Continue (don't process as test case step)
            }
            if ((step as any).type === 'global-teardown') {
              feature.globalTeardown = {
                instruction: step.instruction,
                status: step.status as any,
                logs: step.deviceLogs,
                startTime: step.startTime,
                endTime: step.endTime,
                error: (step as any).executionError
              };
              return newFeatures;
            }

            if (!feature.testCases.has(step.testCaseId)) {
              feature.testCases.set(step.testCaseId, {
                testCaseId: step.testCaseId,
                title: step.testCaseTitle, // Use enriched title
                status: step.status === 'passed' ? 'passed' : 'failed', // Default to step status
                steps: []
              });
            }

            const testCase = feature.testCases.get(step.testCaseId)!;
            // Avoid duplicates if SSE already populated (though less likely on initial load)
            if (!testCase.steps.some(s => s.stepIndex === step.stepIndex)) {
              testCase.steps.push(step);
              // Sort steps by index
              testCase.steps.sort((a, b) => a.stepIndex - b.stepIndex);
            }
          });

          return newFeatures;
        });
      }
    } catch (error) {
      console.error('Failed to load test run:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectSSE = () => {
    const eventSource = new EventSource(`/api/test-runs/${testRunId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connected');
      setConnected(true);
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setConnected(false);
    };

    eventSource.addEventListener('connected', () => {
      console.log('Connected to test run stream');
    });

    eventSource.addEventListener('initial_state', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed = JSON.parse(messageEvent.data);
      const data = parsed.data;
      console.log('Initial state:', data);

      // Populate features map from test structure for progressive display
      if (data.testStructure && Array.isArray(data.testStructure)) {
        setFeatures(prev => {
          const newFeatures = new Map(prev);

          (data.testStructure as TestStructureItem[]).forEach(featureData => {
            // Get or create feature
            let feature = newFeatures.get(featureData.featureId);
            if (!feature) {
              feature = {
                featureId: featureData.featureId,
                name: featureData.featureName,
                status: 'pending',
                testCases: new Map(),
                globalSetup: featureData.globalSetup ? {
                  instruction: featureData.globalSetup.instruction,
                  status: 'pending'
                } : undefined,
                globalTeardown: featureData.globalTeardown ? {
                  instruction: featureData.globalTeardown.instruction,
                  status: 'pending'
                } : undefined
              };
              newFeatures.set(featureData.featureId, feature);
            }

            // Sync test cases and pending steps
            featureData.testCases.forEach(tcStruct => {
              let testCase = feature!.testCases.get(tcStruct.testCaseId);
              if (!testCase) {
                // New test case entirely
                testCase = {
                  testCaseId: tcStruct.testCaseId,
                  title: tcStruct.testCaseTitle,
                  status: 'pending',
                  steps: [],
                  pendingSteps: tcStruct.steps,
                  localSetup: ((tcStruct as any).localSetup && (tcStruct as any).localSetup.instruction) ? {
                    instruction: (tcStruct as any).localSetup.instruction,
                    status: (tcStruct as any).localSetup.status || 'pending',
                    error: (tcStruct as any).localSetup.error
                  } : undefined,
                  localTeardown: ((tcStruct as any).localTeardown && (tcStruct as any).localTeardown.instruction) ? {
                    instruction: (tcStruct as any).localTeardown.instruction,
                    status: (tcStruct as any).localTeardown.status || 'pending',
                    error: (tcStruct as any).localTeardown.error
                  } : undefined
                };
                feature!.testCases.set(tcStruct.testCaseId, testCase);
              } else {
                // Existing test case (from persisting steps) - Merge pending steps
                // Assume steps execute in order, so pending are the ones after current executed count
                if (!testCase.pendingSteps || testCase.pendingSteps.length === 0) {
                  const executedCount = testCase.steps.length;
                  if (executedCount < tcStruct.steps.length) {
                    testCase = {
                      ...testCase,
                      pendingSteps: tcStruct.steps.slice(executedCount)
                    };
                    feature!.testCases.set(tcStruct.testCaseId, testCase);
                  }
                }
              }
            });
          });

          return newFeatures;
        });
      }
    });

    eventSource.addEventListener('status', (event) => {
      const messageEvent = event as MessageEvent;
      const data = JSON.parse(messageEvent.data);
      setTestRun(prev => prev ? {
        ...prev,
        status: data.data.status,
        summary: data.data.summary || prev.summary,
        error: data.data.error || prev.error // Update error if present
      } : null);
    });

    // New: Listen for build logs
    eventSource.addEventListener('build_log', (event) => {
      const messageEvent = event as MessageEvent;
      const data = JSON.parse(messageEvent.data);
      setBuildLogs(prev => [...prev, data.data.log]);
    });

    eventSource.addEventListener('step_result', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed: TestRunSSEEvent = JSON.parse(messageEvent.data);
      const stepData = parsed.data as StepResultData;

      console.log('Step result received:', stepData, 'ID type:', typeof stepData.featureId);
      setLastEvent(`Result: Step ${stepData.stepIndex} ${stepData.status} (TC: ${stepData.testCaseId.slice(-4)})`);

      setCurrentStep(stepData);

      setFeatures(prev => {
        const newFeatures = new Map(prev);

        // Get or create feature (immutably)
        const existingFeature = newFeatures.get(stepData.featureId);
        let feature: FeatureProgress;

        if (!existingFeature) {
          feature = {
            featureId: stepData.featureId,
            name: stepData.featureName,
            status: 'running',
            testCases: new Map()
          };
        } else {
          // Create new feature object with new testCases map
          feature = {
            ...existingFeature,
            status: existingFeature.status === 'pending' ? 'running' : existingFeature.status,
            testCases: new Map(existingFeature.testCases)
          };
        }
        newFeatures.set(stepData.featureId, feature);

        // Get or create test case (immutably)
        const existingTestCase = feature.testCases.get(stepData.testCaseId);
        let updatedTestCase: TestCaseProgress;

        if (!existingTestCase) {
          updatedTestCase = {
            testCaseId: stepData.testCaseId,
            title: stepData.testCaseTitle,
            status: 'running',
            steps: [stepData],
            pendingSteps: []
          };
        } else {
          // Create new test case object with updated steps and reduced pendingSteps
          updatedTestCase = {
            ...existingTestCase,
            // START CHANGE: Keep status as 'running' so subsequent steps show spinner in UI.
            // Only transition from 'pending' to 'running'.
            // The 'test_case_complete' event will handle the final 'failed'/'passed' status.
            status: existingTestCase.status === 'pending' ? 'running' : existingTestCase.status,
            // END CHANGE
            steps: [...existingTestCase.steps, stepData],
            // Remove the first pending step (steps execute in order)
            pendingSteps: existingTestCase.pendingSteps ? existingTestCase.pendingSteps.slice(1) : []
          };

          // FALLBACK: Mark Local Setup as passed if first step is running/passed
          if (updatedTestCase.localSetup && updatedTestCase.localSetup.status === 'pending') {
            updatedTestCase.localSetup = {
              ...updatedTestCase.localSetup,
              status: 'passed'
            };
          }
        }

        // AUTO-COMPLETION LOGIC (Client-side)
        // If no more pending steps, mark test case as finished immediately
        if (updatedTestCase.pendingSteps && updatedTestCase.pendingSteps.length === 0) {
          const hasFailure = updatedTestCase.steps.some(s => s.status === 'failed');
          updatedTestCase.status = hasFailure ? 'failed' : 'passed';
        }

        feature.testCases.set(stepData.testCaseId, updatedTestCase);

        // FEATURE AUTO-COMPLETION LOGIC
        // If all test cases are done, mark feature as finished
        const allTestCases = Array.from(feature.testCases.values());
        // Check if we have all test cases (compare with known structure if possible, but here we just check current map)
        // Ideally we should know total test cases expected. 
        // For now, we assume if all *known* test cases are in final state, we might be done.
        // Better: Check if any are still 'pending' or 'running'.
        const isFeatureComplete = allTestCases.every(tc => tc.status === 'passed' || tc.status === 'failed');

        if (isFeatureComplete && allTestCases.length > 0) {
          const featureFailed = allTestCases.some(tc => tc.status === 'failed');
          feature.status = featureFailed ? 'failed' : 'passed';
        }

        return newFeatures;
      });
    });

    eventSource.addEventListener('test_case_complete', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed: TestRunSSEEvent = JSON.parse(messageEvent.data);
      const { featureId, testCaseId, status, runSummary } = parsed.data;

      setTestRun(prev => prev ? {
        ...prev,
        summary: runSummary || prev.summary // Update summary if provided
      } : null);

      setFeatures(prev => {
        const newFeatures = new Map(prev);
        const existingFeature = newFeatures.get(featureId);

        if (existingFeature) {
          // Create copy of feature
          const feature = {
            ...existingFeature,
            testCases: new Map(existingFeature.testCases)
          };

          const existingTestCase = feature.testCases.get(testCaseId);
          if (existingTestCase) {
            // Create copy of test case with new status
            const testCase = {
              ...existingTestCase,
              status: status
            };

            // FALLBACK: Mark Local Teardown as done (match status if failed? or just passed?)
            // Usually teardown runs regardless. If TC failed, teardown might still pass.
            // But if we forced it here, let's say passed unless it was already set to failed?
            // User just wants it marked done.
            if (testCase.localTeardown && testCase.localTeardown.status === 'pending') {
              testCase.localTeardown = {
                ...testCase.localTeardown,
                status: 'passed' // Assume passed if we reached completion without explicit teardown failure
              };
            }

            feature.testCases.set(testCaseId, testCase);
          }
          // Update feature in map
          newFeatures.set(featureId, feature);
        }
        return newFeatures;
      });
    });

    eventSource.addEventListener('feature_complete', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed: TestRunSSEEvent = JSON.parse(messageEvent.data);
      const { featureId, status } = parsed.data;

      setFeatures(prev => {
        const newFeatures = new Map(prev);
        const existingFeature = newFeatures.get(featureId);

        if (existingFeature) {
          // Create copy of feature with new status
          const feature = {
            ...existingFeature,
            status: status
          };
          newFeatures.set(featureId, feature);
        }
        return newFeatures;
      });
    });

    eventSource.addEventListener('feature_setup_result', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed = JSON.parse(messageEvent.data);
      const { featureId, status, error } = parsed.data;

      setFeatures(prev => {
        const newFeatures = new Map(prev);
        const feature = newFeatures.get(featureId);
        if (feature && feature.globalSetup) {
          feature.globalSetup = {
            ...feature.globalSetup,
            status: status,
            error: error
          };
          if (status === 'running') feature.status = 'running';
          newFeatures.set(featureId, { ...feature });
        }
        return newFeatures;
      });
    });

    eventSource.addEventListener('feature_teardown_result', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed = JSON.parse(messageEvent.data);
      const { featureId, status, error } = parsed.data;

      setFeatures(prev => {
        const newFeatures = new Map(prev);
        const feature = newFeatures.get(featureId);
        if (feature && feature.globalTeardown) {
          feature.globalTeardown = {
            ...feature.globalTeardown,
            status: status,
            error: error
          };
          // Note: if teardown is running, feature is technically still running or wrapping up
          newFeatures.set(featureId, { ...feature });
        }
        return newFeatures;
      });
    });

    eventSource.addEventListener('test_case_setup_result', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed = JSON.parse(messageEvent.data);
      const { featureId: rawFeatureId, testCaseId, status, error } = parsed.data;

      setFeatures(prev => {
        const newFeatures = new Map(prev);
        let targetFeatureId = rawFeatureId;

        // Fallback: If featureId missing, find feature containing this test case
        if (!targetFeatureId) {
          for (const [fId, f] of newFeatures.entries()) {
            if (f.testCases.has(testCaseId)) {
              targetFeatureId = fId;
              break;
            }
          }
        }

        const feature = targetFeatureId ? newFeatures.get(targetFeatureId) : undefined;
        if (feature) {
          const newTestCases = new Map(feature.testCases);
          const testCase = newTestCases.get(testCaseId);
          if (testCase) {
            const updatedTestCase = { ...testCase };
            // Only update if we have a valid setup object (meaning it was expected)
            if (updatedTestCase.localSetup) {
              updatedTestCase.localSetup = {
                ...updatedTestCase.localSetup,
                status: status,
                error: error
              };
            } else {
              // Should we force it if missing?
              // User said "don't show if not set". 
              // If we receive a result, it implies it was executed.
              // But if initial state didn't have it (empty instruction), maybe we shouldn't show it?
              // Or maybe we should? PROBABLY NOT based on user request "keep hidden if not set".
              // BUT if we receive an event, it means the agent ran it.
              // Let's strictly follow the instruction-presence check.
              // If instruction was empty, we shouldn't show it.
              // Assuming agent won't send results for empty instructions.
            }
            newTestCases.set(testCaseId, updatedTestCase);
            return new Map(newFeatures.set(feature.featureId, { ...feature, testCases: newTestCases }));
          }
        }
        return prev;
      });
    });

    eventSource.addEventListener('test_case_teardown_result', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed = JSON.parse(messageEvent.data);
      const { featureId: rawFeatureId, testCaseId, status, error } = parsed.data;

      setFeatures(prev => {
        const newFeatures = new Map(prev);
        let targetFeatureId = rawFeatureId;

        if (!targetFeatureId) {
          for (const [fId, f] of newFeatures.entries()) {
            if (f.testCases.has(testCaseId)) {
              targetFeatureId = fId;
              break;
            }
          }
        }

        const feature = targetFeatureId ? newFeatures.get(targetFeatureId) : undefined;
        if (feature) {
          const newTestCases = new Map(feature.testCases);
          const testCase = newTestCases.get(testCaseId);
          if (testCase) {
            const updatedTestCase = { ...testCase };
            if (updatedTestCase.localTeardown) {
              updatedTestCase.localTeardown = {
                ...updatedTestCase.localTeardown,
                status: status,
                error: error
              };
            }
            newTestCases.set(testCaseId, updatedTestCase);
            return new Map(newFeatures.set(feature.featureId, { ...feature, testCases: newTestCases }));
          }
        }
        return prev;
      });
    });

    eventSource.addEventListener('run_complete', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed: TestRunSSEEvent = JSON.parse(messageEvent.data);
      setTestRun(prev => prev ? {
        ...prev,
        status: parsed.data.status,
        summary: parsed.data.summary || prev.summary,
        error: parsed.data.error || prev.error // Preserve existing error or take new one
      } : null);

      // Close SSE connection
      eventSource.close();
      setConnected(false);
    });

    eventSource.addEventListener('error', (event) => {
      const messageEvent = event as MessageEvent;
      const parsed: TestRunSSEEvent = JSON.parse(messageEvent.data);
      console.error('Test run error:', parsed.data);
      // Also update state on error event
      if (parsed.data.error) {
        setTestRun(prev => prev ? { ...prev, error: parsed.data.error } : null);
      }
    });
  };

  const handleCancel = async () => {
    if (!testRunId) return;

    try {
      setCancelling(true);
      await cancelTestRun(testRunId);
    } catch (error) {
      console.error('Failed to cancel test run:', error);
    } finally {
      setCancelling(false);
    }
  };



  const handleShowLogs = useCallback((logs: string[]) => {
    setSelectedLogs(logs);
  }, []);

  const handleShowReasoning = useCallback((reasoning: string) => {
    setSelectedReasoning(reasoning);
  }, []);

  const handleShowScreenshot = useCallback((screenshot: string) => {
    setSelectedScreenshot(screenshot);
  }, []);

  const handleShowError = useCallback((error: string) => {
    setSelectedError(error);
  }, []);

  if (loading) {
    return <div className="text-center py-12">Loading test run...</div>;
  }

  if (!testRun) {
    return <div className="text-center py-12">Test run not found</div>;
  }

  const isRunning = !['completed', 'failed', 'cancelled'].includes(testRun.status);

  const handleSave = async () => {
    if (!testRunId) return;
    try {
      await saveTestRun(testRunId);
      // Wait a bit or update local state to show saved
      navigate(`/projects/${testRun?.projectId}`);
    } catch (error) {
      console.error('Failed to save test run:', error);
      alert('Failed to save test run');
    }
  };

  const handleDiscard = () => {
    // Just navigate away, backend will hide it from list
    if (confirm('Are you sure you want to discard this test run? It will not be saved to your history.')) {
      navigate(`/projects/${testRun?.projectId}`);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} className="mr-2" />
          Back
        </Button>

        {
          ['completed', 'failed', 'cancelled'].includes(testRun.status) && !testRun.isSaved && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDiscard}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Discard Results
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Save Results
              </Button>
            </div>
          )
        }
      </div>

      {/* Header */}
      <Card className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-4">
            {getStatusIcon(testRun.status)}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Test Run</h1>
              <p className="text-xs text-blue-500 font-mono mt-1">Status: {lastEvent}</p>
              <p className="text-gray-600">
                {testRun.deviceInfo?.model || 'Device'} • Android {testRun.deviceInfo?.androidVersion || 'Unknown'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(testRun.status)}
            {connected && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>

        {/* Error Display */}
        {
          testRun.error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 mx-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                </div>
                <div className="ml-3 w-full">
                  <h3 className="text-sm font-medium text-red-800">Test Run Failed</h3>
                  <div className="mt-2 text-sm text-red-700 whitespace-pre-wrap font-mono">
                    {testRun.error}
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{testRun.summary?.totalSteps || 0}</p>
            <p className="text-sm text-gray-600">Total Steps</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{testRun.summary?.passedSteps || 0}</p>
            <p className="text-sm text-green-700">Passed</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{testRun.summary?.failedSteps || 0}</p>
            <p className="text-sm text-red-700">Failed</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{testRun.summary?.totalTestCases || 0}</p>
            <p className="text-sm text-blue-700">Test Cases</p>
          </div>
        </div>

        {
          isRunning && (
            <Button
              variant="secondary"
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full"
            >
              <StopCircle size={18} className="mr-2" />
              {cancelling ? 'Cancelling...' : 'Cancel Test Run'}
            </Button>
          )
        }
      </Card >

      {/* Conclusion Card */}
      {
        ['completed', 'failed', 'cancelled'].includes(testRun.status) && (
          <Card className="mb-6 border-l-4 border-indigo-500 bg-indigo-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-indigo-900">Test Run Concluded</h3>
                <p className="text-indigo-700">
                  The test run has finished with status: <span className="font-bold uppercase">{testRun.status}</span>
                </p>
              </div>
              {
                !testRun.isSaved ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={handleDiscard}
                      className="text-red-600 hover:text-red-700 hover:bg-red-100 bg-white"
                    >
                      Discard Results
                    </Button>
                    <Button
                      onClick={handleSave}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      Save Results
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => navigate(`/projects/${testRun.projectId}`)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Return to Project
                  </Button>
                )
              }
            </div>
          </Card>
        )
      }

      {
        (testRun.status !== 'pending') && (
          <Card className="mb-6 border-l-4 border-gray-500 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {(testRun.status === 'building' || testRun.status === 'installing' || testRun.status === 'booting') ? (
                  <Loader size={16} className="text-blue-600 animate-spin" />
                ) : (
                  <div className="w-4 h-4" />
                )}
                <span className="font-medium text-gray-900">
                  {testRun.status === 'building' ? 'Building Application...' :
                    testRun.status === 'installing' ? 'Installing/Launching Application...' :
                      testRun.status === 'booting' ? 'Booting Emulator...' : 'Execution Logs'}
                </span>
              </div>
              <span className="text-xs text-gray-500">{buildLogs.length} lines</span>
            </div>

            <LogsContainer logs={buildLogs} />
          </Card>
        )
      }

      {/* Current Step */}
      {
        currentStep && isRunning && (
          <Card className="mb-6 border-l-4 border-blue-500">
            <div className="flex items-center gap-2 mb-2">
              <Loader size={16} className="text-blue-600 animate-spin" />
              <span className="text-sm font-medium text-blue-600">Currently Running</span>
            </div>
            <p className="text-gray-900">{currentStep.instruction}</p>
            {currentStep.expectedResult && (
              <p className="text-sm text-gray-600 mt-1">Expected: {currentStep.expectedResult}</p>
            )}
          </Card>
        )
      }

      {/* Results by Feature/Test Case */}
      <div className="h-[600px] overflow-y-auto border border-gray-200 rounded-xl bg-gray-50 p-4 space-y-4 shadow-inner">
        {Array.from(features.entries()).map(([featureId, feature]) => (
          <FeatureItem
            key={featureId}
            feature={feature}
            onShowLogs={handleShowLogs}
            onShowReasoning={handleShowReasoning}
            onShowScreenshot={handleShowScreenshot}
            onShowError={handleShowError}
          />
        ))}
      </div>

      {
        features.size === 0 && !isRunning && !['building', 'booting', 'installing'].includes(testRun.status) && (
          <Card className="text-center py-8">
            <p className="text-gray-500">No test results yet</p>
          </Card>
        )
      }

      {/* Screenshot Modal */}
      <Modal
        isOpen={!!selectedScreenshot}
        onClose={() => setSelectedScreenshot(null)}
        title="Screenshot"
      >
        {selectedScreenshot && (
          <img
            src={`data:image/png;base64,${selectedScreenshot}`}
            alt="Test step screenshot"
            className="max-w-full h-auto rounded-lg"
          />
        )}
      </Modal>

      {/* AI Reasoning Modal */}
      <Modal
        isOpen={!!selectedReasoning}
        onClose={() => setSelectedReasoning(null)}
        title="AI Analysis"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <Brain size={24} />
            <h3 className="font-semibold text-lg">AI Feedback</h3>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {selectedReasoning}
          </p>
        </div>
      </Modal>

      {/* Device Logs Modal */}
      <Modal
        isOpen={!!selectedLogs}
        onClose={() => setSelectedLogs(null)}
        title="Device Logs"
      >
        <div className="bg-gray-900 text-gray-100 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto">
          {selectedLogs && selectedLogs.length > 0 ? (
            selectedLogs.map((log, i) => (
              <div key={i} className="break-all whitespace-pre-wrap mb-0.5 border-b border-gray-800 pb-0.5">{log}</div>
            ))
          ) : (
            <span className="text-gray-500 italic">No logs captured for this step.</span>
          )}
        </div>
      </Modal>

      {/* Execution Error Modal */}
      <Modal
        isOpen={!!selectedError}
        onClose={() => setSelectedError(null)}
        title="Execution Error"
      >
        <div className="bg-red-50 text-red-900 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto">
          <p className="whitespace-pre-wrap">{selectedError}</p>
        </div>
      </Modal>
    </div >
  );
};


