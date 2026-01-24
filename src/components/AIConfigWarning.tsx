import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Settings, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchAIConfig } from '../store/slices/aiConfigSlice';
import { Button } from './Button';
import { Modal } from './Modal';

interface AIConfigWarningProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue?: () => void;
  title?: string;
  message?: string;
}

export const AIConfigWarningModal = ({
  isOpen,
  onClose,
  onContinue,
  title = 'AI Configuration Required',
  message = 'You need to configure your AI provider and API key before using AI-powered features.'
}: AIConfigWarningProps) => {
  const navigate = useNavigate();

  const handleGoToSettings = () => {
    onClose();
    navigate('/settings');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
        </div>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3">
          {onContinue && (
            <Button variant="secondary" onClick={onContinue}>
              Continue Anyway
            </Button>
          )}
          <Button onClick={handleGoToSettings} className="bg-gradient-to-r from-violet-500 to-purple-600">
            <Settings className="w-4 h-4 mr-2" />
            Configure AI Settings
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// Banner version for inline warnings
interface AIConfigBannerProps {
  onDismiss?: () => void;
  className?: string;
}

export const AIConfigBanner = ({ onDismiss, className = '' }: AIConfigBannerProps) => {
  const navigate = useNavigate();
  const { config, initialized } = useAppSelector((state) => state.aiConfig);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!initialized) {
      dispatch(fetchAIConfig());
    }
  }, [dispatch, initialized]);

  // Don't show if config exists or not yet initialized
  if (!initialized || config) {
    return null;
  }

  return (
    <div className={`bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-amber-800">AI Configuration Missing</h3>
          <p className="text-sm text-amber-700 mt-1">
            Configure your AI provider to enable test generation and analysis features.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => navigate('/settings')}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Settings className="w-4 h-4 mr-1" />
            Configure
          </Button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Hook to check AI config status
export const useAIConfigCheck = () => {
  const dispatch = useAppDispatch();
  const { config, initialized, loading } = useAppSelector((state) => state.aiConfig);

  useEffect(() => {
    if (!initialized && !loading) {
      dispatch(fetchAIConfig());
    }
  }, [dispatch, initialized, loading]);

  return {
    hasConfig: !!config,
    config,
    isLoading: loading || !initialized,
    isConfigured: !!config?.apiKey
  };
};

