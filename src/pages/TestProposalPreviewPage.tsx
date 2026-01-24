import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Loader, AlertCircle, Brain, Zap, X, Image, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import axios from 'axios';
import type { Project } from '../types';
import { getProject } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { AIConfigWarningModal, useAIConfigCheck } from '../components/AIConfigWarning';

interface TestStep {
  order: number;
  instruction: string;
  expectedResult?: string;
  expectedFigmaNodeId?: string;
  waitTimeMs?: number;
}

interface TestCase {
  title: string;
  status?: 'NEW' | 'MODIFIED' | 'UNCHANGED' | 'REMOVED';
  localSetup?: { instruction: string };
  steps: TestStep[];
  localTeardown?: { instruction: string };
  relatedFigmaNodeIds?: string[];
}

interface Feature {
  name: string;
  description: string;
  status?: 'NEW' | 'MODIFIED' | 'UNCHANGED';
  globalSetup?: { instruction: string; timeout?: number };
  globalTeardown?: { instruction: string };
  testCases: TestCase[];
}

interface TestProposal {
  features: Feature[];
}

interface AnalysisResult {
  projectId: string;
  projectName: string;
  proposal: TestProposal;
  figmaAnalysis?: any;
}

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'scanning' | 'done';
  detail?: string;
}

