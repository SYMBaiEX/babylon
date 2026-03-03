'use client';

import type { NarrativeStory } from '@/app/feed/types/narrative';
import { NarrativeStoryCard } from './NarrativeStoryCard';

interface NarrativeStoryListProps {
  stories: NarrativeStory[];
}

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
