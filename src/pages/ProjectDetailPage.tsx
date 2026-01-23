import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, List, Sparkles, Play, FolderOpen, Box, Terminal, Pencil, Check, X, Trash2, History } from 'lucide-react';
import { getFeaturesByProject, createFeature, deleteProject, browseDirectory } from '../api/client';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateProjectThunk } from '../store/slices/projectSlice';
import type { Project, Feature } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { Settings, Move } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableFeatureCardProps {
  feature: Feature;
  onClick: (feature: Feature) => void;
}

const SortableFeatureCard = ({ feature, onClick }: SortableFeatureCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: feature._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        hoverable
        onClick={() => onClick(feature)}
        className="group border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-200 relative h-full"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
            <Box size={20} className="text-indigo-600" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors pr-6">
          {feature.name}
        </h3>
        <p className="text-sm text-gray-500 line-clamp-2 mb-4 h-10">
          {feature.description}
        </p>

        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 p-1 hover:bg-gray-100 rounded"
        >
          <Move size={16} />
        </div>

        {feature.globalSetup && (
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 py-2 px-3 rounded-md">
            <Settings size={12} />
            <span className="font-medium">Has global setup</span>
          </div>
        )}
      </Card>
    </div>
  );
};

export const ProjectDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { currentProject: project, loading } = useAppSelector((state) => state.project);

  const [features, setFeatures] = useState<Feature[]>([]);
  // We still need local loading for features, or we can assume if project is loaded, we fetch features.
  const [featuresLoading, setFeaturesLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFeatures((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        // Persist order
        if (id) {
          import('../api/client').then(({ reorderFeatures }) => {
            reorderFeatures(id, newItems.map(i => i._id));
          });
        }

        return newItems;
      });
    }
  };

  // Feature Form Data
  const [formData, setFormData] = useState({
    projectId: id || '',
    name: '',
    description: '',
    globalSetup: { instruction: '', timeout: 30000 },
    globalTeardown: { instruction: '' }
  });

  // Project Config Form Data
  const [configData, setConfigData] = useState({
    baseUrl: '',
    systemContext: '',
    folderPath: '',
    figmaProjectUrl: '',
    figmaAccessToken: ''
  });

  // Sync edits when project loads
  useEffect(() => {
    if (project) {
      setEditingName(project.name);
      setConfigData({
        baseUrl: project.baseUrl || '',
        systemContext: project.systemContext || '',
        folderPath: project.folderPath || '',
        figmaProjectUrl: project.figmaProjectUrl || '',
        figmaAccessToken: project.figmaAccessToken || ''
      });
    }
  }, [project]);

  // Load Features only
  useEffect(() => {
    if (id) {
      loadFeatures();
    }
  }, [id]);

  const loadFeatures = async () => {
    try {
      const featuresRes = await getFeaturesByProject(id!);
      setFeatures(featuresRes.data);
    } catch (error) {
      console.error('Failed to load features:', error);
    } finally {
      setFeaturesLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createFeature(id!, formData);
      setIsModalOpen(false);
      setFormData({
        projectId: id || '',
        name: '',
        description: '',
        globalSetup: { instruction: '', timeout: 30000 },
        globalTeardown: { instruction: '' }
      });
      loadFeatures();
    } catch (error) {
      console.error('Failed to create feature:', error);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    try {
      await dispatch(updateProjectThunk({ id: project._id, data: configData })).unwrap();
      setIsSettingsModalOpen(false);
    } catch (error) {
      console.error('Failed to update project settings:', error);
    }
  };

  const handleBrowse = async () => {
    try {
      const res = await browseDirectory();
      if (res.data) {
        setConfigData(prev => ({ ...prev, folderPath: res.data || '' }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateTests = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    try {
      // Save the configuration before generating tests
      await dispatch(updateProjectThunk({ id: project._id, data: configData })).unwrap();

      // Navigate to analysis with config data
      setIsConfigModalOpen(false);
      setIsAnalyzing(true);
      navigate(`/projects/${id}/analyze`, { state: { configData } });
    } catch (error) {
      console.error('Failed to update project config before analysis:', error);
      // Fallback: Proceed with analysis anyway
      setIsConfigModalOpen(false);
      setIsAnalyzing(true);
      navigate(`/projects/${id}/analyze`, { state: { configData } });
    }
  };

  const handleAnalyzeProject = () => {
    if (!project) return;
    setIsConfigModalOpen(true);
  };

  const handleSaveName = async () => {
    if (!project || !editingName.trim()) return;

    try {
      await dispatch(updateProjectThunk({ id: project._id, data: { name: editingName } })).unwrap();
      setIsEditingName(false);
    } catch (error) {
      console.error('Failed to update project name:', error);
      setEditingName(project.name);
    }
  };

  const handleCancelName = () => {
    if (project) {
      setEditingName(project.name);
    }
    setIsEditingName(false);
  };

  if (loading && !project) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!project) {
    return <div className="text-center py-12">Project not found</div>;
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate('/')}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        Back to Projects
      </Button>

      <Card className="mb-8">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 mr-4">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="max-w-md text-2xl font-bold h-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') handleCancelName();
                  }}
                />
                <Button size="sm" onClick={handleSaveName} className="h-10 w-10 p-0">
                  <Check size={20} />
                </Button>
                <Button size="sm" variant="secondary" onClick={handleCancelName} className="h-10 w-10 p-0">
                  <X size={20} />
                </Button>
              </div>
            ) : (
              <div className="group flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-indigo-600"
                  title="Edit project name"
                >
                  <Pencil size={18} />
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setIsSettingsModalOpen(true)}>
              <Settings size={20} className="mr-2" />
              Settings
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/projects/${id}/launch-configs`)}>
              <Terminal size={20} className="mr-2" />
              Launch Configs
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/projects/${id}/runs`)}>
              <History size={20} className="mr-2" />
              Test History
            </Button>
            <Button onClick={() => navigate(`/projects/${id}/run`)}>
              <Play size={20} className="mr-2" />
              Run Tests
            </Button>
            <Button variant="secondary" onClick={handleAnalyzeProject} disabled={isAnalyzing}>
              <Sparkles size={20} className="mr-2" />
              {isAnalyzing ? 'Analyzing...' : 'AI Populate Tests'}
            </Button>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">Base URL:</span> {project.baseUrl}</p>
          <p><span className="font-medium">Folder Path:</span> {project.folderPath}</p>
          {project.figmaProjectUrl && (
            <p><span className="font-medium">Figma Project:</span> {project.figmaProjectUrl}</p>
          )}
          <p><span className="font-medium">System Context:</span> {project.systemContext}</p>
        </div>
      </Card>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Features</h2>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={20} className="mr-2" />
          New Feature
        </Button>
      </div>

      {features.length === 0 ? (
        <Card className="text-center py-16 bg-gray-50/50 border-dashed border-2">
          <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <List size={32} className="text-indigo-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No features created yet</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">Features help you organize your test cases into logical groups like "Authentication" or "Payments".</p>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={18} className="mr-2" />
            Create your first feature
          </Button>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={features.map(f => f._id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => (
                <SortableFeatureCard
                  key={feature._id}
                  feature={feature}
                  onClick={() => navigate(`/features/${feature._id}`)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}



      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Feature"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Feature Name"
            placeholder="Billing & Payments"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Textarea
            label="Description"
            placeholder="Subscription management and credit card processing"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            required
          />
          <Textarea
            label="Global Setup Instruction"
            placeholder="Ensure a test user exists..."
            value={formData.globalSetup.instruction}
            onChange={(e) => setFormData({
              ...formData,
              globalSetup: { ...formData.globalSetup, instruction: e.target.value }
            })}
            rows={2}
          />
          <Textarea
            label="Global Teardown Instruction"
            placeholder="Delete all temporary data..."
            value={formData.globalTeardown.instruction}
            onChange={(e) => setFormData({
              ...formData,
              globalTeardown: { instruction: e.target.value }
            })}
            rows={2}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create Feature</Button>
          </div>
        </form>
      </Modal>



      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title="Project Settings"
      >
        <form onSubmit={handleUpdateSettings} className="space-y-4">
          <Input
            label="Base URL"
            placeholder="https://staging.clouddashboard.com"
            value={configData.baseUrl}
            onChange={(e) => setConfigData({ ...configData, baseUrl: e.target.value })}
          />
          <Textarea
            label="System Context"
            placeholder="You are a QA Agent testing a React-based dashboard..."
            value={configData.systemContext}
            onChange={(e) => setConfigData({ ...configData, systemContext: e.target.value })}
            rows={4}
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Project Source Path</label>
            <div className="flex gap-2">
              <Input
                value={configData.folderPath}
                readOnly
                placeholder="Select a folder..."
                className="flex-1 bg-gray-50"
              />
              <Button type="button" variant="secondary" onClick={handleBrowse}>
                <FolderOpen size={18} />
              </Button>
            </div>
            <p className="text-xs text-gray-500">Absolute path to the source code of the application under test.</p>
          </div>
          <div className="flex justify-between gap-3 pt-4">
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setIsSettingsModalOpen(false); // Close settings modal
                setDeleteConfirmOpen(true);    // Open confirmation
              }}
            >
              <Trash2 size={16} className="mr-2" />
              Delete Project
            </Button>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsSettingsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save Settings</Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="AI Configuration"
      >
        <form onSubmit={handleGenerateTests} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Configure your project settings to enable AI test generation.
          </p>
          <Input
            label="Figma Project URL (Optional)"
            placeholder="https://www.figma.com/file/ABC123/MyDesign"
            value={configData.figmaProjectUrl}
            onChange={(e) => setConfigData({ ...configData, figmaProjectUrl: e.target.value })}
          />
          <Input
            label="Figma Access Token (Optional)"
            type="password"
            placeholder="figd_xxxxxxxxxxxxx"
            value={configData.figmaAccessToken}
            onChange={(e) => setConfigData({ ...configData, figmaAccessToken: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsConfigModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Generate Tests</Button>
          </div>
        </form>
      </Modal>


      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          if (project) {
            try {
              await deleteProject(project._id);
              navigate('/');
            } catch (error) {
              console.error('Failed to delete project:', error);
            }
          }
        }}
        title="Delete Project"
        message="Are you sure you want to delete this project? All features, test cases, and configurations will be permanently deleted. This action cannot be undone."
        confirmText="Delete Project"
        variant="danger"
      />
    </div >
  );
};

