import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export const Card = ({ children, className, onClick, hoverable = false }: CardProps) => {
  return (
    <div
      className={clsx(
        'bg-white rounded-lg shadow border border-gray-200 p-6',
        hoverable && 'hover:shadow-md transition-shadow cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

