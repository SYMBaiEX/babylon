'use client';

import { StarRatingInput } from '../StarRating';

interface FeatureRequestFieldsProps {
  rating: number;
  onRatingChange: (rating: number) => void;
}

export function FeatureRequestFields({
  rating,
  onRatingChange,
}: FeatureRequestFieldsProps) {
  return (
    <div className="space-y-3">
      <label className="font-medium text-foreground text-sm">
        How strongly do you feel about this?{' '}
        <span className="text-destructive">*</span>
      </label>
      <StarRatingInput
        value={rating * 20}
        onChange={(score) => onRatingChange(score / 20)}
        showDescriptions={true}
      />
    </div>
  );
}

