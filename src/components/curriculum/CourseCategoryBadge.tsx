import { COURSE_CATEGORY_TONES } from './courseCategoryStyles';

export default function CourseCategoryBadge({ category }: { category: keyof typeof COURSE_CATEGORY_TONES }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize leading-4 ${COURSE_CATEGORY_TONES[category]}`}>
      {category === 'major' ? 'Major' : 'Minor'}
    </span>
  );
}
