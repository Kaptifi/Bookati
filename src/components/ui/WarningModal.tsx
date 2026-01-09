import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

interface WarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  details?: string[];
  confirmText?: string;
  cancelText?: string;
  requiresExplicitConfirmation?: boolean;
}

export function WarningModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  details,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  requiresExplicitConfirmation = false,
}: WarningModalProps) {
  const [confirmationText, setConfirmationText] = React.useState('');
  const [understood, setUnderstood] = React.useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (requiresExplicitConfirmation && (!understood || confirmationText.toLowerCase() !== 'confirm')) {
      return;
    }
    onConfirm();
    setConfirmationText('');
    setUnderstood(false);
  };

  const handleClose = () => {
    setConfirmationText('');
    setUnderstood(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-gray-700">{message}</p>

          {details && details.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm font-medium text-yellow-800 mb-2">
                This action will:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700">
                {details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          )}

          {requiresExplicitConfirmation && (
            <div className="space-y-3">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="understood"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="understood" className="ml-2 text-sm text-gray-700">
                  I understand the consequences of this action
                </label>
              </div>

              <div>
                <label htmlFor="confirmation" className="block text-sm font-medium text-gray-700 mb-1">
                  Type "CONFIRM" to proceed:
                </label>
                <input
                  type="text"
                  id="confirmation"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="CONFIRM"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <Button
            variant="secondary"
            onClick={handleClose}
          >
            {cancelText}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={
              requiresExplicitConfirmation &&
              (!understood || confirmationText.toLowerCase() !== 'confirm')
            }
            className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
