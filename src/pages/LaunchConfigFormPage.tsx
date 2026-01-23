import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getProject, updateProject } from '../api/client';
import { Button } from '../components/Button';
import { LaunchConfigEditor } from '../components/LaunchConfigEditor';
import type { LaunchConfig } from '../components/LaunchConfigEditor';
import type { Project, LaunchConfiguration } from '../types';

export const LaunchConfigFormPage = () => {
    const { id, configId } = useParams<{ id: string; configId?: string }>();
    const navigate = useNavigate();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
        if (id) {
            loadData();
        }
    }, [id, configId]);

    const loadData = async () => {
        try {
            console.log('[Form] Loading project data...');
            const res = await getProject(id!);
            console.log('[Form] Project loaded:', res.data);
            setProject(res.data);

            if (configId) {
                console.log(`[Form] Finding config for ID: ${configId}`);
                if (res.data.launchConfigurations) {
                    const config = res.data.launchConfigurations.find(c => c._id === configId);
                    console.log('[Form] Found config:', config);

                    if (config) {
                        // Normalize data structure for Editor
                        let env: Record<string, string> = {};
                        if (config.env) {
                            if (config.env instanceof Map) {
                                config.env.forEach((v, k) => env[k] = String(v));
                            } else {
                                Object.entries(config.env).forEach(([k, v]) => env[k] = String(v));
                            }
                        }

                        const newForm = {
                            _id: config._id,
                            name: config.name || '',
                            type: config.type || 'node',
                            request: config.request || 'launch',
                            program: config.program || '',
                            cwd: config.cwd || '${workspaceFolder}',
                            args: config.args || [],
                            env: env,
                            options: config.options || {}
                        };
                        console.log('[Form] Setting formData to:', newForm);
                        setFormData(newForm);
                    } else {
                        console.warn('[Form] Config not found in project!');
                    }
                } else {
                    console.warn('[Form] Project has no launchConfigurations');
                }
            }
        } catch (error) {
            console.error('Failed to load project:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditorChange = (config: LaunchConfig) => {
        console.log('[Form] Config update received:', config);
        setFormData(config);
    };

    // Safe UUID generator
    const generateId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    };

    const handleSubmit = async () => {
        if (!project) return;

        // Cast back to application type if needed, or rely on compatibility
        const newConfig: LaunchConfiguration = {
            ...formData,
            env: formData.env // Ensure record is passed
        };

        // Debug logging
        console.log('Saving config:', newConfig);

        // Generate basic ID if new
        let updatedConfigs = [...(project.launchConfigurations || [])];

        if (configId) {
            updatedConfigs = updatedConfigs.map(c => c._id === configId ? { ...newConfig, _id: configId } : c);
        } else {
            const newId = generateId();
            console.log('[Form] Generated new ID:', newId);
            updatedConfigs.push({ ...newConfig, _id: newId });
        }

        console.log('[Form] Final configs list to save:', updatedConfigs);

        try {
            await updateProject(project._id, { launchConfigurations: updatedConfigs });
            console.log('[Form] Save successful, navigating...');
            navigate(`/projects/${id}/launch-configs`);
        } catch (error) {
            console.error('Failed to save configuration:', error);
            alert('Failed to save configuration. Check console for details.');
        }
    };

    if (loading) return <div className="text-center py-12">Loading...</div>;
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
