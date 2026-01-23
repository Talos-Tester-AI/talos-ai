import type { TestRunStatus, RunStatus } from '../types';
import { clsx } from 'clsx';

interface StatusBadgeProps {
  status: TestRunStatus | RunStatus;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const statusColors: Record<TestRunStatus | RunStatus, string> = {
    completed: 'bg-green-100 text-green-800 border-green-200',
    passed: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    running: 'bg-blue-100 text-blue-800 border-blue-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    building: 'bg-purple-100 text-purple-800 border-purple-200',
    booting: 'bg-purple-100 text-purple-800 border-purple-200',
    installing: 'bg-purple-100 text-purple-800 border-purple-200',
    cancelled: 'bg-gray-100 text-gray-800 border-gray-200'
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        statusColors[status] || statusColors.pending,
        className
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

