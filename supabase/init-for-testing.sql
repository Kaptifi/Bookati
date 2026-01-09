-- Quick Initialization Script for Testing Bookati
-- Run this entire script in Supabase SQL Editor

-- This script will:
-- 1. Create a Solution Owner account
-- 2. Create a test tenant
-- 3. Set up initial data for testing

-- ============================================
-- PART 1: Check if tables exist
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN
    RAISE EXCEPTION 'Tables not found! Please run setup.sql first.';
  END IF;
END $$;

-- ============================================
-- PART 2: Create Solution Owner
-- ============================================
-- NOTE: You still need to create the auth user first via Supabase Dashboard
-- Go to Authentication > Users > Add User
-- Email: admin@bookati.local
-- Password: (your choice)
-- Then come back and run this script

-- After creating auth user, insert profile:
-- Replace 'YOUR-AUTH-USER-ID' with the actual ID from auth.users table

/*
INSERT INTO users (id, email, full_name, role, is_active)
VALUES (
  'YOUR-AUTH-USER-ID',  -- GET THIS FROM: SELECT id FROM auth.users WHERE email = 'admin@bookati.local';
  'admin@bookati.local',
  'Solution Owner',
  'solution_owner',
  true
)
ON CONFLICT (id) DO NOTHING;
*/

-- ============================================
-- PART 3: Create Test Tenant
-- ============================================
INSERT INTO tenants (
  name,
  industry,
  contact_email,
  contact_phone,
  address,
  subscription_end,
  is_active,
  public_page_enabled,
  maintenance_mode
)
VALUES (
  'Test Restaurant',
  'restaurant',
  'info@testrestaurant.com',
  '+966501234567',
  '123 King Fahd Road, Riyadh',
  (now() + interval '30 days'),
  true,
  true,
  false
)
ON CONFLICT DO NOTHING
RETURNING id, name;

-- ============================================
-- PART 4: Verify Setup
-- ============================================
-- Check tenants
SELECT
  id,
  name,
  industry,
  is_active,
  subscription_end,
  created_at
FROM tenants
ORDER BY created_at DESC
LIMIT 5;

-- Check users (will be empty until you create Solution Owner)
SELECT
  id,
  email,
  full_name,
  role,
  is_active
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Test data created successfully!';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Create auth user in Supabase Dashboard (Authentication > Users)';
  RAISE NOTICE '   2. Insert user profile with the ID from auth.users';
  RAISE NOTICE '   3. Login at /auth/login';
  RAISE NOTICE '   4. Access Solution Owner Dashboard at /admin';
END $$;
