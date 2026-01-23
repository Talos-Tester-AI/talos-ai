import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Monitor } from 'lucide-react';
import { getSuiteRun, getFeatureRunsBySuite } from '../api/client';
import type { SuiteRun, FeatureRun } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';

export const SuiteRunDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [suiteRun, setSuiteRun] = useState<SuiteRun | null>(null);
  const [featureRuns, setFeatureRuns] = useState<FeatureRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      const [suiteRes, featuresRes] = await Promise.all([
        getSuiteRun(id!),
        getFeatureRunsBySuite(id!)
      ]);
      setSuiteRun(suiteRes.data);
      setFeatureRuns(featuresRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!suiteRun) {
    return <div className="text-center py-12">Suite run not found</div>;
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate('/suite-runs')}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        Back to Test Runs
      </Button>

      <Card className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{suiteRun.name}</h1>
            <StatusBadge status={suiteRun.status} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <div>
            <p className="text-sm text-gray-500">Total Features</p>
            <p className="text-2xl font-bold text-gray-900">{suiteRun.summary.totalFeatures}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Features Passed</p>
            <p className="text-2xl font-bold text-green-600">{suiteRun.summary.featuresPassed}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Features Failed</p>
            <p className="text-2xl font-bold text-red-600">{suiteRun.summary.featuresFailed}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Duration</p>
            <p className="text-2xl font-bold text-gray-900">{formatDuration(suiteRun.durationMs)}</p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-start gap-3 mb-4">
            <Monitor className="text-gray-400 mt-1" size={20} />
            <div>
              <p className="text-sm font-medium text-gray-900">Environment</p>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <p><span className="font-medium">URL:</span> {suiteRun.environment.url}</p>
                <p><span className="font-medium">Browser:</span> {suiteRun.environment.browser}</p>
                <p><span className="font-medium">Viewport:</span> {suiteRun.environment.viewport}</p>
                <p><span className="font-medium">OS:</span> {suiteRun.environment.os}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6 mt-6">
          <p className="text-sm text-gray-500">Started: {formatDate(suiteRun.startTime)}</p>
          {suiteRun.endTime && (
            <p className="text-sm text-gray-500">Ended: {formatDate(suiteRun.endTime)}</p>
          )}
          <p className="text-sm text-gray-500">Triggered by: {suiteRun.triggeredBy}</p>
        </div>
      </Card>

      <h2 className="text-2xl font-bold text-gray-900 mb-6">Feature Runs</h2>

      <div className="space-y-4">
        {featureRuns.map((featureRun) => (
          <Card
            key={featureRun._id}
            hoverable
            onClick={() => navigate(`/feature-runs/${featureRun._id}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{featureRun.featureName}</h3>
                  <StatusBadge status={featureRun.status} />
                </div>
                <p className="text-sm text-gray-600">
                  Started: {formatDate(featureRun.startTime)}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

