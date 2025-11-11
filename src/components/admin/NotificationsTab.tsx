'use client'

import { useState, useCallback } from 'react'
import { Bell, Send, Users, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type NotificationType = 'system' | 'comment' | 'reaction' | 'follow' | 'mention' | 'reply' | 'share'
type RecipientType = 'specific' | 'all'

export function NotificationsTab() {
  const [message, setMessage] = useState('')
  const [userId, setUserId] = useState('')
  const [type, setType] = useState<NotificationType>('system')
  const [recipientType, setRecipientType] = useState<RecipientType>('specific')
  const [sending, setSending] = useState(false)

  const handleSend = useCallback(async () => {
    if (!message.trim()) {
      toast.error('Please enter a message')
      return
    }

    if (recipientType === 'specific' && !userId.trim()) {
      toast.error('Please enter a user ID')
      return
    }

    setSending(true)

    try {
      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null

      if (!token) {
        toast.error('Not authenticated')
        setSending(false)
        return
      }

      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          type,
          ...(recipientType === 'specific' ? { userId: userId.trim() } : { sendToAll: true }),
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(data.message || 'Notification sent successfully')
        // Reset form
        setMessage('')
        setUserId('')
      } else {
        toast.error(data.message || 'Failed to send notification')
      }
    } catch (error) {
      console.error('Failed to send notification:', error)
      toast.error('Failed to send notification')
    } finally {
      setSending(false)
    }
  }, [message, userId, type, recipientType])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Send Notifications</h2>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        {/* Recipient Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Recipient</label>
          <div className="flex gap-2">
            <button
              onClick={() => setRecipientType('specific')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                recipientType === 'specific'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted'
              )}
            >
              <User className="w-4 h-4" />
              <span>Specific User</span>
            </button>
            <button
              onClick={() => setRecipientType('all')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                recipientType === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted'
              )}
            >
              <Users className="w-4 h-4" />
              <span>All Users</span>
            </button>
          </div>
        </div>

        {/* User ID (only for specific user) */}
        {recipientType === 'specific' && (
          <div>
            <label htmlFor="userId" className="block text-sm font-medium mb-2">
              User ID
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID (e.g., cm123abc...)"
              className={cn(
                'w-full px-4 py-2 rounded-lg border border-border',
                'bg-background text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground mt-1">
              You can find user IDs in the Users tab or in the database
            </p>
          </div>
        )}

        {/* Notification Type */}
        <div>
          <label htmlFor="type" className="block text-sm font-medium mb-2">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as NotificationType)}
            className={cn(
              'w-full px-4 py-2 rounded-lg border border-border',
              'bg-background text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            disabled={sending}
          >
            <option value="system">System</option>
            <option value="comment">Comment</option>
            <option value="reaction">Reaction</option>
            <option value="follow">Follow</option>
            <option value="mention">Mention</option>
            <option value="reply">Reply</option>
            <option value="share">Share</option>
          </select>
        </div>

        {/* Message */}
        <div>
          <label htmlFor="message" className="block text-sm font-medium mb-2">
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter notification message..."
            rows={4}
            maxLength={500}
            className={cn(
              'w-full px-4 py-2 rounded-lg border border-border',
              'bg-background text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'resize-none'
            )}
            disabled={sending}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {message.length}/500 characters
          </p>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={sending || !message.trim() || (recipientType === 'specific' && !userId.trim())}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
            'bg-primary text-primary-foreground font-semibold',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Send className="w-4 h-4" />
          <span>{sending ? 'Sending...' : 'Send Notification'}</span>
        </button>
      </div>

      {/* Warning */}
      {recipientType === 'all' && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            ⚠️ <strong>Warning:</strong> This will send the notification to all non-banned users.
            Make sure your message is appropriate for all users.
          </p>
        </div>
      )}

      {/* Info */}
      <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-sm">Tips:</h3>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Notifications appear in the user&apos;s notification feed</li>
          <li>System notifications are best for announcements and updates</li>
          <li>Keep messages concise and actionable (max 500 characters)</li>
          <li>Notifications won&apos;t be sent to banned users or NPCs/actors</li>
        </ul>
      </div>
    </div>
  )
}

