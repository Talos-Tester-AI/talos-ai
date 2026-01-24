import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Key, Brain, Zap, Save, Trash2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchAIConfig, saveAIConfigThunk, clearAIConfigThunk, resetError } from '../store/slices/aiConfigSlice';
import type { AIProvider, AIConfig } from '../types';
import { AI_MODELS, AI_PROVIDER_NAMES } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

const PROVIDERS: AIProvider[] = ['openai', 'claude', 'gemini'];

export const SettingsPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { config, loading, saving, error, initialized } = useAppSelector((state) => state.aiConfig);

  const [formData, setFormData] = useState<AIConfig>({
    provider: 'openai',
    apiKey: '',
    complexModel: '',
    simpleModel: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!initialized) {
      dispatch(fetchAIConfig());
    }
  }, [dispatch, initialized]);

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  // Set default models when provider changes
  useEffect(() => {
    const models = AI_MODELS[formData.provider];
    const complexModels = models.filter(m => m.category === 'complex');
    const simpleModels = models.filter(m => m.category === 'simple');

    // Only set defaults if current selection is not valid for this provider
    const currentComplexValid = complexModels.some(m => m.id === formData.complexModel);
    const currentSimpleValid = simpleModels.some(m => m.id === formData.simpleModel);

    if (!currentComplexValid && complexModels.length > 0) {
      setFormData(prev => ({ ...prev, complexModel: complexModels[0].id }));
    }
    if (!currentSimpleValid && simpleModels.length > 0) {
      setFormData(prev => ({ ...prev, simpleModel: simpleModels[0].id }));
    }
  }, [formData.provider]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);

    if (!formData.apiKey.trim()) {
      return;
    }

    try {
      await dispatch(saveAIConfigThunk(formData)).unwrap();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const handleClear = async () => {
    if (window.confirm('Are you sure you want to clear the AI configuration? This will remove your API key.')) {
      try {
        await dispatch(clearAIConfigThunk()).unwrap();
        setFormData({
          provider: 'openai',
          apiKey: '',
          complexModel: AI_MODELS.openai.find(m => m.category === 'complex')?.id || '',
          simpleModel: AI_MODELS.openai.find(m => m.category === 'simple')?.id || '',
        });
      } catch (err) {
        console.error('Failed to clear config:', err);
      }
    }
  };

  const complexModels = AI_MODELS[formData.provider].filter(m => m.category === 'complex');
  const simpleModels = AI_MODELS[formData.provider].filter(m => m.category === 'simple');

  if (loading && !initialized) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Configuration</h1>
          <p className="text-gray-500 mt-1">Configure your AI provider and models for test generation</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
          <button 
            onClick={() => dispatch(resetError())} 
            className="ml-auto text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-green-700">Configuration saved successfully!</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-500" />
            AI Provider
          </h2>
          
          <div className="grid grid-cols-3 gap-3">
            {PROVIDERS.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, provider }))}
                className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                  formData.provider === provider
                    ? 'border-violet-500 bg-violet-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`font-semibold ${formData.provider === provider ? 'text-violet-700' : 'text-gray-700'}`}>
                  {AI_PROVIDER_NAMES[provider]}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {AI_MODELS[provider].length} models
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Key className="w-5 h-5 text-amber-500" />
            API Key
          </h2>
          
          <div className="relative">
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={formData.apiKey}
              onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder={`Enter your ${AI_PROVIDER_NAMES[formData.provider]} API key`}
              className="pr-12 font-mono"
              required
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Your API key is stored securely on your local machine and never sent to external servers.
          </p>
        </Card>

        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            Model Selection
          </h2>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Complex Operations Model
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  (Analysis, test generation, visual comparisons)
                </span>
              </label>
              <select
                value={formData.complexModel}
                onChange={(e) => setFormData(prev => ({ ...prev, complexModel: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 bg-white transition-colors"
              >
                {complexModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Simple Operations Model
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  (Basic validations, quick checks)
                </span>
              </label>
              <select
                value={formData.simpleModel}
                onChange={(e) => setFormData(prev => ({ ...prev, simpleModel: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 bg-white transition-colors"
              >
                {simpleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <div className="flex justify-between items-center">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClear}
            disabled={saving || !config}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Configuration
          </Button>

          <Button
            type="submit"
            disabled={saving || !formData.apiKey.trim()}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </form>

      {config && (
        <Card className="mt-8 p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">AI Configuration Active</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            Using {AI_PROVIDER_NAMES[config.provider]} with {AI_MODELS[config.provider].find(m => m.id === config.complexModel)?.name || config.complexModel} for complex operations.
          </p>
        </Card>
      )}
    </div>
  );
};

