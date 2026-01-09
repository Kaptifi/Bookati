/*
  # Fix handle_new_user function role casting
  
  1. Changes
    - Update handle_new_user() function to properly cast role to user_role enum type
    - Change from `::text` to `::user_role` to match column type
    - Maintains same default value of 'customer' if role is not provided
*/

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
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer'::user_role),
    COALESCE((NEW.raw_user_meta_data->>'tenant_id')::uuid, NULL),
    COALESCE((NEW.raw_user_meta_data->>'phone'), NULL),
    true
  );
  RETURN NEW;
END;
$$;
