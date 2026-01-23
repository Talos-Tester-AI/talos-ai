import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { getFeaturesByProject, getTestCasesByFeature } from '../api/client';
import type { Feature, TestCase, SelectedTestCase } from '../types';

interface FeatureWithTestCases extends Feature {
  testCases: TestCase[];
  expanded: boolean;
  loading: boolean;
}

interface TestSelectorProps {
  projectId: string;
  scope: 'project' | 'features' | 'testcases';
  onScopeChange: (scope: 'project' | 'features' | 'testcases') => void;
  selectedFeatureIds: string[];
  selectedTestCases: SelectedTestCase[];
  onSelectionChange: (featureIds: string[], testCases: SelectedTestCase[]) => void;
}

export const TestSelector = ({
  projectId,
  scope,
  onScopeChange,
  selectedFeatureIds,
  selectedTestCases,
  onSelectionChange
}: TestSelectorProps) => {
  const [features, setFeatures] = useState<FeatureWithTestCases[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeatures();
  }, [projectId]);

  const loadFeatures = async () => {
    try {
      setLoading(true);
      const response = await getFeaturesByProject(projectId);
      setFeatures(response.data.map(f => ({
        ...f,
        testCases: [],
        expanded: false,
        loading: false
      })));
    } catch (error) {
      console.error('Failed to load features:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFeatureExpand = async (featureId: string) => {
    const feature = features.find(f => f._id === featureId);
    if (!feature) return;

    if (!feature.expanded && feature.testCases.length === 0) {
      // Load test cases
      setFeatures(prev => prev.map(f => 
        f._id === featureId ? { ...f, loading: true } : f
      ));

      try {
        const response = await getTestCasesByFeature(featureId);
        setFeatures(prev => prev.map(f => 
          f._id === featureId 
            ? { ...f, testCases: response.data, expanded: true, loading: false }
            : f
        ));
      } catch (error) {
        console.error('Failed to load test cases:', error);
        setFeatures(prev => prev.map(f => 
          f._id === featureId ? { ...f, loading: false } : f
        ));
      }
    } else {
      setFeatures(prev => prev.map(f => 
        f._id === featureId ? { ...f, expanded: !f.expanded } : f
      ));
    }
  };

  const isFeatureSelected = (featureId: string): 'all' | 'some' | 'none' => {
    if (scope === 'project') return 'all';
    if (scope === 'features') {
      return selectedFeatureIds.includes(featureId) ? 'all' : 'none';
    }
    // scope === 'testcases'
    const feature = features.find(f => f._id === featureId);
    const selection = selectedTestCases.find(s => s.featureId === featureId);
    
    if (!selection || selection.testCaseIds.length === 0) return 'none';
    if (feature && selection.testCaseIds.length === feature.testCases.length) return 'all';
    return 'some';
  };

  const isTestCaseSelected = (featureId: string, testCaseId: string): boolean => {
    if (scope === 'project') return true;
    if (scope === 'features') return selectedFeatureIds.includes(featureId);
    const selection = selectedTestCases.find(s => s.featureId === featureId);
    return selection?.testCaseIds.includes(testCaseId) ?? false;
  };

  const toggleFeature = (featureId: string) => {
    const currentState = isFeatureSelected(featureId);
    
    if (scope === 'features') {
      if (currentState === 'all') {
        onSelectionChange(
          selectedFeatureIds.filter(id => id !== featureId),
          selectedTestCases
        );
      } else {
        onSelectionChange(
          [...selectedFeatureIds, featureId],
          selectedTestCases
        );
      }
    } else if (scope === 'testcases') {
      const feature = features.find(f => f._id === featureId);
      if (!feature) return;

      if (currentState === 'all' || currentState === 'some') {
        // Deselect all test cases in this feature
        onSelectionChange(
          selectedFeatureIds,
          selectedTestCases.filter(s => s.featureId !== featureId)
        );
      } else {
        // Select all test cases in this feature
        const allTestCaseIds = feature.testCases.map(tc => tc._id);
        const newSelection = selectedTestCases.filter(s => s.featureId !== featureId);
        newSelection.push({ featureId, testCaseIds: allTestCaseIds });
        onSelectionChange(selectedFeatureIds, newSelection);
      }
    }
  };

  const toggleTestCase = (featureId: string, testCaseId: string) => {
    if (scope !== 'testcases') return;

    const selection = selectedTestCases.find(s => s.featureId === featureId);
    
    if (!selection) {
      // Add new selection
      onSelectionChange(
        selectedFeatureIds,
        [...selectedTestCases, { featureId, testCaseIds: [testCaseId] }]
      );
    } else if (selection.testCaseIds.includes(testCaseId)) {
      // Remove test case
      const newTestCaseIds = selection.testCaseIds.filter(id => id !== testCaseId);
      if (newTestCaseIds.length === 0) {
        onSelectionChange(
          selectedFeatureIds,
          selectedTestCases.filter(s => s.featureId !== featureId)
        );
      } else {
        onSelectionChange(
          selectedFeatureIds,
          selectedTestCases.map(s => 
            s.featureId === featureId 
              ? { ...s, testCaseIds: newTestCaseIds }
              : s
          )
        );
      }
    } else {
      // Add test case
      onSelectionChange(
        selectedFeatureIds,
        selectedTestCases.map(s => 
          s.featureId === featureId 
            ? { ...s, testCaseIds: [...s.testCaseIds, testCaseId] }
            : s
        )
      );
    }
  };

  const getCheckIcon = (state: 'all' | 'some' | 'none') => {
    if (state === 'all') return <CheckSquare size={18} className="text-blue-600" />;
    if (state === 'some') return <MinusSquare size={18} className="text-blue-400" />;
    return <Square size={18} className="text-gray-400" />;
  };

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading features...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Scope Selector */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
        <button
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            scope === 'project' 
              ? 'bg-white shadow text-blue-600' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => onScopeChange('project')}
        >
          Entire Project
        </button>
        <button
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            scope === 'features' 
              ? 'bg-white shadow text-blue-600' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => onScopeChange('features')}
        >
          Select Features
        </button>
        <button
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            scope === 'testcases' 
              ? 'bg-white shadow text-blue-600' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
          onClick={() => onScopeChange('testcases')}
        >
          Select Test Cases
        </button>
      </div>

      {/* Feature/Test Case Tree */}
      {scope !== 'project' && (
        <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
          {features.map(feature => (
            <div key={feature._id}>
              {/* Feature Row */}
              <div 
                className="flex items-center gap-2 p-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => scope === 'testcases' && toggleFeatureExpand(feature._id)}
              >
                {scope === 'testcases' && (
                  <button 
                    className="p-1 hover:bg-gray-200 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFeatureExpand(feature._id);
                    }}
                  >
                    {feature.loading ? (
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    ) : feature.expanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                )}
                
                <button
                  className="p-1 hover:bg-gray-200 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFeature(feature._id);
                  }}
                >
                  {getCheckIcon(isFeatureSelected(feature._id))}
                </button>
                
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{feature.name}</p>
                  <p className="text-sm text-gray-500">{feature.description}</p>
                </div>
              </div>

              {/* Test Cases */}
              {scope === 'testcases' && feature.expanded && (
                <div className="bg-gray-50 border-t">
                  {feature.testCases.length === 0 ? (
                    <p className="p-3 pl-12 text-sm text-gray-500">No test cases</p>
                  ) : (
                    feature.testCases.map(testCase => (
                      <div
                        key={testCase._id}
                        className="flex items-center gap-2 p-2 pl-12 hover:bg-gray-100 cursor-pointer"
                        onClick={() => toggleTestCase(feature._id, testCase._id)}
                      >
                        <button className="p-1">
                          {isTestCaseSelected(feature._id, testCase._id) ? (
                            <CheckSquare size={16} className="text-blue-600" />
                          ) : (
                            <Square size={16} className="text-gray-400" />
                          )}
                        </button>
                        <span className="text-sm text-gray-700">{testCase.title}</span>
                        <span className="text-xs text-gray-400">
                          ({testCase.steps.length} steps)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {scope === 'project' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-blue-800">
            All features and test cases in this project will be executed.
          </p>
        </div>
      )}
    </div>
  );
};

