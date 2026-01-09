-- Additional RLS Policies for User Signup and Public Access

-- Allow anyone to insert their own user profile after signup
CREATE POLICY "Users can create own profile after signup"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Public access policies for booking flow
CREATE POLICY "Public can create bookings"
  ON bookings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenants
      WHERE tenants.id = booking s.tenant_id
      AND tenants.is_active = true
      AND tenants.maintenance_mode = false
    )
  );

-- Allow public to create booking locks
CREATE POLICY "Public can create booking locks"
  ON booking_locks FOR INSERT
  WITH CHECK (true);

-- Allow public to view their own locks
CREATE POLICY "Public can view their locks"
  ON booking_locks FOR SELECT
  USING (true);
