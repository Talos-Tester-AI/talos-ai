import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Smartphone, ChevronRight, Activity } from 'lucide-react';
import { getTestRuns } from '../api/client';
import type { TestRun } from '../types';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';


interface TestRunListProps {
    projectId: string;
}

export const TestRunList = ({ projectId }: TestRunListProps) => {
    const navigate = useNavigate();
    const [testRuns, setTestRuns] = useState<TestRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        setTestRuns([]);
        setPage(1);
        setHasMore(true);
        loadTestRuns(1, true);
    }, [projectId]);

    const loadTestRuns = async (pageNum: number, isInitial: boolean) => {
        try {
            if (isInitial) setLoading(true);
            else setLoadingMore(true);

            const response = await getTestRuns(projectId, pageNum, 20);
            // Handle both new paginated format and potentially old format (though backend is updated)
            const newRuns = response.data.data || response.data;
            const pagination = response.data.pagination;

            setTestRuns(prev => isInitial ? newRuns : [...prev, ...newRuns]);

            if (pagination) {
                setHasMore(pagination.page < pagination.pages);
            } else {
                setHasMore(false);
            }

            // Restore scroll position only on initial load
            if (isInitial) {
                const savedScroll = sessionStorage.getItem(`testRunListScroll_${projectId}`);
                if (savedScroll) {
                    setTimeout(() => {
                        window.scrollTo(0, parseInt(savedScroll));
                        sessionStorage.removeItem(`testRunListScroll_${projectId}`);
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Failed to load test runs:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleScroll = () => {
        if (
            window.innerHeight + document.documentElement.scrollTop
            !== document.documentElement.offsetHeight
            || loading || loadingMore || !hasMore
        ) {
            return;
        }
        const nextPage = page + 1;
        setPage(nextPage);
        loadTestRuns(nextPage, false);
    };

    useEffect(() => {
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [loading, loadingMore, hasMore, page]);

    if (loading && page === 1) {
        return <div className="text-center py-8 text-gray-500">Loading test runs...</div>;
    }

    if (testRuns.length === 0 && !loading) {
        return (
            <Card className="text-center py-8 bg-gray-50/50 border-dashed">
                <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Activity size={24} className="text-gray-400" />
                </div>
                <p className="text-gray-500">No test runs found.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {testRuns.map((run) => (
                <Card
                    key={run._id}
                    hoverable
                    onClick={() => {
                        sessionStorage.setItem(`testRunListScroll_${projectId}`, window.scrollY.toString());
                        navigate(`/test-runs/${run._id}`);
                    }}
                    className="group cursor-pointer transition-all duration-200 hover:border-indigo-200"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <StatusBadge status={run.status} />

                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-gray-900">
                                        Run #{run._id?.slice(-6).toUpperCase()}
                                    </span>
                                    {run.launchConfiguration?.name && (
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                                            {run.launchConfiguration.name}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                    <div className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(run.createdAt!).toLocaleString()}
                                    </div>
                                    {run.deviceInfo && (
                                        <div className="flex items-center gap-1">
                                            <Smartphone size={12} />
                                            {run.deviceInfo.model}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="text-right hidden sm:block">
                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                                    Progress
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="text-green-600 font-medium">{run.summary.passedSteps} pass</span>
                                    <span className="text-gray-300">|</span>
                                    <span className="text-red-500 font-medium">{run.summary.failedSteps} fail</span>
                                </div>
                            </div>

                            <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-400" />
                        </div>
                    </div>
                </Card>
            ))}
            {loadingMore && (
                <div className="text-center py-4 text-gray-500 text-sm">
                    Loading more...
                </div>
            )}
        </div>
    );
};
