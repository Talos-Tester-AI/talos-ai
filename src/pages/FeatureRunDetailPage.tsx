import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Trash2 } from 'lucide-react';
import { getFeatureRun, getTestCaseRunsByFeatureRun } from '../api/client';
import type { FeatureRun, TestCaseRun } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';

export const FeatureRunDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [featureRun, setFeatureRun] = useState<FeatureRun | null>(null);
  const [testCaseRuns, setTestCaseRuns] = useState<TestCaseRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      const [featureRes, testCasesRes] = await Promise.all([
        getFeatureRun(id!),
        getTestCaseRunsByFeatureRun(id!)
      ]);
      setFeatureRun(featureRes.data);
      setTestCaseRuns(testCasesRes.data);
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

  if (!featureRun) {
    return <div className="text-center py-12">Feature run not found</div>;
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/suite-runs/${featureRun.suiteRunId}`)}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        Back to Suite Run
      </Button>

      <Card className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{featureRun.featureName}</h1>
            <StatusBadge status={featureRun.status} />
          </div>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p>Started: {formatDate(featureRun.startTime)}</p>
          {featureRun.endTime && <p>Ended: {formatDate(featureRun.endTime)}</p>}
        </div>
      </Card>

      {featureRun.globalSetupResult && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={20} className="text-gray-600" />
            <h2 className="text-xl font-bold text-gray-900">Global Setup</h2>
            <StatusBadge status={featureRun.globalSetupResult.status} />
          </div>

          <div className="space-y-2 mb-4">
            <p className="text-sm text-gray-600">
              Duration: {formatDate(featureRun.globalSetupResult.startTime)} - {formatDate(featureRun.globalSetupResult.endTime)}
            </p>
          </div>

          {featureRun.globalSetupResult.logs.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Logs:</p>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
                {featureRun.globalSetupResult.logs.map((log, index) => (
                  <div key={index}>
                    <span className="text-gray-400">[{log.ts}]</span>{' '}
                    <span className={log.level === 'error' ? 'text-red-400' : 'text-gray-100'}>
                      [{log.level}]
                    </span>{' '}
                    {log.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {featureRun.globalSetupResult.createdData && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Created Data:</p>
              <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(featureRun.globalSetupResult.createdData, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      )}

      <h2 className="text-2xl font-bold text-gray-900 mb-6">Test Case Runs</h2>

      <div className="space-y-4 mb-6">
        {testCaseRuns.map((testCaseRun) => (
          <Card
            key={testCaseRun._id}
            hoverable
            onClick={() => navigate(`/test-case-runs/${testCaseRun._id}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{testCaseRun.testTitle}</h3>
                  <StatusBadge status={testCaseRun.status} />
                </div>
                <p className="text-sm text-gray-600">
                  Steps: {testCaseRun.stepResults.length} | Started: {formatDate(testCaseRun.startTime)}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {featureRun.globalTeardownResult && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Trash2 size={20} className="text-gray-600" />
            <h2 className="text-xl font-bold text-gray-900">Global Teardown</h2>
            <StatusBadge status={featureRun.globalTeardownResult.status} />
          </div>

          <div className="space-y-2 mb-4">
            <p className="text-sm text-gray-600">
              Duration: {formatDate(featureRun.globalTeardownResult.startTime)} - {formatDate(featureRun.globalTeardownResult.endTime)}
            </p>
          </div>

          {featureRun.globalTeardownResult.logs.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Logs:</p>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
                {featureRun.globalTeardownResult.logs.map((log, index) => (
                  <div key={index}>
                    <span className="text-gray-400">[{log.ts}]</span>{' '}
                    <span className={log.level === 'error' ? 'text-red-400' : 'text-gray-100'}>
                      [{log.level}]
                    </span>{' '}
                    {log.msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

