import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ServiceShiftAssignment {
  serviceId: string;
  shiftIds: string[];
  durationMinutes?: number;
  capacityPerSlot?: number;
}

interface EmployeeData {
  username: string;
  password: string;
  full_name: string;
  full_name_ar?: string;
  email?: string;
  phone?: string;
  role: string;
  tenant_id: string;
  service_shift_assignments?: ServiceShiftAssignment[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const employeeData: EmployeeData = await req.json();

    const emailForAuth = employeeData.email || `${employeeData.username}@bookati.local`;

    const { data: authUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: emailForAuth,
      password: employeeData.password,
      email_confirm: true,
      user_metadata: {
        username: employeeData.username,
        full_name: employeeData.full_name,
        full_name_ar: employeeData.full_name_ar || '',
      },
    });

    if (createAuthError) {
      return new Response(
        JSON.stringify({ error: createAuthError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.user.id,
        username: employeeData.username,
        full_name: employeeData.full_name,
        full_name_ar: employeeData.full_name_ar || '',
        email: employeeData.email,
        phone: employeeData.phone,
        role: employeeData.role,
        tenant_id: employeeData.tenant_id,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (employeeData.role === 'employee' && employeeData.service_shift_assignments && employeeData.service_shift_assignments.length > 0) {
      const assignments: any[] = [];
      employeeData.service_shift_assignments.forEach(serviceAssignment => {
        if (serviceAssignment.shiftIds.length > 0) {
          serviceAssignment.shiftIds.forEach(shift_id => {
            assignments.push({
              employee_id: newUser.id,
              service_id: serviceAssignment.serviceId,
              shift_id,
              tenant_id: employeeData.tenant_id,
              duration_minutes: serviceAssignment.durationMinutes,
              capacity_per_slot: serviceAssignment.capacityPerSlot,
            });
          });
        }
      });
      if (assignments.length > 0) {
        await supabaseAdmin.from('employee_services').insert(assignments);
      }
    }

    return new Response(
      JSON.stringify({ user: newUser }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});