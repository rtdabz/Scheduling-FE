import { UserRound } from 'lucide-react';

interface ProfileAvatarProps {
  src?: string | null;
  alt?: string;
  className: string;
  iconClassName?: string;
}

/** Shared profile image with a neutral person silhouette when no photo is uploaded. */
export default function ProfileAvatar({ src, alt = '', className, iconClassName = 'h-1/2 w-1/2' }: ProfileAvatarProps) {
  if (src) {
    return <img src={src} alt={alt} className={`${className} object-cover`} />;
  }

  return (
    <span className={`${className} flex items-center justify-center overflow-hidden bg-slate-100 text-slate-400`} aria-label={alt || 'Profile photo'}>
      <UserRound className={iconClassName} aria-hidden="true" />
    </span>
  );
}
