import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Save, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { getProject, createTestRun, createRunConfig, getRunConfigs } from '../api/client';
import type { Project, TestRunConfig, SelectedTestCase } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { TestSelector } from '../components/TestSelector';
import { AIConfigBanner, AIConfigWarningModal, useAIConfigCheck } from '../components/AIConfigWarning';
import { clsx } from 'clsx';

export const TestRunPage = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<TestRunConfig[]>([]);

  // Test run configuration
  const [scope, setScope] = useState<'project' | 'features' | 'testcases'>('project');
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [selectedTestCases, setSelectedTestCases] = useState<SelectedTestCase[]>([]);

  // Launch Configuration Selection
  const [selectedLaunchConfigIds, setSelectedLaunchConfigIds] = useState<string[]>([]);
  const [expandedLaunchConfigId, setExpandedLaunchConfigId] = useState<string | null>(null);

  // Save config modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [configName, setConfigName] = useState('');

  // AI Config warning
  const { isConfigured } = useAIConfigCheck();
  const [showAIWarning, setShowAIWarning] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectRes, configsRes] = await Promise.all([
        getProject(projectId!),
        getRunConfigs(projectId!)
      ]);
      setProject(projectRes.data);
      setSavedConfigs(configsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRun = async (skipWarning = false) => {
    if (!projectId) return;

    // Validate selection
    if (selectedLaunchConfigIds.length === 0) {
      alert("Please select at least one launch configuration.");
      return;
    }

    // Check AI config before starting
    if (!isConfigured && !skipWarning) {
      setShowAIWarning(true);
      return;
    }

    try {
      setStarting(true);

      const response = await createTestRun({
        projectId,
        scope,
        selectedFeatureIds: scope === 'features' ? selectedFeatureIds : undefined,
        selectedTestCases: scope === 'testcases' ? selectedTestCases : undefined,
        selectedLaunchConfigIds // Pass selected configs
      });

      // Navigate to live test run page
      navigate(`/test-runs/${response.data._id}`);
    } catch (error: any) {
      console.error('Failed to start test run:', error);
      alert(error.response?.data?.message || 'Failed to start test run');
    } finally {
      setStarting(false);
    }
  };

  const handleContinueWithoutConfig = () => {
    setShowAIWarning(false);
    handleStartRun(true);
  };

  const handleSaveConfig = async () => {
    if (!projectId || !configName.trim()) return;

    try {
      await createRunConfig(projectId, {
        name: configName,
        scope,
        selectedFeatureIds: scope === 'features' ? selectedFeatureIds : undefined,
        selectedTestCases: scope === 'testcases' ? selectedTestCases : undefined,
        selectedLaunchConfigIds
      });

      setShowSaveModal(false);
      setConfigName('');
      loadData();
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const loadConfig = (config: TestRunConfig) => {
    setScope(config.scope);
    setSelectedFeatureIds(config.selectedFeatureIds || []);
    setSelectedTestCases(config.selectedTestCases || []);
    setSelectedLaunchConfigIds(config.selectedLaunchConfigIds || []);
  };

  const handleSelectionChange = (featureIds: string[], testCases: SelectedTestCase[]) => {
    setSelectedFeatureIds(featureIds);
    setSelectedTestCases(testCases);
  };

  const toggleLaunchConfig = (id: string) => {
    setSelectedLaunchConfigIds(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (!project) return <div className="text-center py-12">Project not found</div>;

  const canStart = (scope === 'project' ||
    (scope === 'features' && selectedFeatureIds.length > 0) ||
    (scope === 'testcases' && selectedTestCases.length > 0)) &&
    selectedLaunchConfigIds.length > 0;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/projects/${projectId}`)}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        Back to Project
      </Button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Run Tests</h1>
        <div className="text-sm text-gray-500">{project.name}</div>
      </div>

      {/* AI Config Warning Banner */}
      <AIConfigBanner />

      {/* Saved Configurations */}
      {savedConfigs.length > 0 && (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Saved Configurations</h2>
          <div className="flex flex-wrap gap-2">
            {savedConfigs.map(config => (
              <button
                key={config._id}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                onClick={() => loadConfig(config)}
              >
                {config.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Launch Configuration Selection */}
      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Launch Configurations</h2>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/projects/${projectId}/launch-configs/new`)}>
            Create New
          </Button>
        </div>

        {!project.launchConfigurations || project.launchConfigurations.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border border-dashed rounded-lg text-gray-500">
            No launch configurations found. Please create one to run tests.
          </div>
        ) : (
          <div className="space-y-2">
            {project.launchConfigurations.map((config) => {
              const isSelected = selectedLaunchConfigIds.includes(config._id!);
              const isExpanded = expandedLaunchConfigId === config._id;

              return (
                <div
                  key={config._id}
                  className={clsx(
                    "border rounded-lg transition-all",
                    isSelected ? "border-blue-500 bg-blue-50/10" : "border-gray-200"
                  )}
                >
                  <div className="flex items-center p-3">
                    <button
                      onClick={() => toggleLaunchConfig(config._id!)}
                      className={clsx(
                        "w-5 h-5 rounded border flex items-center justify-center mr-3 transition-colors",
                        isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 hover:border-blue-400"
                      )}
                    >
                      {isSelected && <Check size={12} />}
                    </button>

                    <div className="flex-1 cursor-pointer" onClick={() => toggleLaunchConfig(config._id!)}>
                      <div className="font-medium text-gray-900">{config.name}</div>
                      <div className="text-xs text-gray-500">
                        {config.type} • {config.program}
                      </div>
                    </div>

                    <button
                      onClick={() => setExpandedLaunchConfigId(isExpanded ? null : config._id!)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500"
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 text-sm text-gray-600 border-t border-gray-100 bg-gray-50/50 rounded-b-lg ml-[2.75rem] pl-4">
                      <div className="pt-2 grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-semibold text-xs uppercase tracking-wider text-gray-400">Environment</span>
                          {config.env && Object.keys(config.env).length > 0 ? (
                            <ul className="mt-1 space-y-1 font-mono text-xs">
                              {Object.entries(config.env).map(([k, v]) => (
                                <li key={k}>{k}={String(v).startsWith('${{') ? '********' : String(v)}</li>
                              ))}
                            </ul>
                          ) : <div className="text-xs italic mt-1">None</div>}
                        </div>
                        <div>
                          <span className="font-semibold text-xs uppercase tracking-wider text-gray-400">Args</span>
                          {config.args && config.args.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {config.args.map((a, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">{a}</span>
                              ))}
                            </div>
                          ) : <div className="text-xs italic mt-1">None</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Test Selection */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Select Tests to Run</h2>
        <TestSelector
          projectId={projectId!}
          scope={scope}
          onScopeChange={setScope}
          selectedFeatureIds={selectedFeatureIds}
          selectedTestCases={selectedTestCases}
          onSelectionChange={handleSelectionChange}
        />
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center bg-white p-4 sticky bottom-0 border-t mt-8 shadow-lg">
        <Button
          variant="secondary"
          onClick={() => setShowSaveModal(true)}
          disabled={!canStart}
        >
          <Save size={18} className="mr-2" />
          Save Configuration
        </Button>

        <div className="text-sm text-gray-500">
          {selectedLaunchConfigIds.length} configuration(s) selected
        </div>

        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={handleStartRun}
            disabled={!canStart || starting}
            className="px-8 shadow-xl"
          >
            <Play size={18} className="mr-2" />
            {starting ? 'Starting...' : 'Start Test Run'}
          </Button>
          {!starting && !canStart && selectedLaunchConfigIds.length === 0 && (
            <span className="text-xs text-red-500 font-medium select-none">
              Select a launch configuration first
            </span>
          )}
        </div>
      </div>

      {/* Save Config Modal */}
      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Save Configuration"
      >
        <div className="space-y-4">
          <Input
            label="Configuration Name"
            placeholder="e.g., Smoke Tests on Chrome"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowSaveModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={!configName.trim()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* AI Config Warning Modal */}
      <AIConfigWarningModal
        isOpen={showAIWarning}
        onClose={() => setShowAIWarning(false)}
        onContinue={handleContinueWithoutConfig}
        title="AI Configuration Missing"
        message="Running tests uses AI for step execution and validation. Configure your AI provider for best results, or continue anyway."
      />
    </div>
  );
};

