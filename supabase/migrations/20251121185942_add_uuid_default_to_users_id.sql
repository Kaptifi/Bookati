/*
  # Add UUID Default to Users ID Column

  1. Problem
    - The users table id column has no default value
    - Inserting new users fails with "null value in column 'id'"

  2. Solution
    - Add gen_random_uuid() as default for id column
    - This will auto-generate UUIDs for new users

  3. Security
    - No security changes
    - Only adds default value for primary key
*/

-- Add default UUID generation to users.id
ALTER TABLE users 
ALTER COLUMN id SET DEFAULT gen_random_uuid();
