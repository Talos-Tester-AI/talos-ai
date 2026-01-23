import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Terminal, Trash2, Edit } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { LaunchConfiguration } from '../types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateProjectThunk } from '../store/slices/projectSlice';
import type { RootState } from '../store';

export const LaunchConfigListPage = () => {
    const { currentProject: project, loading } = useAppSelector((state: RootState) => state.project);
    const dispatch = useAppDispatch();
    const navigate = useNavigate();

    const handleDelete = async (configId: string) => {
        if (!project || !window.confirm('Are you sure you want to delete this configuration?')) return;

        try {
            const updatedConfigs = project.launchConfigurations?.filter((c: LaunchConfiguration) => c._id !== configId) || [];
            await dispatch(updateProjectThunk({
                id: project._id,
                data: { launchConfigurations: updatedConfigs }
            })).unwrap();
        } catch (error) {
            console.error('Failed to delete configuration:', error);
        }
    };

    if (loading && !project) return <div className="text-center py-12">Loading...</div>;
    if (!project) return <div className="text-center py-12">Project not found</div>;

    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/projects/${project._id}`)}
                >
                    <ArrowLeft size={16} className="mr-2" />
                    Back
                </Button>
                <h1 className="text-2xl font-bold text-gray-900 flex-1">Launch Configurations</h1>
                <Button onClick={() => navigate(`/projects/${project._id}/launch-configs/new`)}>
                    <Plus size={20} className="mr-2" />
                    Add Configuration
                </Button>
            </div>

            <div className="space-y-4">
                {!project.launchConfigurations || project.launchConfigurations.length === 0 ? (
                    <Card className="text-center py-12 bg-gray-50/50 border-dashed">
                        <div className="bg-indigo-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Terminal size={24} className="text-indigo-500" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-1">No launch configurations</h3>
                        <p className="text-gray-500 mb-4">Create a configuration to define how to run your tests.</p>
                        <Button onClick={() => navigate(`/projects/${project._id}/launch-configs/new`)}>
                            Create Configuration
                        </Button>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {project.launchConfigurations.map((config: LaunchConfiguration, index: number) => (
                            <Card key={config._id || index} className="flex justify-between items-center group">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-semibold text-gray-900">{config.name}</h3>
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 uppercase">
                                            {config.type}
                                        </span>
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                                            {config.request}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-500 font-mono">
                                        {config.program}
                                    </div>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => navigate(`/projects/${project._id}/launch-configs/${config._id}/edit`)}
                                    >
                                        <Edit size={16} />
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="text-red-600 hover:bg-red-50"
                                        onClick={() => handleDelete(config._id!)}
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
