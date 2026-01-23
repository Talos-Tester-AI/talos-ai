import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Calendar, Clock } from 'lucide-react';
import { getSuiteRuns } from '../api/client';
import type { SuiteRun } from '../types';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';

export const SuiteRunsPage = () => {
  const navigate = useNavigate();
  const [suiteRuns, setSuiteRuns] = useState<SuiteRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSuiteRuns();
  }, []);

  const loadSuiteRuns = async () => {
    try {
      const response = await getSuiteRuns();
      setSuiteRuns(response.data);
    } catch (error) {
      console.error('Failed to load suite runs:', error);
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

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Test Runs</h1>
      </div>

      {suiteRuns.length === 0 ? (
        <Card className="text-center py-12">
          <PlayCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No test runs yet</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {suiteRuns.map((run) => (
            <Card
              key={run._id}
              hoverable
              onClick={() => navigate(`/suite-runs/${run._id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{run.name}</h3>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="text-sm text-gray-600">Triggered by: {run.triggeredBy}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Features</p>
                  <p className="text-sm font-medium text-gray-900">
                    {run.summary.featuresPassed}/{run.summary.totalFeatures} passed
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tests</p>
                  <p className="text-sm font-medium text-gray-900">
                    {run.summary.testsPassed}/{run.summary.totalTests} passed
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Duration</p>
                  <p className="text-sm font-medium text-gray-900">{formatDuration(run.durationMs)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Environment</p>
                  <p className="text-sm font-medium text-gray-900">{run.environment.browser}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center">
                  <Calendar size={14} className="mr-1" />
                  {formatDate(run.startTime)}
                </div>
                {run.endTime && (
                  <div className="flex items-center">
                    <Clock size={14} className="mr-1" />
                    Ended: {formatDate(run.endTime)}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

