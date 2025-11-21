# Prompt Debug Logger

Debug system for logging all LLM prompts and responses to markdown files.

## Usage

Enable prompt logging by setting the environment variable:

```bash
export DEBUG_PROMPTS=true
```

Or in `.env.local`:

```
DEBUG_PROMPTS=true
```

## Output Location

All debug files are saved to `debug-prompts/` in the project root:

```
debug-prompts/
  2025-11-20T12-30-45-123Z_question-generation.md
  2025-11-20T12-31-15-456Z_ambient-post.md
  2025-11-20T12-32-00-789Z_journalist-post.md
  ...
```

## File Format

Each markdown file includes:

```markdown
# Prompt Debug Log: <promptType>

**Timestamp:** 2025-11-20T12:30:45.123Z

## Metadata
- **Provider:** groq
- **Model:** qwen/qwen3-32b
- **Temperature:** 0.9
- **Max Tokens:** 8000
- **Format:** xml

## Prompt Template
```
<raw template with {{variables}}>
```

## Rendered Input Prompt
```
<fully rendered prompt sent to LLM>
```

## Raw LLM Output
```
<exact raw response from LLM>
```

## Parsed Output
```json
<structured JSON if parsing succeeded>
```
```

## Cleanup

Old debug logs are automatically cleaned up (files older than 7 days are deleted).

You can also manually clean up:

```typescript
import { cleanOldDebugLogs } from '@/lib/debug/prompt-logger';

// Clean logs older than 7 days
await cleanOldDebugLogs(7);

// Clean logs older than 1 day
await cleanOldDebugLogs(1);
```

## Integration

The system automatically logs all `BabylonLLMClient.generateJSON()` calls when `DEBUG_PROMPTS=true`.

No code changes needed in your generation logic - just set the env var.

## Disabling

To disable prompt logging:

```bash
unset DEBUG_PROMPTS
# or
export DEBUG_PROMPTS=false
```

