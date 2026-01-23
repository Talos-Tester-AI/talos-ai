import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Trash2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { getTestCaseRun } from '../api/client';
import type { TestCaseRun } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';

export const TestCaseRunDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [testCaseRun, setTestCaseRun] = useState<TestCaseRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      const response = await getTestCaseRun(id!);
      setTestCaseRun(response.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!testCaseRun) {
    return <div className="text-center py-12">Test case run not found</div>;
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/feature-runs/${testCaseRun.featureRunId}`)}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        Back to Feature Run
      </Button>

      <Card className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{testCaseRun.testTitle}</h1>
            <StatusBadge status={testCaseRun.status} />
          </div>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p>Started: {formatDate(testCaseRun.startTime)}</p>
          {testCaseRun.endTime && <p>Ended: {formatDate(testCaseRun.endTime)}</p>}
        </div>
      </Card>

      {testCaseRun.localSetupResult && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={20} className="text-gray-600" />
            <h2 className="text-xl font-bold text-gray-900">Local Setup</h2>
            <StatusBadge status={testCaseRun.localSetupResult.status} />
          </div>

          <p className="text-sm text-gray-700 mb-4">{testCaseRun.localSetupResult.instruction}</p>

          {testCaseRun.localSetupResult.llmExecutionLog.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">LLM Execution Log:</p>
              <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-2">
                {testCaseRun.localSetupResult.llmExecutionLog.map((log, index) => (
                  <div key={index} className="border-l-2 border-blue-500 pl-3">
                    <pre className="text-gray-800">{JSON.stringify(log, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {testCaseRun.localSetupResult.finalScreenshot && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Final Screenshot:</p>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <img
                  src={testCaseRun.localSetupResult.finalScreenshot}
                  alt="Setup final screenshot"
                  className="w-full"
                />
              </div>
            </div>
          )}
        </Card>
      )}

      <h2 className="text-2xl font-bold text-gray-900 mb-6">Step Results</h2>

      <div className="space-y-6 mb-6">
        {testCaseRun.stepResults.map((step) => (
          <Card key={step.stepIndex} className={step.status === 'failed' ? 'border-red-300' : ''}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">Step {step.stepIndex}</h3>
                  <StatusBadge status={step.status} />
                </div>
                <p className="text-sm text-gray-700 mb-2">{step.instruction}</p>
                <p className="text-xs text-gray-500">
                  {formatDate(step.startTime)} - {formatDate(step.endTime)}
                </p>
              </div>
            </div>

            {step.llmReasoning && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-1">LLM Reasoning:</p>
                <p className="text-sm text-blue-800">{step.llmReasoning}</p>
              </div>
            )}

            {step.error && (
              <div className="mb-4 p-3 bg-red-50 rounded-lg flex items-start gap-2">
                <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-900 mb-1">Error:</p>
                  <p className="text-sm text-red-800">{step.error}</p>
                </div>
              </div>
            )}

            {(step.expectedImage || step.actualImage) && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <ImageIcon size={18} className="text-gray-600" />
                  <p className="text-sm font-medium text-gray-700">Visual Comparison</p>
                  {step.visualMatchScore !== undefined && (
                    <span className={`text-sm font-semibold ${
                      step.visualMatchScore >= 0.95 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {(step.visualMatchScore * 100).toFixed(1)}% match
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {step.expectedImage && (
                    <div>
                      <p className="text-xs text-gray-600 mb-2">Expected</p>
                      <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <img src={step.expectedImage} alt="Expected" className="w-full" />
                      </div>
                    </div>
                  )}

                  {step.actualImage && (
                    <div>
                      <p className="text-xs text-gray-600 mb-2">Actual</p>
                      <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <img src={step.actualImage} alt="Actual" className="w-full" />
                      </div>
                    </div>
                  )}

                  {step.visualDiffImage && (
                    <div>
                      <p className="text-xs text-gray-600 mb-2">Diff</p>
                      <div className="border border-red-300 rounded-lg overflow-hidden">
                        <img src={step.visualDiffImage} alt="Diff" className="w-full" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {testCaseRun.localTeardownResult && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Trash2 size={20} className="text-gray-600" />
            <h2 className="text-xl font-bold text-gray-900">Local Teardown</h2>
            <StatusBadge status={testCaseRun.localTeardownResult.status} />
          </div>

          <p className="text-sm text-gray-700 mb-4">{testCaseRun.localTeardownResult.instruction}</p>

          {testCaseRun.localTeardownResult.llmExecutionLog.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">LLM Execution Log:</p>
              <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-2">
                {testCaseRun.localTeardownResult.llmExecutionLog.map((log, index) => (
                  <div key={index} className="border-l-2 border-blue-500 pl-3">
                    <pre className="text-gray-800">{JSON.stringify(log, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {testCaseRun.localTeardownResult.error && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-900 mb-1">Error:</p>
                <p className="text-sm text-red-800">{testCaseRun.localTeardownResult.error}</p>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

