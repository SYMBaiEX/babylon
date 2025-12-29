# Screen Recording for Game Feedback - Implementation Plan

## Overview

Add screen recording capability to the game feedback system, allowing users to capture video demonstrations of bugs, feature requests, or performance issues.

## Scope

| Feature | Status |
|---------|--------|
| Screen recording (desktop only) | ✅ In scope |
| Microphone audio narration | ✅ In scope |
| System audio capture | ❌ Out of scope |
| Mobile screen recording | ❌ Not supported by browsers |
| Feedback without recording (mobile) | ✅ Existing feature |

## Constraints

- **Max duration:** 3 minutes
- **Max file size:** 10MB
- **Video quality:** Low (to meet size constraints)
- **Platform:** Desktop browsers only (Chrome, Firefox, Edge, Safari)
- **Mobile:** Feature hidden, feedback form still available

---

## Technical Approach

### Video Settings for 10MB / 3 Minute Limit

To fit 3 minutes of video into 10MB:
- Target bitrate: ~450 kbps (10MB / 180s ≈ 55KB/s ≈ 440kbps)
- Resolution: 1280x720 (720p) or lower
- Frame rate: 15 fps (sufficient for UI demos)
- Codec: VP9 (best compression) with WebM container

```typescript
const videoConstraints = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 15, max: 15 },
};

const recorderOptions = {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 400_000, // 400 kbps for video
  audioBitsPerSecond: 48_000,  // 48 kbps for audio
};
```

### Browser API Usage

**Screen Capture:**
```typescript
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: videoConstraints,
  audio: false, // We use mic instead of system audio
});
```

**Microphone Audio:**
```typescript
const micStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
});
```

**Combine Streams:**
```typescript
const combinedStream = new MediaStream([
  ...screenStream.getVideoTracks(),
  ...micStream.getAudioTracks(),
]);
```

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FEEDBACK MODAL                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ [Report a Bug] [Feature Request] [Performance Issue]               │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Description: [________________]                                         │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 🎥 Record Screen (optional)                                        │ │
│ │ ┌─────────────┐  ☐ Include microphone                              │ │
│ │ │ Start       │  Max 3 minutes • 10MB limit                        │ │
│ │ │ Recording   │                                                    │ │
│ │ └─────────────┘                                                    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Click "Start Recording"
                     ┌──────────────────────────────┐
                     │ Browser: Select what to share │
                     │ ○ Entire screen               │
                     │ ○ Window                      │
                     │ ○ Browser tab                 │
                     └──────────────────────────────┘
                                    │
                                    ▼ User selects & confirms
