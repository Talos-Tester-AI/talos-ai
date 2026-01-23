import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button';
import { TestRunList } from '../components/TestRunList';
import { Card } from '../components/Card';

export const ProjectRunsPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/projects/${id}`)}
                >
                    <ArrowLeft size={16} className="mr-2" />
                    Back to Project
                </Button>
                <h1 className="text-2xl font-bold text-gray-900">Test Run History</h1>
            </div>

            <Card>
                <TestRunList projectId={id!} />
            </Card>
        </div>
    );
};
