import { useEffect, useState } from 'react';
import { fetchNameOptions, type NameOptions } from '../lib/personName';

const EMPTY: NameOptions = { honorific_prefixes: [], suffixes: [] };

/** Title and suffix choices for name forms. Empty until loaded; forms stay usable meanwhile. */
export function useNameOptions(): NameOptions {
  const [options, setOptions] = useState<NameOptions>(EMPTY);
  useEffect(() => {
    let active = true;
    fetchNameOptions()
      .then((loaded) => { if (active) setOptions(loaded); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return options;
}