┌─────────────────────────────────────────────────────────────────────────┐
│ MAIN APP (Modal hidden)                                                 │
│                                                                         │
│   User demonstrates the bug/feature...                                  │
│                                                                         │
│ ┌─────────────────────────────────────────┐                             │
│ │ 🔴 Recording 0:45 / 3:00  [Stop]       │  ← Floating indicator       │
│ └─────────────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Click "Stop" or hit 3 min limit
┌─────────────────────────────────────────────────────────────────────────┐
│ FEEDBACK MODAL (Reopened with video)                                    │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ▶ [Video Preview]                                    [✕ Remove]   │ │
│ │   Duration: 0:45 • Size: 2.3 MB                                   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Description: [User's bug description________________]                   │
│                                                                         │
│                                              [Submit Feedback]          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### New Components

```
apps/web/src/components/feedback/
├── GameFeedbackModal.tsx          # Existing - add recording integration
├── recording/
│   ├── ScreenRecordButton.tsx     # "Record Screen" button with options
│   ├── RecordingIndicator.tsx     # Floating indicator during recording
│   ├── VideoPreview.tsx           # Preview recorded video
│   └── hooks/
│       └── useScreenRecorder.ts   # Core recording logic
```

### State Machine

```
         ┌──────────┐
         │   IDLE   │
         └────┬─────┘
              │ startRecording()
              ▼
    ┌───────────────────┐
    │ REQUESTING_SCREEN │──────► ERROR (denied)
    └────────┬──────────┘
             │ screen granted
             ▼
    ┌───────────────────┐
    │ REQUESTING_MIC    │──────► RECORDING (mic denied, continue without)
    └────────┬──────────┘
             │ mic granted
             ▼
    ┌───────────────────┐
    │    RECORDING      │──────► ERROR (stream ended unexpectedly)
    └────────┬──────────┘
             │ stopRecording() or 3 min limit
             ▼
    ┌───────────────────┐
    │    PROCESSING     │  (generating blob)
    └────────┬──────────┘
             │
             ▼
    ┌───────────────────┐
    │    READY          │  (video ready for preview/upload)
    └───────────────────┘
```

### Hook Interface

```typescript
interface UseScreenRecorderReturn {
  // State
  state: 'idle' | 'requesting' | 'recording' | 'processing' | 'ready' | 'error';
  duration: number; // Current recording duration in seconds
  error: string | null;
  videoBlob: Blob | null;
  videoUrl: string | null; // Object URL for preview
  
  // Actions
  startRecording: (options: { includeMic: boolean }) => Promise<void>;
  stopRecording: () => void;
  discardRecording: () => void;
  
  // Derived
  isSupported: boolean; // false on mobile/unsupported browsers
  remainingTime: number; // seconds until 3 min limit
  estimatedSize: number; // estimated file size in bytes
}
```

---

## API Changes

### Update Upload API

Extend existing image upload to support video:

**New endpoint:** `POST /api/upload/video`

```typescript
// Request: multipart/form-data with video file
// Response:
{
  url: string;      // Public URL of uploaded video
  duration: number; // Duration in seconds
  size: number;     // File size in bytes
}

// Validation:
// - Max size: 10MB
// - Allowed types: video/webm, video/mp4
// - Max duration: 180 seconds (server-side verification)
```

### Update Feedback Schema

```typescript
// packages/shared/src/validation/schemas/feedback.ts
export const GameFeedbackSchema = z.object({
  feedbackType: z.enum(['bug', 'feature_request', 'performance']),
  description: z.string().min(10).max(5000),
  stepsToReproduce: z.string().max(2000).optional(),
  screenshotUrl: z.string().url().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  // NEW
  videoUrl: z.string().url().optional(),
  videoDuration: z.number().min(0).max(180).optional(), // seconds
});
```

### Update Linear Issue Formatter

```typescript
// packages/api/src/linear/format-feedback.ts
if (feedback.videoUrl) {
  const durationStr = feedback.videoDuration 
    ? `(${Math.floor(feedback.videoDuration / 60)}:${(feedback.videoDuration % 60).toString().padStart(2, '0')})`
    : '';
  lines.push(
    '### Screen Recording',
    '',
    `📹 [Watch Recording ${durationStr}](${feedback.videoUrl})`,
    ''
  );
}
```

---

## File Structure Changes

```
apps/web/src/
├── app/api/upload/
│   ├── image/route.ts        # Existing
│   └── video/route.ts        # NEW - video upload endpoint
│
├── components/feedback/
│   ├── GameFeedbackModal.tsx # Update - integrate recording
│   ├── forms/                # Existing
│   └── recording/            # NEW
│       ├── ScreenRecordButton.tsx
│       ├── RecordingIndicator.tsx
│       ├── VideoPreview.tsx
│       └── index.ts
│
├── hooks/
│   └── useScreenRecorder.ts  # NEW - recording state machine

packages/
├── api/src/linear/
│   └── format-feedback.ts    # Update - add video section
│
├── shared/src/validation/schemas/
│   └── feedback.ts           # Update - add videoUrl field
```

---

## Browser Compatibility

| Browser | Screen Capture | MediaRecorder | Mic Audio | Status |
|---------|---------------|---------------|-----------|--------|
| Chrome 72+ | ✅ | ✅ VP9 | ✅ | Full support |
| Firefox 66+ | ✅ | ✅ VP9 | ✅ | Full support |
| Edge 79+ | ✅ | ✅ VP9 | ✅ | Full support |
| Safari 14.1+ | ✅ | ⚠️ MP4 only | ✅ | Fallback codec |
| Mobile browsers | ❌ | N/A | N/A | Feature hidden |

### Detection Logic

```typescript
const isScreenRecordingSupported = () => {
  // Check if on mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) return false;
  
  // Check for required APIs
  return !!(
    navigator.mediaDevices?.getDisplayMedia &&
    window.MediaRecorder
  );
};
```

---

## Error Handling

| Error | User Message | Recovery |
|-------|--------------|----------|
| Screen permission denied | "Screen access denied. Please allow access to record." | Show retry button |
| Mic permission denied | "Microphone access denied. Recording without audio." | Continue without audio |
| Recording stopped unexpectedly | "Recording was interrupted. Please try again." | Return to idle state |
| File too large (>10MB) | "Recording is too large. Please record a shorter video." | Allow re-record |
| Upload failed | "Upload failed. Your recording is saved locally." | Retry upload button |
| Browser not supported | (Button not shown) | N/A |

---

## Implementation Phases

### Phase 1: Core Recording Hook (Day 1)
- [ ] Create `useScreenRecorder` hook with state machine
- [ ] Implement screen capture with `getDisplayMedia`
- [ ] Implement MediaRecorder with low-quality settings
- [ ] Add 3-minute auto-stop timer
- [ ] Add file size estimation

### Phase 2: UI Components (Day 2)
- [ ] Create `ScreenRecordButton` with mic toggle
- [ ] Create `RecordingIndicator` (floating during recording)
- [ ] Create `VideoPreview` component
- [ ] Integrate into `GameFeedbackModal`
- [ ] Hide on mobile devices

### Phase 3: Upload & Backend (Day 3)
- [ ] Create `/api/upload/video` endpoint
- [ ] Update `GameFeedbackSchema` with video fields
- [ ] Update Linear formatter to include video link
- [ ] Update feedback submission to upload video

### Phase 4: Polish & Testing (Day 4)
- [ ] Add Safari MP4 fallback
- [ ] Add countdown before recording starts (3, 2, 1...)
- [ ] Add remaining time warning at 2:30
- [ ] Test across browsers
- [ ] Error handling and edge cases

---

## Success Metrics

1. **Adoption:** % of feedback submissions that include video
2. **Completion rate:** % of started recordings that get submitted
3. **File sizes:** Average video size (target: 3-5MB)
4. **Error rate:** % of recording attempts that fail

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Safari codec issues | Medium | Medium | Detect Safari, use MP4 fallback |
| Users record too long | Medium | Low | Hard 3-min limit with countdown |
| Large file uploads timeout | Medium | Medium | Chunked upload for files >5MB |
| Privacy concerns | Low | High | Clear screen selection UI, no auto-record |
| Storage costs | Low | Medium | 10MB limit, cleanup old recordings |

---

## Open Items

- [ ] Storage bucket configuration for video files
- [ ] CDN caching strategy for video playback
- [ ] Analytics tracking for recording usage
- [ ] Documentation for users

---

## Approval

- [ ] Plan reviewed
- [ ] Storage/infrastructure confirmed
- [ ] Ready to implement

**Estimated effort:** 4 days
**Target completion:** TBD

