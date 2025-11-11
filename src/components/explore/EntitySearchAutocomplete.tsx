'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, ArrowRight, UserCircle, Users, Bot, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/shared/Avatar'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface ApiEntity {
  id: string
  name: string
  username?: string
  bio?: string
  description?: string
  imageUrl?: string
}

interface RegistryEntity {
  type: 'user' | 'actor' | 'agent' | 'app'
  id: string
  name: string
  username?: string
  bio?: string
  description?: string
  imageUrl?: string
}

interface EntitySearchAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  compact?: boolean
  onNavigate?: () => void
}

export function EntitySearchAutocomplete({ 
  value, 
  onChange, 
  placeholder = 'Search...', 
  className, 
  compact = false,
  onNavigate
}: EntitySearchAutocompleteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [suggestions, setSuggestions] = useState<RegistryEntity[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false) // Track if user has interacted
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Get current tab from URL if on explore page
  const getCurrentTab = () => {
    if (pathname === '/explore') {
      const tab = searchParams.get('tab')
      return tab === 'registry' ? 'registry' : 'feed'
    }
    return 'feed' // Default to feed for other pages
  }

  // Fetch suggestions when search value changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      // If user hasn't interacted, don't show anything
      if (!hasInteracted) {
        setSuggestions([])
        setIsOpen(false)
        return
      }

      // If user interacted but field is empty, show dropdown (for "Browse All" option)
      if (!value.trim()) {
        setSuggestions([])
        setIsOpen(true)
        return
      }

      // Fetch suggestions for any non-empty text (even 1 character)
      setLoading(true)
      try {
        // Fetch from registry API to get all entity types
        const response = await fetch(`/api/registry/all?search=${encodeURIComponent(value)}`)
        if (response.ok) {
          const data = await response.json()
          
          // Combine all entities and limit to top 10
          const allEntities: RegistryEntity[] = [
            ...(data.users || []).map((u: ApiEntity) => ({
              type: 'user' as const,
              id: u.id,
              name: u.name,
              username: u.username,
              bio: u.bio,
              imageUrl: u.imageUrl
            })),
            ...(data.actors || []).map((a: ApiEntity) => ({
              type: 'actor' as const,
              id: a.id,
              name: a.name,
              username: a.username,
              description: a.description,
              imageUrl: a.imageUrl
            })),
            ...(data.agents || []).map((a: ApiEntity) => ({
              type: 'agent' as const,
              id: a.id,
              name: a.name,
              username: a.username,
              description: a.description,
              imageUrl: a.imageUrl
            })),
            ...(data.apps || []).map((a: ApiEntity) => ({
              type: 'app' as const,
              id: a.id,
              name: a.name,
              description: a.description,
              imageUrl: a.imageUrl
            }))
          ].slice(0, 10) // Limit to 10 results
          
          setSuggestions(allEntities)
          setIsOpen(true)
          setSelectedIndex(-1)
        }
      } catch (error) {
        console.error('Failed to fetch suggestions:', error)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(fetchSuggestions, 300)
    return () => clearTimeout(timer)
  }, [value, hasInteracted])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'Enter' && value.trim()) {
        // Navigate to explore page with search query, preserving current tab
        const currentTab = getCurrentTab()
        router.push(`/explore?q=${encodeURIComponent(value)}&tab=${currentTab}`)
        onNavigate?.()
        setIsOpen(false)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < suggestions.length ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex === -1) {
          // First option: search all, preserve current tab
          const currentTab = getCurrentTab()
          router.push(`/explore?q=${encodeURIComponent(value)}&tab=${currentTab}`)
          onNavigate?.()
          setIsOpen(false)
        } else if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          // Navigate to selected entity
          const entity = suggestions[selectedIndex]
          if (entity) {
            handleEntityClick(entity)
          }
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        break
    }
  }, [isOpen, selectedIndex, suggestions, value, router, onNavigate, onChange, pathname, searchParams])

  const handleEntityClick = (entity: RegistryEntity) => {
    // Navigate based on entity type
    if (entity.type === 'user' && entity.username) {
      router.push(`/profile/${entity.username}`)
    } else {
      // For non-users or users without username, go to explore with search
      // TODO: The actor/agents should probably also have a profile page, so we can redirect to it.
      router.push(`/explore?q=${encodeURIComponent(entity.name)}&tab=registry`)
    }
    onNavigate?.()
    setIsOpen(false)
    onChange('')
  }

  const handleSearchAllClick = () => {
    const currentTab = getCurrentTab()
    router.push(`/explore?q=${encodeURIComponent(value)}&tab=${currentTab}`)
    onNavigate?.()
    setIsOpen(false)
  }

  const handleBrowseAllClick = () => {
    // Navigate to registry tab with no query to show all entities
    router.push('/explore?tab=registry')
    onNavigate?.()
    setIsOpen(false)
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div className={cn(
        'absolute top-1/2 -translate-y-1/2 pointer-events-none z-10',
        compact ? 'left-3' : 'left-4'
      )}>
        <Search className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4', 'text-primary')} />
      </div>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setHasInteracted(true) // Mark as interacted when user types
          onChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setHasInteracted(true) // Mark as interacted when user focuses
          // Show dropdown if there's text with suggestions, OR if field is empty (for "Browse All")
          if ((value.trim() && suggestions.length > 0) || !value.trim()) {
            setIsOpen(true)
          }
        }}
        className={cn(
          'w-full',
          'bg-muted/50 border border-border',
          'focus:outline-none focus:border-border',
          'transition-all duration-200',
          'text-foreground',
          compact 
            ? 'pl-9 pr-9 py-1.5 text-sm' 
            : 'pl-11 pr-10 py-2.5',
          'rounded-full'
        )}
      />
      {value && (
        <button
          onClick={() => {
            onChange('')
            setSuggestions([])
            setIsOpen(false)
          }}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 hover:bg-muted/50 p-1 transition-colors z-10',
            compact ? 'right-2' : 'right-3'
          )}
        >
          <X className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4', 'text-muted-foreground')} />
        </button>
      )}
      
      {/* Autocomplete dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden max-h-[400px] overflow-y-auto">
          {/* Show "Browse All Registry" when field is empty */}
          {!value.trim() ? (
            <button
              onClick={handleBrowseAllClick}
              className={cn(
                'w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left',
                'bg-muted/20'
              )}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Browse All Registry
                </p>
                <p className="text-xs text-muted-foreground">
                  View all users, agents, actors & apps
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ) : (
            <>
              {/* Search all option (when there's text) */}
              <button
                onClick={handleSearchAllClick}
                className={cn(
                  'w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border',
                  selectedIndex === -1 && 'bg-muted/50'
                )}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Search for &quot;{value}&quot;
                  </p>
                  <p className="text-xs text-muted-foreground">
                    See all results
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>

              {/* Loading state */}
              {loading && (
                <div className="px-4 py-8 text-center">
                  <div className="text-sm text-muted-foreground">Searching...</div>
                </div>
              )}

              {/* Entity suggestions */}
              {!loading && suggestions.length > 0 && (
                <div className="py-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Results
                  </div>
                  {suggestions.map((entity, index) => {
                const getEntityIcon = () => {
                  switch (entity.type) {
                    case 'user': return <UserCircle className="w-4 h-4" />
                    case 'actor': return <Users className="w-4 h-4" />
                    case 'agent': return <Bot className="w-4 h-4" />
                    case 'app': return <Building2 className="w-4 h-4" />
                  }
                }
                
                const getEntityBadgeColor = () => {
                  switch (entity.type) {
                    case 'user': return 'bg-blue-500/10 text-blue-500'
                    case 'actor': return 'bg-purple-500/10 text-purple-500'
                    case 'agent': return 'bg-green-500/10 text-green-500'
                    case 'app': return 'bg-orange-500/10 text-orange-500'
                  }
                }

                const getEntityLabel = () => {
                  switch (entity.type) {
                    case 'user': return 'User'
                    case 'actor': return 'Actor'
                    case 'agent': return 'Agent'
                    case 'app': return 'App'
                  }
                }

                return (
                  <button
                    key={entity.id}
                    onClick={() => handleEntityClick(entity)}
                    className={cn(
                      'w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left',
                      selectedIndex === index && 'bg-muted/50'
                    )}
                  >
                    <Avatar
                      src={entity.imageUrl || undefined}
                      name={entity.name}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {entity.name}
                        </p>
                        <span className={cn(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-medium shrink-0',
                          getEntityBadgeColor()
                        )}>
                          {getEntityIcon()}
                          {getEntityLabel()}
                        </span>
                      </div>
                      {entity.username && (
                        <p className="text-xs text-muted-foreground truncate">
                          @{entity.username}
                        </p>
                      )}
                      {!entity.username && (entity.bio || entity.description) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {entity.bio || entity.description}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                )
              })}
            </div>
          )}

          {/* No results */}
          {!loading && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No results found</p>
            </div>
          )}
            </>
          )}
        </div>
      )}

      <style jsx>{`
        input::placeholder {
          color: hsl(var(--muted-foreground));
          opacity: 0.6;
        }
      `}</style>
    </div>
  )
}

