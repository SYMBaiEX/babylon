-- Check if table exists (case-insensitive) and add column
DO $$
DECLARE
    table_name_var TEXT;
BEGIN
    -- Find the actual table name (case-insensitive search)
    SELECT table_name INTO table_name_var
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND LOWER(table_name) = 'referral'
    LIMIT 1;
    
    IF table_name_var IS NOT NULL THEN
        -- Use the actual table name (with proper quoting)
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "qualifiedAt" TIMESTAMP(3)', table_name_var);
        
        -- CreateIndex
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Referral_qualifiedAt_idx') THEN
            EXECUTE format('CREATE INDEX "Referral_qualifiedAt_idx" ON %I("qualifiedAt")', table_name_var);
        END IF;
    END IF;
END $$;
