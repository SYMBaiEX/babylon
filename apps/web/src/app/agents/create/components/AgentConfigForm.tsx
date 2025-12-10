'use client';

import { cn } from '@babylon/shared';
import { Loader2, Sparkles } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AgentFormData } from '../hooks/useAgentForm';

interface AgentConfigFormProps {
  agentData: AgentFormData;
  generatingField: string | null;
  maxDeposit: number;
  onFieldChange: (field: keyof AgentFormData, value: string | number) => void;
  onRegenerate: (field: string) => void;
}

interface FieldWithAIProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  rows?: number;
  isGenerating: boolean;
  onRegenerate: () => void;
  onChange: (value: string) => void;
  helpText?: string;
}

const FieldWithAI = memo(function FieldWithAI({
  id,
  label,
  value,
  placeholder,
  rows = 4,
  isGenerating,
  onRegenerate,
  onChange,
  helpText,
}: FieldWithAIProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={isGenerating}
          className="gap-1 text-xs"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              Regenerate
            </>
          )}
        </Button>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          'font-mono text-sm',
          isGenerating && 'animate-pulse opacity-70'
        )}
      />
      {helpText && <p className="text-muted-foreground text-xs">{helpText}</p>}
    </div>
  );
});

export const AgentConfigForm = memo(function AgentConfigForm({
  agentData,
  generatingField,
  maxDeposit,
  onFieldChange,
  onRegenerate,
}: AgentConfigFormProps) {
  return (
    <div className="space-y-6">
      <FieldWithAI
        id="system"
        label="System Prompt"
        value={agentData.system}
        placeholder="You are a trading agent focused on..."
        rows={6}
        isGenerating={generatingField === 'system'}
        onRegenerate={() => onRegenerate('system')}
        onChange={(v) => onFieldChange('system', v)}
        helpText="Core instructions defining agent behavior and capabilities."
      />

      <FieldWithAI
        id="personality"
        label="Personality"
        value={agentData.personality}
        placeholder="Analytical and methodical..."
        rows={4}
        isGenerating={generatingField === 'personality'}
        onRegenerate={() => onRegenerate('personality')}
        onChange={(v) => onFieldChange('personality', v)}
        helpText="Character traits that influence communication style."
      />

      <FieldWithAI
        id="tradingStrategy"
        label="Trading Strategy"
        value={agentData.tradingStrategy}
        placeholder="Focus on momentum indicators..."
        rows={5}
        isGenerating={generatingField === 'tradingStrategy'}
        onRegenerate={() => onRegenerate('tradingStrategy')}
        onChange={(v) => onFieldChange('tradingStrategy', v)}
        helpText="Market analysis approach and position sizing rules."
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="initialDeposit">Initial Deposit</Label>
          <span className="font-mono text-muted-foreground text-sm">
            {agentData.initialDeposit.toLocaleString()} points
          </span>
        </div>
        <Input
          id="initialDeposit"
          type="number"
          min={10}
          max={maxDeposit}
          step={10}
          value={agentData.initialDeposit}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
              onFieldChange(
                'initialDeposit',
                Math.max(10, Math.min(val, maxDeposit))
              );
            }
          }}
          className="font-mono"
        />
        <p className="text-muted-foreground text-xs">
          Points to fund your agent&apos;s trading account (10 -{' '}
          {maxDeposit.toLocaleString()}). You can add more later.
        </p>
      </div>
    </div>
  );
});
