-- Admin Roles Table for RBAC
-- This migration adds role-based access control to replace/complement the simple isAdmin boolean

CREATE TABLE IF NOT EXISTS "AdminRole" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "permissions" TEXT[],
  "grantedBy" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "grantedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "revokedAt" TIMESTAMP
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "AdminRole_role_idx" ON "AdminRole"("role");
CREATE INDEX IF NOT EXISTS "AdminRole_userId_idx" ON "AdminRole"("userId");
CREATE INDEX IF NOT EXISTS "AdminRole_grantedAt_idx" ON "AdminRole"("grantedAt");
CREATE INDEX IF NOT EXISTS "AdminRole_revokedAt_idx" ON "AdminRole"("revokedAt");

-- Migrate existing admins to the new RBAC system
-- All existing admins (isAdmin = true) become SUPER_ADMIN
INSERT INTO "AdminRole" ("id", "userId", "role", "permissions", "grantedBy", "grantedAt")
SELECT 
  'admin_role_' || "id",
  "id",
  'SUPER_ADMIN',
  ARRAY['view_stats', 'view_users', 'manage_users', 'view_trading', 'view_system', 'give_feedback', 'manage_admins', 'manage_game', 'view_reports', 'resolve_reports', 'manage_escrow'],
  "id",  -- Self-granted for migration
  NOW()
FROM "User"
WHERE "isAdmin" = true
ON CONFLICT ("userId") DO NOTHING;
