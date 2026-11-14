import type { BadgeTone } from '../components/ui/Badge';

/** Tone for the common approval-style statuses used across modules. */
export function statusTone(status: string | null | undefined): BadgeTone {
  switch ((status ?? '').toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'approved':
    case 'active':
    case 'available':
    case 'completed':
    case 'complete':
    case 'published':
    case 'success':
      return 'success';
    case 'pending':
    case 'pending_approval':
    case 'for_review':
    case 'in_review':
    case 'submitted':
    case 'draft':
      return 'warning';
    case 'rejected':
    case 'declined':
    case 'returned':
    case 'failed':
    case 'not_available':
    case 'unavailable':
      return 'danger';
    default:
      return 'neutral';
  }
}
