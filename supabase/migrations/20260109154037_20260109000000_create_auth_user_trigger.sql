/*
  # Create Auth User Profile Trigger

  1. Purpose
    - Automatically create user profile in `users` table when auth user is created
    - Sync user metadata from auth.users to users table
    
  2. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only triggered by auth.users inserts
    
  3. Implementation
    - Creates trigger function to handle auth.users insert events
    - Extracts metadata from raw_user_meta_data
    - Inserts corresponding record in users table
*/

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    username,
    full_name,
    role,
    tenant_id,
    phone,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'username'), NULL),
    COALESCE((NEW.raw_user_meta_data->>'full_name'), ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::text, 'customer'),
    COALESCE((NEW.raw_user_meta_data->>'tenant_id')::uuid, NULL),
    COALESCE((NEW.raw_user_meta_data->>'phone'), NULL),
    true
  );
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();