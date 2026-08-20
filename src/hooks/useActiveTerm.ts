import { useEffect, useState } from 'react';
import api from '../lib/api';

export interface ActiveTerm {
  id: number;
  academic_year: string;
  semester: string;
  is_active?: boolean;
}

/**
 * The term flagged is_active, for the app shell.
 *
 * GET /terms/active answers 404 when no term is active -- that is an empty
 * result, not a failure, so it resolves to null like any other miss.
 */
export function useActiveTerm() {
  const [term, setTerm] = useState<ActiveTerm | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api.get<ActiveTerm>('/terms/active')
      .then(({ data }) => { if (active) setTerm(data ?? null); })
      .catch(() => { if (active) setTerm(null); })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, []);

  return { term, isLoading };
}
