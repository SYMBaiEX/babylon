/**
 * Profile Loading Component
 *
 * @description Loading skeleton for the user profile page, displaying skeleton
 * loaders for the profile header and feed sections. Responsive layout with
 * optional sidebar on large screens.
 *
 * @returns {JSX.Element} Profile loading skeleton
 */
import { PageContainer } from '@/components/shared/PageContainer';
import {
  FeedSkeleton,
  ProfileHeaderSkeleton,
} from '@/components/shared/Skeleton';

export default function ProfileLoading() {
  return (
    <PageContainer noPadding className="flex min-h-screen flex-col">
      <div className="flex flex-1">
        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col border-[rgba(120,120,120,0.5)] lg:border-r lg:border-l">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[700px]">
              {/* Profile Header */}
              <ProfileHeaderSkeleton />

              {/* Posts */}
              <div className="mt-4 border-border/5 border-t">
                <FeedSkeleton count={5} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Widget placeholder - only on large screens */}
        <div className="hidden w-80 shrink-0 border-border/5 border-l bg-background lg:block xl:w-96" />
      </div>
    </PageContainer>
  );
}
