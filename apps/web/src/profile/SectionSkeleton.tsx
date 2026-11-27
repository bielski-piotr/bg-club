import { t } from '../i18n';
import { Skeleton, Spinner } from '../ui';

/**
 * Placeholder of a profile section while its data loads: a block of a typical section height,
 * so the page below doesn't jump when the data arrives.
 */
export function SectionSkeleton() {
  return (
    <div class="section-skeleton">
      <Skeleton width="100%" height={180} radius={18} />
      <Spinner label={t.popups.loading} class="sr-only" />
    </div>
  );
}
