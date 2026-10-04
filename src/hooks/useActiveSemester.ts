import { useEffect, useState } from 'react';
import api from '../lib/api';

export interface ActiveSemester {
  id: number;
  academic_year: string;
  semester: string;
  is_active?: boolean;
}

export function useActiveSemester() {
  const [semester, setSemester] = useState<ActiveSemester | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api.get<ActiveSemester>('/semesters/active')
      .then(({ data }) => { if (active) setSemester(data ?? null); })
      .catch(() => { if (active) setSemester(null); })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, []);

  return { semester, isLoading };
}
