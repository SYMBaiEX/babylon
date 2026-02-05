'use client';

import { Info } from 'lucide-react';
import { memo } from 'react';
import {
  type AgentConfigurationData,
  AgentConfigurationForm,
} from '@/components/agents/AgentConfigurationForm';

// Re-export the type for convenience
export type { AgentConfigurationData as AgentSettingsData };

interface AgentSettingsStepProps {
  settings: AgentConfigurationData;
  onSettingsChange: (settings: AgentConfigurationData) => void;
}

export const AgentSettingsStep = memo(function AgentSettingsStep({
  settings,
  onSettingsChange,
}: AgentSettingsStepProps) {
  return (
    <div className="space-y-4">
      {/* Info Banner - compact */}
      <div className="flex items-start gap-2 text-muted-foreground text-xs">
        <Info className="h-4 w-4 shrink-0 text-[#0066FF]" />
        <p>Configure capabilities below. You can change these anytime from settings.</p>
      </div>

      {/* Shared Configuration Form */}
      <AgentConfigurationForm data={settings} onChange={onSettingsChange} />
    </div>
  );
});
