import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, FolderInput } from 'lucide-react';
import { selectProjectFolder, browseDirectory } from '../api/client';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProjects, createProjectThunk, fetchProject } from '../store/slices/projectSlice';

export const ProjectsPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  
  // Read from Redux state
  const { projects, loading } = useAppSelector(state => state.project);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    systemContext: '',
    folderPath: ''
  });

  useEffect(() => {
    // Load projects from persistent storage into Redux
    dispatch(fetchProjects());
  }, [dispatch]);

  const handleBrowse = async () => {
    try {
      const res = await browseDirectory();
      if (res.data) {
        setFormData(prev => ({ ...prev, folderPath: res.data || '' }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.folderPath) {
      alert("Please select a folder");
      return;
    }
    try {
      // Create project (saves to storage + loads into Redux)
      const result = await dispatch(createProjectThunk(formData)).unwrap();
      
      // Close modal and navigate to project page
      setIsModalOpen(false);
      setFormData({ name: '', baseUrl: '', systemContext: '', folderPath: '' });
      navigate(`/projects/${result._id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project');
    }
  };

  const handleOpenProject = async () => {
    try {
      console.log('[ProjectsPage] Opening project via dialog...');
      const response = await selectProjectFolder();
      console.log('[ProjectsPage] Dialog response:', response);
      
      if (response.data) {
        const projectId = response.data._id;
        console.log('[ProjectsPage] Project selected:', projectId);
        
        // IMMEDIATELY LOAD THE ENTIRE PROJECT INTO REDUX - WAIT FOR IT!
        console.log('[ProjectsPage] LOADING PROJECT INTO REDUX WITH ALL DATA');
        await dispatch(fetchProjects()).unwrap();
        await dispatch(fetchProject(projectId)).unwrap();
        console.log('[ProjectsPage] Redux loaded, now navigating');
        
        // Now navigate
        navigate(`/projects/${projectId}`);
      } else {
        console.log('[ProjectsPage] No project selected (user cancelled)');
      }
    } catch (error) {
      console.error('Failed to open project:', error);
      alert(`Failed to open project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={20} className="mr-2" />
          New Project
        </Button>
        <Button onClick={handleOpenProject} variant="secondary" className="ml-2">
          <FolderInput size={20} className="mr-2" />
          Open Folder
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <FolderOpen size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 mb-4">No projects yet</p>
          <div className="flex justify-center gap-4">
            <Button onClick={() => setIsModalOpen(true)}>Create your first project</Button>
            <Button onClick={handleOpenProject} variant="secondary">Open Existing Folder</Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card
              key={project._id}
              hoverable
              onClick={async () => {
                console.log('[ProjectsPage] LOADING PROJECT INTO REDUX:', project._id);
                await dispatch(fetchProject(project._id)).unwrap();
                console.log('[ProjectsPage] Redux loaded, navigating');
                navigate(`/projects/${project._id}`);
              }}
            >
              <div className="flex items-start mb-3">
                <FolderOpen className="text-blue-600 mr-3 flex-shrink-0" size={24} />
                <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">{project.baseUrl}</p>
              <p className="text-sm text-gray-500 line-clamp-2">{project.systemContext}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Project"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="CloudDashboard Web App"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Project Location *</label>
            <div className="flex gap-2">
              <Input
                value={formData.folderPath}
                readOnly
                placeholder="Select a folder..."
                className="flex-1 bg-gray-50"
                required
              />
              <Button type="button" variant="secondary" onClick={handleBrowse}>
                Browse
              </Button>
            </div>
          </div>

          <Input
            label="Base URL (Optional)"
            placeholder="https://staging.clouddashboard.com"
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          />
          <Textarea
            label="System Context (Optional)"
            placeholder="You are a QA Agent testing a React-based dashboard..."
            value={formData.systemContext}
            onChange={(e) => setFormData({ ...formData, systemContext: e.target.value })}
            rows={4}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create Project</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