export const TestProposalPreviewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const transientConfig = location.state?.configData;
  const [project, setProject] = useState<Project | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [modalImage, setModalImage] = useState<{ src: string; name: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // AI Config check
  const { isConfigured, isLoading: aiConfigLoading } = useAIConfigCheck();
  const [showAIWarning, setShowAIWarning] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);

  // Progress State
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([
    { id: 'init', label: 'Initializing', status: 'pending' },
    { id: 'discovery', label: 'Discovering Files', status: 'pending' },
    { id: 'reading', label: 'Reading Context', status: 'pending' },
    { id: 'analysis', label: 'AI Analysis', status: 'pending' },
    { id: 'figma', label: 'Processing Design', status: 'pending' },
    { id: 'complete', label: 'Finalizing', status: 'pending' }
  ]);

  useEffect(() => {
    if (id && !aiConfigLoading && !analysisStarted) {
      if (!isConfigured) {
        setShowAIWarning(true);
        setLoading(false);
      } else {
        setAnalysisStarted(true);
        loadProjectAndAnalyze();
      }
    }
  }, [id, aiConfigLoading, isConfigured, analysisStarted]);

  const handleContinueWithoutConfig = () => {
    setShowAIWarning(false);
    setAnalysisStarted(true);
    setLoading(true);
    loadProjectAndAnalyze();
  };

  const updateStep = (stepId: string, status: 'scanning' | 'done', detail?: string) => {
    setProgressSteps(prev => prev.map(step => {
      if (step.id === stepId) {
        return { ...step, status, detail: detail || step.detail };
      }
      return step;
    }));
    if (status === 'scanning') {
      // Mark previous steps as done
      setProgressSteps(prev => {
        const idx = prev.findIndex(s => s.id === stepId);
        return prev.map((step, i) => {
          if (i < idx) return { ...step, status: 'done' };
          return step;
        });
      });
    }
  };

  const loadProjectAndAnalyze = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get project details
      const projectRes = await getProject(id!);
      setProject(projectRes.data);

      // Start Streaming Analysis
      await streamAnalysis(projectRes.data);

    } catch (err: any) {
      console.error('Failed to analyze project:', err);
      setError(err.message || 'Failed to analyze project');
      setLoading(false);
    }
  };

  const streamAnalysis = async (_projectData: Project) => {
    try {
      // Use fetch for streaming support with POST body
      const response = await fetch(`/api/projects/${id}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(transientConfig || {})
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message || 'Analysis failed');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              handleProgressEvent(data);
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Stream connection failed');
      setLoading(false);
    }
  };

  const handleProgressEvent = (data: any) => {
    const { stage, message, detail, result, error } = data;

    if (error) {
      setError(error);
      setLoading(false);
      return;
    }

    if (stage === 'result') {
      // Complete all steps
      setProgressSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
      // Artificial delay to show completion
      setTimeout(() => {
        setAnalysisResult(result);
        setLoading(false);
      }, 500);
      return;
    }

    // Map stages to step IDs
    // stages: discovery, reading, analysis, figma, complete
    if (['discovery', 'reading', 'analysis', 'figma', 'complete'].includes(stage)) {
      updateStep(stage, 'scanning', detail);
    } else if (stage === 'init') {
      updateStep('init', 'scanning', message);
    }
  };

  const handleImport = async () => {
    if (!analysisResult) return;

    try {
      setImporting(true);

      await axios.post(`/api/projects/${id}/import-proposal`, {
        proposal: analysisResult.proposal,
        figmaAnalysis: analysisResult.figmaAnalysis
      });

      // Navigate back to project detail page
      navigate(`/projects/${id}`);
    } catch (err: any) {
      console.error('Failed to import proposal:', err);
      setError(err.response?.data?.message || err.message || 'Failed to import proposal');
    } finally {
      setImporting(false);
    }
  };

  // Progress Render Component
  const renderProgress = () => (
    <div className="max-w-2xl mx-auto py-12">
      <Card className="p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <Brain className="text-blue-600 animate-pulse" size={32} />
          Analyzing Project
        </h2>

        <div className="space-y-6">
          {progressSteps.map((step) => {
            const isActive = step.status === 'scanning';
            const isDone = step.status === 'done';
            const isPending = step.status === 'pending';

            return (
              <div key={step.id} className={`flex items-start gap-4 transition-all duration-300 ${isPending ? 'opacity-40' : 'opacity-100'}`}>
                <div className={`
                  flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  ${isDone ? 'bg-green-100 text-green-600' : isActive ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-gray-100 text-gray-400'}
                `}>
                  {isDone ? <CheckCircle size={20} /> : isActive ? <Zap size={20} /> : <div className="w-2 h-2 rounded-full bg-current" />}
                </div>

                <div className="flex-1 pt-1">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className={`font-semibold ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                      {step.label}
                    </h3>
                    {isActive && <Loader size={16} className="animate-spin text-blue-500" />}
                  </div>

                  {step.detail && (isActive || isDone) && (
                    <p className="text-sm text-gray-500 font-mono truncate max-w-lg">
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );

  if (loading && !showAIWarning) {
    return renderProgress();
  }

  // Show AI config warning modal
  if (showAIWarning) {
    return (
      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/projects/${id}`)}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Project
        </Button>
        <Card className="text-center py-12">
          <Brain size={48} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">AI Analysis</h2>
          <p className="text-gray-600 mb-4">Ready to analyze your project with AI</p>
        </Card>
        <AIConfigWarningModal
          isOpen={showAIWarning}
          onClose={() => navigate(`/projects/${id}`)}
          onContinue={handleContinueWithoutConfig}
          title="AI Configuration Missing"
          message="To analyze your project and generate test cases, you need to configure an AI provider. Would you like to configure it now?"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/projects/${id}`)}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Project
        </Button>
        <Card className="text-center py-12">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Analysis Failed</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={loadProjectAndAnalyze}>Try Again</Button>
        </Card>
      </div>
    );
  }

  if (!analysisResult || !project) {
    return <div className="text-center py-12">No analysis result available</div>;
  }

  const totalTestCases = analysisResult.proposal.features.reduce(
    (sum, feature) => sum + feature.testCases.length,
    0
  );

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/projects/${id}`)}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        Back to Project
      </Button>

      <Card className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Test Proposal</h1>
            <p className="text-gray-600">
              AI-generated test plan for <span className="font-semibold">{project.name}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-2">
              <span className="font-semibold">{analysisResult.proposal.features.length}</span> Features
              {' • '}
              <span className="font-semibold">{totalTestCases}</span> Test Cases
            </div>
            <Button onClick={handleImport} disabled={importing}>
              <CheckCircle size={20} className="mr-2" />
              {importing ? 'Importing...' : 'Import Proposal'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {analysisResult.proposal.features.map((feature, featureIdx) => (
          <Card
            key={featureIdx}
            className={`
              ${feature.status === 'NEW' ? 'border-2 border-green-500' : ''}
              transition-all duration-300
            `}
          >
            <div className="mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{feature.name}</h2>
                  <p className="text-gray-600">{feature.description}</p>
                </div>
                {feature.status === 'NEW' && (
                  <span className="px-3 py-1 text-sm font-bold rounded-full bg-green-100 text-green-800 border border-green-200">
                    NEW FEATURE
                  </span>
                )}
              </div>
            </div>

            {feature.globalSetup && feature.globalSetup.instruction && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-1">Global Setup</p>
                <p className="text-sm text-blue-700">{feature.globalSetup.instruction}</p>
              </div>
            )}

            <div className="space-y-4">
              {feature.testCases.map((testCase, testCaseIdx) => {
                const isRemoved = testCase.status === 'REMOVED';

                return (
                  <div
                    key={testCaseIdx}
                    className={`
                      border rounded-lg p-4 transition-all
                      ${isRemoved
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-200 hover:border-blue-300'
                      }
                    `}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className={`text-lg font-semibold ${isRemoved ? 'text-red-800 decoration-red-900' : 'text-gray-900'}`}>
                        {testCase.title}
                        {isRemoved && <span className="ml-2 text-xs font-normal opacity-75">(To be removed)</span>}
                      </h3>
                      <div className="flex gap-2">
                        {testCase.status === 'NEW' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">NEW</span>
                        )}
                        {testCase.status === 'MODIFIED' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">MODIFIED</span>
                        )}
                        {testCase.status === 'UNCHANGED' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-600">UNCHANGED</span>
                        )}
                        {testCase.status === 'REMOVED' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">REMOVED</span>
                        )}
                      </div>
                    </div>

                    {!isRemoved && (
                      <>
                        {testCase.localSetup && testCase.localSetup.instruction && (
                          <div className="mb-3 p-2 bg-green-50 rounded text-sm">
                            <span className="font-medium text-green-900">Setup: </span>
                            <span className="text-green-700">{testCase.localSetup.instruction}</span>
                          </div>
                        )}

                        <div className="space-y-3 mb-3">
                          {testCase.steps.map((step, stepIdx) => {
                            // Find the image for this step's expectedFigmaNodeId
                            const stepImgSrc = step.expectedFigmaNodeId
                              ? `/api/projects/${id}/figma-images/${encodeURIComponent(step.expectedFigmaNodeId)}`
                              : null;

                            return (
                              <div key={stepIdx} className="border-l-2 border-gray-200 pl-3">
                                <div className="flex gap-3">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-700 text-sm flex items-center justify-center font-medium">
                                    {step.order}
                                  </span>
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-900">{step.instruction}</p>
                                    {step.expectedResult && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        Expected: {step.expectedResult}
                                      </p>
                                    )}
                                    {step.waitTimeMs && step.waitTimeMs > 0 && (
                                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">
                                        ⏱ Wait {step.waitTimeMs}ms
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Expected Image from Figma - display inline with step */}
                                {stepImgSrc && (
                                  <div className="mt-2 ml-9">
                                    <button
                                      onClick={() => setModalImage({ src: stepImgSrc, name: `Step ${step.order} Expected` })}
                                      className="group relative rounded-lg border border-gray-200 overflow-hidden hover:border-purple-400 hover:shadow-md transition-all bg-gray-50 max-w-xs"
                                      title="Click to view full size"
                                    >
                                      <img
                                        src={stepImgSrc}
                                        alt={`Step ${step.order} expected result`}
                                        className="w-full h-32 object-contain"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                        <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-medium drop-shadow bg-black/50 px-2 py-1 rounded">Click to enlarge</span>
                                      </div>
                                    </button>
                                    <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                                      <Image size={12} />
                                      Expected visual state
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {testCase.localTeardown && testCase.localTeardown.instruction && (
                          <div className="p-2 bg-orange-50 rounded text-sm">
                            <span className="font-medium text-orange-900">Teardown: </span>
                            <span className="text-orange-700">{testCase.localTeardown.instruction}</span>
                          </div>
                        )}

                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {feature.globalTeardown && feature.globalTeardown.instruction && (
              <div className="mt-4 p-3 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-900 mb-1">Global Teardown</p>
                <p className="text-sm text-red-700">{feature.globalTeardown.instruction}</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Image Modal with Zoom and Pan Controls */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => {
            setModalImage(null);
            setImageZoom(1);
            setImagePosition({ x: 0, y: 0 });
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-black/50" onClick={(e) => e.stopPropagation()}>
            <span className="font-medium text-white">{modalImage.name}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setImageZoom(z => Math.max(0.25, z - 0.25))}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Zoom Out"
              >
                <ZoomOut size={20} />
              </button>
              <span className="text-white text-sm min-w-[60px] text-center">{Math.round(imageZoom * 100)}%</span>
              <button
                onClick={() => setImageZoom(z => Math.min(4, z + 0.25))}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Zoom In"
              >
                <ZoomIn size={20} />
              </button>
              <button
                onClick={() => {
                  setImageZoom(1);
                  setImagePosition({ x: 0, y: 0 });
                }}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Reset View"
              >
                <RotateCcw size={20} />
              </button>
              <div className="w-px h-6 bg-white/30 mx-2" />
              <button
                onClick={() => {
                  setModalImage(null);
                  setImageZoom(1);
                  setImagePosition({ x: 0, y: 0 });
                }}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Image Container with Pan */}
          <div
            ref={imageContainerRef}
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              if (imageZoom > 1) {
                setIsDragging(true);
                setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
              }
            }}
            onMouseMove={(e) => {
              if (isDragging && imageZoom > 1) {
                setImagePosition({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              setImageZoom(z => Math.max(0.25, Math.min(4, z + delta)));
            }}
          >
            <img
              src={modalImage.src}
              alt={modalImage.name}
              className="max-w-none select-none"
              style={{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${imageZoom})`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
              draggable={false}
            />
          </div>

          {/* Footer hint */}
          <div className="p-2 bg-black/50 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-white/60 text-xs flex items-center justify-center gap-2">
              <Move size={14} /> Drag to pan when zoomed • Scroll to zoom • Click background to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
