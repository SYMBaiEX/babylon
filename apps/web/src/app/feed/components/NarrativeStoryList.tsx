import type { NarrativeStory } from '@babylon/shared';
import { NarrativeStoryCard } from './NarrativeStoryCard';

interface NarrativeStoryListProps {
  stories: NarrativeStory[];
}

// No 'use client' needed — this component has no hooks or browser APIs.
// It can be rendered as a server component; NarrativeStoryCard (client)
// will hydrate independently.
export function NarrativeStoryList({ stories }: NarrativeStoryListProps) {
  if (stories.length === 0) return null;

  return (
    <div className="w-full">
      {stories.map((story) => (
        <NarrativeStoryCard key={story.storyKey} story={story} />
      ))}

      <div className="py-4 text-center text-muted-foreground text-xs">
        You&apos;re all caught up.
      </div>
    </div>
  );
}
