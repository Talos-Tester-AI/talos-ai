import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, FlaskConical, ClipboardList, Play, CheckCircle2, Pencil, Save, X, Trash2, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import { reorderTestCases } from '../api/client';
import type { TestCase } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { ImageUpload } from '../components/ImageUpload';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateTestCaseThunk, createTestCaseThunk, deleteTestCaseThunk, updateFeatureThunk, deleteFeatureThunk } from '../store/slices/projectSlice';

interface TestCaseFormData {
  _id?: string;
  featureId: string;
  title: string;
  localSetup: { instruction: string };
  steps: {
    order: number;
    instruction: string;
    expectedImage: string;
    expectedResult: string;
    waitTimeMs: number;
  }[];
  localTeardown: { instruction: string };
}

interface SortableTestCaseCardProps {
  testCase: TestCase;
  onClick: (testCase: TestCase) => void;
}

const SortableTestCaseCard = ({ testCase, onClick }: SortableTestCaseCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: testCase._id });

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
        onClick={() => onClick(testCase)}
        className="group border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-200 h-full relative"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
            <FlaskConical size={20} className="text-indigo-600" />
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 py-1 px-2 rounded-full">
            <ClipboardList size={12} />
            <span>{testCase.steps.length} steps</span>
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2 pr-6">
          {testCase.title}
        </h3>
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 p-1 hover:bg-gray-100 rounded"
        >
          <Move size={16} />
        </div>
      </Card>
    </div>
  );
};

interface SortableStepRowProps {
  id: string;
  step: any;
  index: number;
  editingStepIndex: number | null;
  setEditingStepIndex: (index: number | null) => void;
  selectedTestCase: TestCase;
  stepFormData: any;
  setStepFormData: (data: any) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  setStepToDelete: (index: number | null) => void;
  setModalImage: (image: any) => void;
  handleSaveStep: (index: number) => void;
  onAddStepAbove: () => void;
  onAddStepBelow: () => void;
}

