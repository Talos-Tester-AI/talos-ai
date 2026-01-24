import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button';
import { LaunchConfigEditor } from '../components/LaunchConfigEditor';
import type { LaunchConfig } from '../components/LaunchConfigEditor';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { createLaunchConfigThunk, updateLaunchConfigThunk } from '../store/slices/projectSlice';
import type { RootState } from '../store';

export const LaunchConfigFormPage = () => {
    const { id, configId } = useParams<{ id: string; configId?: string }>();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    
    // GET DATA FROM REDUX - NO API CALLS!
    const { currentProject: project, loading } = useAppSelector((state: RootState) => state.project);
    
    const [formData, setFormData] = useState<LaunchConfig>({
        name: '',
        type: 'node',
        request: 'launch',
        program: '',
        cwd: '${workspaceFolder}',
        args: [],
        env: {},
        options: {}
    });

    // Initialize form data from Redux when editing existing config
    useEffect(() => {
        if (configId && project?.launchConfigurations) {
            console.log('[Form] Finding config for ID from Redux:', configId);
            const config = project.launchConfigurations.find(c => c._id === configId);
            
            if (config) {
                console.log('[Form] Found config in Redux:', config);
                
                // Normalize data structure for Editor
                let env: Record<string, string> = {};
                if (config.env) {
                    if (config.env instanceof Map) {
                        config.env.forEach((v, k) => env[k] = String(v));
                    } else {
                        Object.entries(config.env).forEach(([k, v]) => env[k] = String(v));
                    }
                }

                setFormData({
                    _id: config._id,
                    name: config.name || '',
                    type: config.type || 'node',
                    request: config.request || 'launch',
                    program: config.program || '',
                    cwd: config.cwd || '${workspaceFolder}',
                    args: config.args || [],
                    env: env,
                    options: config.options || {}
                });
            } else {
                console.warn('[Form] Config not found in Redux!');
            }
        }
    }, [configId, project?.launchConfigurations]);

    const handleEditorChange = (config: LaunchConfig) => {
        console.log('[Form] Config update received:', config);
        setFormData(config);
    };

    const handleSubmit = async () => {
        if (!project) return;

        console.log('[Form] Saving config via REDUX');

        try {
            if (configId) {
                // UPDATE existing config via Redux
                console.log('[Form] Updating existing config:', configId);
                await dispatch(updateLaunchConfigThunk({
                    projectId: project._id,
                    configId,
                    data: formData
                })).unwrap();
            } else {
                // CREATE new config via Redux
                console.log('[Form] Creating new config');
                await dispatch(createLaunchConfigThunk({
                    projectId: project._id,
                    data: formData
                })).unwrap();
            }
            
            console.log('[Form] Save successful, navigating...');
            navigate(`/projects/${id}/launch-configs`);
        } catch (error) {
            console.error('Failed to save configuration:', error);
            alert('Failed to save configuration. Check console for details.');
        }
    };

    if (loading && !project) return <div className="text-center py-12">Loading...</div>;
    if (!project) return <div className="text-center py-12">Project not found</div>;

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <div className="flex items-center gap-4 mb-6 pt-6">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/projects/${id}/launch-configs`)}
                >
                    <ArrowLeft size={16} className="mr-2" />
                    Back
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900">
                        {configId ? 'Edit Configuration' : 'New Configuration'}
                    </h1>
                </div>
                <Button onClick={handleSubmit}>
                    Save Configuration
                </Button>
            </div>

            <LaunchConfigEditor
                config={formData}
                onChange={handleEditorChange}
            />
        </div>
    );
};
