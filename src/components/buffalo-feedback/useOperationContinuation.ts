import { useEffect, useRef } from "react";

/** Polling may replace the DTO at any time. Only durable progress or a pause
 * should reset the continuation clock, never a fresh copy of the same DTO. */
export function useOperationContinuation({
  id,
  state,
  version,
  enabled,
  delay,
  resume,
}: {
  id?: string;
  state?: string;
  version?: number;
  enabled: boolean;
  delay: number;
  resume: () => Promise<void>;
}) {
  const latest = useRef(resume);
  latest.current = resume;
  useEffect(() => {
    if (!id || !enabled) return;
    const timer = setTimeout(() => {
      void latest.current();
    }, delay);
    return () => clearTimeout(timer);
  }, [id, state, version, enabled, delay]);
}
