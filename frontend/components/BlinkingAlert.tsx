'use client';

interface BlinkingAlertProps {
  children: React.ReactNode;
  isActive?: boolean;
  intensity?: 'low' | 'medium' | 'high';
  className?: string;
}

export default function BlinkingAlert({
  children,
  isActive = true,
  intensity = 'high',
  className = '',
}: BlinkingAlertProps) {
  if (!isActive) {
    return <div className={className}>{children}</div>;
  }

  const borderAnimationClass = {
    low: 'animate-pulse-border-slow',
    medium: 'animate-pulse-border',
    high: 'animate-pulse-border-fast',
  }[intensity];

  return (
    <div className={`relative ${className}`}>
      {/* Blinking red border wrapper */}
      <div
        className={`absolute inset-0 rounded-3xl pointer-events-none ${borderAnimationClass}`}
        style={{
          border: '3px solid rgba(239, 68, 68, 0.8)',
          boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
        }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.6);
          }
          50% {
            opacity: 0.4;
            box-shadow: 0 0 40px rgba(239, 68, 68, 0.9);
          }
        }

        @keyframes pulse-border-fast {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.6);
          }
          50% {
            opacity: 0.3;
            box-shadow: 0 0 40px rgba(239, 68, 68, 0.9);
          }
        }

        @keyframes pulse-border-slow {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
          }
          50% {
            opacity: 0.5;
            box-shadow: 0 0 30px rgba(239, 68, 68, 0.7);
          }
        }

        .animate-pulse-border {
          animation: pulse-border 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .animate-pulse-border-fast {
          animation: pulse-border-fast 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .animate-pulse-border-slow {
          animation: pulse-border-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
