'use client'

import { cn } from '@/lib/utils'

interface TaggedTextProps {
  text: string
  onTagClick?: (tag: string) => void
  className?: string
}

/**
 * Component that parses and highlights @mentions, #hashtags, and $cashtags
 * Tags are clickable and styled in blue
 */
export function TaggedText({ text, onTagClick, className }: TaggedTextProps) {
  // Handle null, undefined, or non-string text - return plain text
  if (!text || typeof text !== 'string') {
    return <span className={className}>{text || ''}</span>
  }

  // Handle empty string
  if (text.length === 0) {
    return <span className={className}></span>
  }

  // Regex to match @mentions, #hashtags, and $cashtags
  // Matches: @username, #hashtag, $cashtag, $19.99
  // Captures everything until a space (allows periods, hyphens, numbers, etc.)
  const tagRegex = /(@|#|\$)([^\s]+)/g

  const parts: Array<{ text: string; isTag: boolean; tagType?: '@' | '#' | '$' }> = []
  let lastIndex = 0
  let match

  // Reset regex lastIndex to start from beginning
  tagRegex.lastIndex = 0

  while ((match = tagRegex.exec(text)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isTag: false,
      })
    }

    // Add the tag
    const fullTag = match[0] // e.g., "@username" or "#hashtag" or "$cashtag"
    const tagType = match[1] as '@' | '#' | '$'
    parts.push({
      text: fullTag,
      isTag: true,
      tagType,
    })

    lastIndex = match.index + fullTag.length
  }

  // Add remaining text after last tag (or all text if no tags found)
  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      isTag: false,
    })
  }

  // If no tags found, return plain text
  if (parts.length === 0 || (parts.length === 1 && !parts[0]?.isTag)) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.isTag) {
          return (
            <span
              key={index}
              onClick={(e) => {
                e.stopPropagation()
                if (onTagClick) {
                  onTagClick(part.text)
                }
              }}
              className={cn(
                'text-[#1c9cf0] hover:text-[#1a8cd8] cursor-pointer font-medium',
                'transition-colors duration-150',
                'underline decoration-[#1c9cf0]/30 hover:decoration-[#1c9cf0]/50'
              )}
              style={{ color: '#1c9cf0' }}
            >
              {part.text}
            </span>
          )
        }
        return <span key={index}>{part.text}</span>
      })}
    </span>
  )
}