const SortableStepRow = ({
  id,
  step,
  index,
  editingStepIndex,
  setEditingStepIndex,
  selectedTestCase,
  stepFormData,
  setStepFormData,
  setDeleteConfirmOpen,
  setStepToDelete,
  setModalImage,
  handleSaveStep,
  onAddStepAbove,
  onAddStepBelow
}: SortableStepRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as 'relative',
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="group/row mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-200 transition-colors relative">
      {/* Add Step Buttons Overlay */}
      {editingStepIndex !== index && (
        <>
          {/* Top Button */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddStepAbove();
              }}
              className="bg-indigo-600 text-white rounded-full p-1 shadow-sm hover:scale-110 transition-transform"
              title="Add step above"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Bottom Button */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddStepBelow();
              }}
              className="bg-indigo-600 text-white rounded-full p-1 shadow-sm hover:scale-110 transition-transform"
              title="Add step below"
            >
              <Plus size={14} />
            </button>
          </div>
        </>
      )}

      {editingStepIndex === index ? (
        // Inline Edit Mode
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              {step.order}
            </div>
            <h4 className="text-sm font-semibold text-gray-900">Editing Step</h4>
          </div>
          <Input
            placeholder="Instruction"
            value={stepFormData.instruction}
            onChange={(e) => setStepFormData({ ...stepFormData, instruction: e.target.value })}
          />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Expected Image (Optional)</label>
            <ImageUpload
              projectId={selectedTestCase.featureId || ''} // Note: This might need adjustment if featureId is not populated fully, but usually it is ID string
              value={stepFormData.expectedImage}
              onChange={(imageId) => setStepFormData({ ...stepFormData, expectedImage: imageId })}
            />
          </div>
          <Input
            placeholder="Expected Result (optional)"
            value={stepFormData.expectedResult}
            onChange={(e) => setStepFormData({ ...stepFormData, expectedResult: e.target.value })}
          />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Wait Time - Time to wait for UI to settle after this step</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={stepFormData.waitTimeMs || 0}
                onChange={(e) => setStepFormData({ ...stepFormData, waitTimeMs: parseInt(e.target.value) || 0 })}
                className="w-32"
              />
              <span className="text-sm text-gray-500 font-medium">ms</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditingStepIndex(null)}
            >
              <X size={14} className="mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleSaveStep(index)}
            >
              <Save size={14} className="mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        // View Mode
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 p-1 rounded hover:bg-gray-200"
              >
                <Move size={14} />
              </div>
              <div className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                {step.order}
              </div>
              <h4 className="text-sm font-semibold text-gray-900">Step Action</h4>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <button
                onClick={() => {
                  setStepFormData({
                    instruction: step.instruction,
                    expectedImage: step.expectedImage || '',
                    expectedResult: step.expectedResult || '',
                    waitTimeMs: step.waitTimeMs || 0
                  });
                  setEditingStepIndex(index);
                }}
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title="Edit step"
              >
                <Pencil size={14} />
              </button>
              {selectedTestCase.steps.length > 1 && (
                <button
                  onClick={() => {
                    setStepToDelete(index);
                    setDeleteConfirmOpen(true);
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Delete step"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="pl-8 space-y-3">
            <div className="flex items-start gap-3">
              <Play size={16} className="text-indigo-500 mt-1 shrink-0" />
              <p className="text-sm text-gray-700 leading-relaxed">{step.instruction}</p>
            </div>

            {step.expectedImage && (
              <button
                onClick={() => setModalImage({ src: `/api/images/${step.expectedImage}`, name: `Step ${step.order} Expected Image` })}
                className="mt-2 group relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50 max-w-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer"
                title="Click to view full size"
              >
                <img
                  src={`/api/images/${step.expectedImage}`}
                  alt="Expected result"
                  className="w-full h-auto object-contain"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-medium drop-shadow bg-black/50 px-2 py-1 rounded">Click to enlarge</span>
                </div>
              </button>
            )}

            {step.expectedResult && (
              <div className="flex items-start gap-3 bg-green-50/50 p-2 rounded-lg -ml-2">
                <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-700">{step.expectedResult}</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium">Wait Time:</span>
              <span>{step.waitTimeMs || 0} ms</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const FeatureDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  
  // GET DATA FROM REDUX - NO IPC CALLS!
  const { features, testCases: allTestCases, loading } = useAppSelector((state) => state.project);
  
  console.log('[FeatureDetailPage] Looking for feature ID:', id);
  console.log('[FeatureDetailPage] Redux has', features.length, 'features:', features.map(f => f._id));
  
  const feature = features.find(f => f._id === id) || null;
  const testCases = allTestCases.filter(tc => tc.featureId === id);
  
  if (!feature && id) {
    console.error('[FeatureDetailPage] FEATURE NOT FOUND IN REDUX');
    console.error('[FeatureDetailPage] Searching for:', id);
    console.error('[FeatureDetailPage] Available features:', features);
  }
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);

  // Inline step editing state
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [stepFormData, setStepFormData] = useState<{
    instruction: string;
    expectedImage: string;
    expectedResult: string;
    waitTimeMs: number;
  }>({ instruction: '', expectedImage: '', expectedResult: '', waitTimeMs: 0 });

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<number | null>(null);

  // Feature Deletion State
  const [featureDeleteConfirmOpen, setFeatureDeleteConfirmOpen] = useState(false);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleFormData, setTitleFormData] = useState('');

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Image modal state for viewing full-size images with zoom/pan
  const [modalImage, setModalImage] = useState<{ src: string; name: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id !== over.id) {
      // Check if we are reordering TestCases (IDs are strings, DB _ids)
      // or Steps (Active ID might be "step-x")

      const activeId = String(active.id);
      const overId = String(over.id);

      const isStepReorder = activeId.startsWith('step-') && overId.startsWith('step-');

      if (isStepReorder && selectedTestCase) {
        // Reordering steps within a test case
        const oldIndex = parseInt(activeId.replace('step-', ''));
        const newIndex = parseInt(overId.replace('step-', ''));

        if (isNaN(oldIndex) || isNaN(newIndex)) return;

        const newSteps = arrayMove(selectedTestCase.steps, oldIndex, newIndex).map((step, idx) => ({
          ...step,
          order: idx + 1
        }));

        // Optimistic update
        setSelectedTestCase({ ...selectedTestCase, steps: newSteps });

        // Persist via Redux
        try {
          await dispatch(updateTestCaseThunk({ 
            id: selectedTestCase._id, 
            data: { steps: newSteps } 
          })).unwrap();
        } catch (error) {
          console.error('Failed to reorder steps:', error);
          // Revert on error could be implemented here
        }

      } else if (!activeId.startsWith('step-') && !overId.startsWith('step-')) {
        // Reordering Test Cases on the main page
        const oldIndex = testCases.findIndex((item) => item._id === active.id);
        const newIndex = testCases.findIndex((item) => item._id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(testCases, oldIndex, newIndex);

          // Persist order (just reordering, no Redux update needed - it's display order only)
          if (feature) {
            reorderTestCases(feature._id, newItems.map((i) => i._id));
          }
        }
      }
    }
  };

  const handleTitleSave = async () => {
    if (!selectedTestCase || !titleFormData.trim()) return;
    try {
      console.log('[FeatureDetailPage] Updating title via REDUX');
      await dispatch(updateTestCaseThunk({ 
        id: selectedTestCase._id, 
        data: { title: titleFormData } 
      })).unwrap();
      setSelectedTestCase({ ...selectedTestCase, title: titleFormData });
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  // Feature Edit State
  const [isEditingFeature, setIsEditingFeature] = useState(false);
  const [featureFormData, setFeatureFormData] = useState({
    name: '',
    description: '',
    globalSetup: '',
    globalSetupWaitTimeMs: 0,
    globalTeardown: '',
    globalTeardownWaitTimeMs: 0
  });

  // Test Case Form State
  const [formData, setFormData] = useState<TestCaseFormData>({
    featureId: id || '',
    title: '',
    localSetup: { instruction: '' },
    steps: [{ order: 1, instruction: '', expectedImage: '', expectedResult: '', waitTimeMs: 0 }],
    localTeardown: { instruction: '' }
  });

  useEffect(() => {
    // Initialize feature form data from Redux
    if (feature) {
      console.log('[FeatureDetailPage] Feature loaded from Redux:', feature.name);
      setFeatureFormData({
        name: feature.name,
        description: feature.description || '',
        globalSetup: feature.globalSetup?.instruction || '',
        globalSetupWaitTimeMs: feature.globalSetup?.waitTimeMs || 0,
        globalTeardown: feature.globalTeardown?.instruction || '',
        globalTeardownWaitTimeMs: feature.globalTeardown?.waitTimeMs || 0
      });
    } else if (id && id !== 'undefined') {
      console.warn('[FeatureDetailPage] Feature not found in Redux for ID:', id);
    }
  }, [feature, id]);

  const handleFeatureUpdate = async () => {
    if (!feature) return;

    try {
      console.log('[FeatureDetailPage] Updating feature via REDUX');
      // UPDATE VIA REDUX
      await dispatch(updateFeatureThunk({
        id: feature._id,
        data: {
          name: featureFormData.name,
          description: featureFormData.description,
          globalSetup: featureFormData.globalSetup ? {
            instruction: featureFormData.globalSetup,
            waitTimeMs: featureFormData.globalSetupWaitTimeMs
          } : null as any,
          globalTeardown: featureFormData.globalTeardown ? {
            instruction: featureFormData.globalTeardown,
            waitTimeMs: featureFormData.globalTeardownWaitTimeMs
          } : null as any
        }
      })).unwrap();
      setIsEditingFeature(false);
    } catch (error) {
      console.error('Failed to update feature:', error);
    }
  };

  const handleTestCaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Sanitize data: remove empty strings for optional ObjectId fields and empty setup/teardown
      const sanitizedData = {
        ...formData,
        localSetup: formData.localSetup?.instruction ? formData.localSetup : undefined,
        localTeardown: formData.localTeardown?.instruction ? formData.localTeardown : undefined,
        steps: formData.steps.map(step => ({
          ...step,
          expectedImage: step.expectedImage || undefined
        }))
      };

      if (formData._id) {
        console.log('[FeatureDetailPage] Updating test case via REDUX');
        await dispatch(updateTestCaseThunk({ 
          id: formData._id, 
          data: sanitizedData 
        })).unwrap();
      } else {
        console.log('[FeatureDetailPage] Creating test case via REDUX');
        await dispatch(createTestCaseThunk({ 
          featureId: id!, 
          data: sanitizedData 
        })).unwrap();
      }
      setIsModalOpen(false);
      resetFormData();
    } catch (error: any) {
      console.error('Failed to save test case:', error);
      setSubmitError(error.response?.data?.message || error.message || 'Failed to save test case');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTestCase = async (testCaseId: string) => {
    if (!confirm('Are you sure you want to delete this test case?')) return;
    try {
      console.log('[FeatureDetailPage] Deleting test case via REDUX');
      await dispatch(deleteTestCaseThunk(testCaseId)).unwrap();
      setSelectedTestCase(null);
    } catch (error) {
      console.error('Failed to delete test case:', error);
    }
  };

  const resetFormData = () => {
    setFormData({
      featureId: id || '',
      title: '',
      localSetup: { instruction: '' },
      steps: [{ order: 1, instruction: '', expectedImage: '', expectedResult: '', waitTimeMs: 0 }],
      localTeardown: { instruction: '' }
    });
  };

  const addStep = () => {
    setFormData({
      ...formData,
      steps: [...formData.steps, {
        order: formData.steps.length + 1,
        instruction: '',
        expectedImage: '',
        expectedResult: '',
        waitTimeMs: 0
      }]
    });
  };

  const removeStep = (index: number) => {
    const newSteps = formData.steps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      order: i + 1
    }));
    setFormData({ ...formData, steps: newSteps });
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!feature) {
    return <div className="text-center py-12">Feature not found</div>;
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/projects/${feature.projectId}`)}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        Back to Project
      </Button>

      <Card className="mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{feature.name}</h1>
            <p className="text-gray-700">{feature.description}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsEditingFeature(!isEditingFeature)}
          >
            {isEditingFeature ? <X size={16} /> : <Pencil size={16} />}
            <span className="ml-2">{isEditingFeature ? 'Cancel' : 'Edit Details'}</span>
          </Button>
        </div>

        {isEditingFeature ? (
          <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <Input
              label="Feature Name"
              value={featureFormData.name}
              onChange={(e) => setFeatureFormData({ ...featureFormData, name: e.target.value })}
            />
            <Textarea
              label="Description"
              value={featureFormData.description}
              onChange={(e) => setFeatureFormData({ ...featureFormData, description: e.target.value })}
              rows={2}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Textarea
                label="Global Setup"
                placeholder="e.g. Login as admin..."
                value={featureFormData.globalSetup}
                onChange={(e) => setFeatureFormData({ ...featureFormData, globalSetup: e.target.value })}
              />
              <Textarea
                label="Global Teardown"
                placeholder="e.g. Cleardown database..."
                value={featureFormData.globalTeardown}
                onChange={(e) => setFeatureFormData({ ...featureFormData, globalTeardown: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Global Setup Wait Time (ms)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={featureFormData.globalSetupWaitTimeMs}
                  onChange={(e) => setFeatureFormData({ ...featureFormData, globalSetupWaitTimeMs: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Global Teardown Wait Time (ms)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={featureFormData.globalTeardownWaitTimeMs}
                  onChange={(e) => setFeatureFormData({ ...featureFormData, globalTeardownWaitTimeMs: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setFeatureDeleteConfirmOpen(true)}
              >
                <Trash2 size={16} className="mr-2" />
                Delete Feature
              </Button>
              <Button size="sm" onClick={handleFeatureUpdate}>
                <Save size={16} className="mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feature.globalSetup && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Global Setup</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{feature.globalSetup.instruction}</p>
                {feature.globalSetup.waitTimeMs ? (
                  <p className="text-xs text-gray-500 mt-2">Wait Time: {feature.globalSetup.waitTimeMs}ms</p>
                ) : null}
              </div>
            )}
            {feature.globalTeardown && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Global Teardown</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{feature.globalTeardown.instruction}</p>
                {feature.globalTeardown.waitTimeMs ? (
                  <p className="text-xs text-gray-500 mt-2">Wait Time: {feature.globalTeardown.waitTimeMs}ms</p>
                ) : null}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Test Cases</h2>
        <Button onClick={() => {
          resetFormData();
          setIsModalOpen(true);
        }}>
          <Plus size={20} className="mr-2" />
          New Test Case
        </Button>
      </div>

      {testCases.length === 0 ? (
        <Card className="text-center py-16 bg-gray-50/50 border-dashed border-2">
          <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FlaskConical size={32} className="text-indigo-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No test cases yet</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">Test cases define the specific scenarios to be tested within this feature.</p>
          <Button onClick={() => {
            resetFormData();
            setIsModalOpen(true);
          }}>
            <Plus size={18} className="mr-2" />
            Create your first test case
          </Button>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={testCases.map(tc => tc._id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testCases.map((testCase) => (
                <SortableTestCaseCard
                  key={testCase._id}
                  testCase={testCase}
                  onClick={setSelectedTestCase}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetFormData();
        }}
        title={formData._id ? "Edit Test Case" : "Create New Test Case"}
      >
        <form onSubmit={handleTestCaseSubmit} className="space-y-4">
          {submitError && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <X size={20} className="text-red-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    {submitError}
                  </p>
                </div>
              </div>
            </div>
          )}
          <Input
            label="Test Title"
            placeholder="Update billing address"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
            disabled={isSubmitting}
          />
          <Textarea
            label="Local Setup"
            placeholder="Navigate to billing settings..."
            value={formData.localSetup.instruction}
            onChange={(e) => setFormData({
              ...formData,
              localSetup: { instruction: e.target.value }
            })}
            rows={2}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Steps</label>
            {formData.steps.map((step, index) => (
              <div key={index} className="mb-3 p-3 border border-gray-200 rounded-lg relative group">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-gray-700">Step {step.order}</p>
                  {formData.steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <Input
                  placeholder="Instruction"
                  value={step.instruction}
                  onChange={(e) => {
                    const newSteps = [...formData.steps];
                    newSteps[index].instruction = e.target.value;
                    setFormData({ ...formData, steps: newSteps });
                  }}
                  className="mb-2"
                />
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">Expected Image (Optional)</label>
                  <ImageUpload
                    projectId={feature?.projectId || ''}
                    value={step.expectedImage}
                    onChange={(imageId) => {
                      const newSteps = [...formData.steps];
                      newSteps[index].expectedImage = imageId;
                      setFormData({ ...formData, steps: newSteps });
                    }}
                  />
                </div>
                <Input
                  placeholder="Expected Result (optional)"
                  value={step.expectedResult}
                  onChange={(e) => {
                    const newSteps = [...formData.steps];
                    newSteps[index].expectedResult = e.target.value;
                    setFormData({ ...formData, steps: newSteps });
                  }}
                  className="mb-2"
                />
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Wait Time - Time to wait for UI to settle after this step</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={step.waitTimeMs || 0}
                      onChange={(e) => {
                        const newSteps = [...formData.steps];
                        newSteps[index].waitTimeMs = parseInt(e.target.value) || 0;
                        setFormData({ ...formData, steps: newSteps });
                      }}
                      className="w-32"
                    />
                    <span className="text-sm text-gray-500 font-medium">ms</span>
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addStep}>
              <Plus size={16} className="mr-1" />
              Add Step
            </Button>
          </div>

          <Textarea
            label="Local Teardown"
            placeholder="Close modal..."
            value={formData.localTeardown.instruction}
            onChange={(e) => setFormData({
              ...formData,
              localTeardown: { instruction: e.target.value }
            })}
            rows={2}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                resetFormData();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? (formData._id ? 'Updating...' : 'Creating...')
                : (formData._id ? 'Update Test Case' : 'Create Test Case')
              }
            </Button>
          </div>
        </form>
      </Modal>

      {selectedTestCase && (
        <Modal
          isOpen={!!selectedTestCase}
          onClose={() => {
            setSelectedTestCase(null);
            setEditingStepIndex(null);
            setIsEditingTitle(false);
          }}
          title={
            isEditingTitle ? (
              <div className="flex items-center gap-2 w-full pr-8" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={titleFormData}
                  onChange={(e) => setTitleFormData(e.target.value)}
                  className="py-1 px-2 text-lg font-semibold h-9"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSave();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                />
                <Button size="sm" onClick={handleTitleSave}>
                  <Save size={16} />
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setIsEditingTitle(false)}>
                  <X size={16} />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <span className="truncate max-w-md">{selectedTestCase.title}</span>
                <button
                  onClick={() => {
                    setTitleFormData(selectedTestCase.title);
                    setIsEditingTitle(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 transition-all p-1.5 rounded-md hover:bg-indigo-50"
                  title="Edit title"
                >
                  <Pencil size={16} />
                </button>
              </div>
            )
          }
        >
          <div className="space-y-4">
            <div className="flex justify-end gap-2 mb-4">
              <Button variant="danger" size="sm" onClick={() => handleDeleteTestCase(selectedTestCase._id)}>
                <Trash2 size={16} className="mr-2" />
                Delete Test Case
              </Button>
            </div>

            {selectedTestCase.localSetup && (
              <div>
                <p className="text-sm font-medium text-gray-700">Local Setup:</p>
                <p className="text-sm text-gray-600 mt-1">{selectedTestCase.localSetup.instruction}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Steps:</p>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={selectedTestCase.steps.map((_, i) => `step-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {selectedTestCase.steps.map((step, index) => (
                    <SortableStepRow
                      key={`step-${index}`} // Make sure to use something stable if possible, or key by index if reordering full array
                      id={`step-${index}`}
                      index={index}
                      step={step}
                      editingStepIndex={editingStepIndex}
                      setEditingStepIndex={setEditingStepIndex}
                      selectedTestCase={selectedTestCase}
                      stepFormData={stepFormData}
                      setStepFormData={setStepFormData}
                      setDeleteConfirmOpen={setDeleteConfirmOpen}
                      setStepToDelete={setStepToDelete}
                      setModalImage={setModalImage}
                      handleSaveStep={async (idx) => {
                        console.log('[FeatureDetailPage] Saving step via REDUX');
                        const updatedSteps = [...selectedTestCase.steps];
                        updatedSteps[idx] = {
                          ...updatedSteps[idx],
                          instruction: stepFormData.instruction,
                          expectedImage: stepFormData.expectedImage || undefined,
                          expectedResult: stepFormData.expectedResult,
                          waitTimeMs: stepFormData.waitTimeMs
                        };
                        try {
                          // UPDATE VIA REDUX THUNK - updates Redux AND persists to backend
                          await dispatch(updateTestCaseThunk({ 
                            id: selectedTestCase._id, 
                            data: { steps: updatedSteps } 
                          })).unwrap();
                          
                          // Update local state to reflect the change immediately
                          setSelectedTestCase({ ...selectedTestCase, steps: updatedSteps });
                          setEditingStepIndex(null);
                        } catch (error) {
                          console.error('Failed to update step:', error);
                        }
                      }}
                      onAddStepAbove={async () => {
                        const newSteps = [...selectedTestCase.steps];
                        newSteps.splice(index, 0, {
                          order: 0, // Will be recalculated
                          instruction: 'New step',
                          expectedImage: undefined,
                          expectedResult: '',
                          waitTimeMs: 0
                        });

                        const reorderedSteps = newSteps.map((s, i) => ({ ...s, order: i + 1 }));

                        try {
                          // UPDATE VIA REDUX
                          await dispatch(updateTestCaseThunk({ 
                            id: selectedTestCase._id, 
                            data: { steps: reorderedSteps } 
                          })).unwrap();
                          
                          setSelectedTestCase({ ...selectedTestCase, steps: reorderedSteps });
                          // Automatically edit the new step
                          setEditingStepIndex(index);
                          setStepFormData({ instruction: '', expectedImage: '', expectedResult: '', waitTimeMs: 0 });
                        } catch (e) {
                          console.error("Failed to add step above", e);
                        }
                      }}
                      onAddStepBelow={async () => {
                        const newSteps = [...selectedTestCase.steps];
                        newSteps.splice(index + 1, 0, {
                          order: 0, // Will be recalculated
                          instruction: 'New step',
                          expectedImage: undefined,
                          expectedResult: '',
                          waitTimeMs: 0
                        });

                        const reorderedSteps = newSteps.map((s, i) => ({ ...s, order: i + 1 }));

                        try {
                          // UPDATE VIA REDUX
                          await dispatch(updateTestCaseThunk({ 
                            id: selectedTestCase._id, 
                            data: { steps: reorderedSteps } 
                          })).unwrap();
                          
                          setSelectedTestCase({ ...selectedTestCase, steps: reorderedSteps });
                          // Automatically edit the new step
                          setEditingStepIndex(index + 1);
                          setStepFormData({ instruction: '', expectedImage: '', expectedResult: '', waitTimeMs: 0 });
                        } catch (e) {
                          console.error("Failed to add step below", e);
                        }
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            {selectedTestCase.localTeardown && (
              <div>
                <p className="text-sm font-medium text-gray-700">Local Teardown:</p>
                <p className="text-sm text-gray-600 mt-1">{selectedTestCase.localTeardown.instruction}</p>
              </div>
            )}

          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setStepToDelete(null);
        }}
        onConfirm={async () => {
          if (stepToDelete !== null && selectedTestCase) {
            const updatedSteps = selectedTestCase.steps
              .filter((_, i) => i !== stepToDelete)
              .map((step, i) => ({ ...step, order: i + 1 }));
            try {
              console.log('[FeatureDetailPage] Deleting step via REDUX');
              await dispatch(updateTestCaseThunk({ 
                id: selectedTestCase._id, 
                data: { steps: updatedSteps } 
              })).unwrap();
              setSelectedTestCase({ ...selectedTestCase, steps: updatedSteps });
            } catch (error) {
              console.error('Failed to delete step:', error);
            }
          }
        }}
        title="Delete Step"
        message="Are you sure you want to delete this step? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={featureDeleteConfirmOpen}
        onClose={() => setFeatureDeleteConfirmOpen(false)}
        onConfirm={async () => {
          if (feature) {
            try {
              console.log('[FeatureDetailPage] Deleting feature via REDUX');
              await dispatch(deleteFeatureThunk(feature._id)).unwrap();
              navigate(`/projects/${feature.projectId}`);
            } catch (error) {
              console.error('Failed to delete feature:', error);
            }
          }
        }}
        title="Delete Feature"
        message="Are you sure you want to delete this feature? All test cases within it will also be deleted. This action cannot be undone."
        confirmText="Delete Feature"
        variant="danger"
      />

      {/* Image Modal with Zoom and Pan Controls */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => {
            setModalImage(null);
            setImageZoom(1);
            setImagePosition({ x: 0, y: 0 });
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-black/50" onClick={(e) => e.stopPropagation()}>
            <span className="font-medium text-white">{modalImage.name}</span>
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <button
                onClick={() => setImageZoom(z => Math.max(0.25, z - 0.25))}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Zoom Out"
              >
                <ZoomOut size={20} />
              </button>
              <span className="text-white text-sm min-w-[60px] text-center">{Math.round(imageZoom * 100)}%</span>
              <button
                onClick={() => setImageZoom(z => Math.min(4, z + 0.25))}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Zoom In"
              >
                <ZoomIn size={20} />
              </button>
              <button
                onClick={() => {
                  setImageZoom(1);
                  setImagePosition({ x: 0, y: 0 });
                }}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Reset View"
              >
                <RotateCcw size={20} />
              </button>
              <div className="w-px h-6 bg-white/30 mx-2" />
              <button
                onClick={() => {
                  setModalImage(null);
                  setImageZoom(1);
                  setImagePosition({ x: 0, y: 0 });
                }}
                className="p-2 hover:bg-white/20 rounded transition-colors text-white"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Image Container with Pan */}
          <div
            ref={imageContainerRef}
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging(true);
              setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
            }}
            onMouseMove={(e) => {
              if (isDragging) {
                setImagePosition({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              setImageZoom(z => Math.max(0.25, Math.min(4, z + delta)));
            }}
          >
            <img
              src={modalImage.src}
              alt={modalImage.name}
              className="max-w-none select-none pointer-events-none"
              style={{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${imageZoom})`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
              draggable={false}
            />
          </div>

          {/* Footer hint */}
          <div className="p-2 bg-black/50 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-white/60 text-xs flex items-center justify-center gap-2">
              <Move size={14} /> Drag to pan when zoomed • Scroll to zoom • Click background to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

