import { useState, useEffect, useCallback } from 'react';

interface UseCountdownTimerProps {
  initialSeconds: number;
  onComplete?: () => void;
}

interface UseCountdownTimerReturn {
  timeLeft: number;
  isActive: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  isCompleted: boolean;
}

export const useCountdownTimer = ({
  initialSeconds,
  onComplete,
}: UseCountdownTimerProps): UseCountdownTimerReturn => {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const start = useCallback(() => {
    setIsActive(true);
    setIsCompleted(false);
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
  }, []);

  const reset = useCallback(() => {
    setTimeLeft(initialSeconds);
    setIsActive(false);
    setIsCompleted(false);
  }, [initialSeconds]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isActive && timeLeft > 0) {
      intervalId = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            setIsActive(false);
            setIsCompleted(true);
            onComplete?.();
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isActive, timeLeft, onComplete]);

  return {
    timeLeft,
    isActive,
    start,
    stop,
    reset,
    isCompleted,
  };
};