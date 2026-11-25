import { useEffect, useState } from 'react';
import { fetchCurrentUser } from '../lib/currentUser';
import { getStoredUser, type StoredUser } from '../lib/storedUser';
import { useLiveRevision } from './useLiveRefresh';

/** Refresh the server's program permissions for open import and room-request forms. */
export function useProgramAccess() {
  const live = useLiveRevision(['users', 'departments']);
  const [refresh, setRefresh] = useState(0);
  const revision = `${live}:${refresh}`;
  const [snapshot, setSnapshot] = useState<{ user: StoredUser | null; revision: string; error: boolean }>(
    () => ({ user: getStoredUser(), revision: '', error: false }),
  );

  useEffect(() => {
    let active = true;
    fetchCurrentUser<StoredUser>({ force: true, afterPending: true })
      .then(user => { if (active) setSnapshot({ user, revision, error: false }); })
      .catch(() => { if (active) setSnapshot(current => ({ ...current, revision, error: true })); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    const update = () => setRefresh(value => value + 1);
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);

  return { user: snapshot.user, ready: snapshot.revision === revision && !snapshot.error, error: snapshot.error };
}
