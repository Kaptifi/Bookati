/*
  # Create employee_services junction table

  1. New Table
    - `employee_services` - Links employees to services they can provide
      - `id` (uuid, primary key)
      - `employee_id` (uuid, references users.id)
      - `service_id` (uuid, references services.id)
      - `tenant_id` (uuid, references tenants.id)
      - `created_at` (timestamptz)
      
  2. Security
    - Enable RLS on `employee_services` table
    - Add policies for tenant admins to manage employee service assignments
    
  3. Indexes
    - Composite index on employee_id and service_id
    - Index on tenant_id for filtering
*/

-- Create employee_services table
CREATE TABLE IF NOT EXISTS employee_services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(employee_id, service_id)
);

-- Enable RLS
ALTER TABLE employee_services ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view employee services in their tenant"
  ON employee_services FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT get_current_user_info.user_tenant_id
      FROM get_current_user_info()
    )
  );

CREATE POLICY "Tenant admins can insert employee services"
  ON employee_services FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_current_user_info.user_role FROM get_current_user_info()) = 'tenant_admin'
    AND tenant_id = (SELECT get_current_user_info.user_tenant_id FROM get_current_user_info())
  );

CREATE POLICY "Tenant admins can delete employee services"
  ON employee_services FOR DELETE
  TO authenticated
  USING (
    (SELECT get_current_user_info.user_role FROM get_current_user_info()) = 'tenant_admin'
    AND tenant_id = (SELECT get_current_user_info.user_tenant_id FROM get_current_user_info())
  );

CREATE POLICY "Solution owners can manage all employee services"
  ON employee_services FOR ALL
  TO authenticated
  USING (
    (SELECT get_current_user_info.user_role FROM get_current_user_info()) = 'solution_owner'
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_employee_services_employee_id ON employee_services(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_service_id ON employee_services(service_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_tenant_id ON employee_services(tenant_id);