import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface UpdateEmployeeData {
  employee_id: string;
  username?: string;
  password?: string;
  full_name?: string;
  full_name_ar?: string;
  email?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
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

    const updateData: UpdateEmployeeData = await req.json();

    const { data: existingEmployee, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('email, username')
      .eq('id', updateData.employee_id)
      .single();

    if (fetchError || !existingEmployee) {
      return new Response(
        JSON.stringify({ error: 'Employee not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const updates: any = {};
    if (updateData.full_name !== undefined) updates.full_name = updateData.full_name;
    if (updateData.full_name_ar !== undefined) updates.full_name_ar = updateData.full_name_ar;
    if (updateData.phone !== undefined) updates.phone = updateData.phone;
    if (updateData.role !== undefined) updates.role = updateData.role;
    if (updateData.is_active !== undefined) updates.is_active = updateData.is_active;

    if (updateData.username !== undefined && updateData.username !== existingEmployee.username) {
      const oldEmail = existingEmployee.email || `${existingEmployee.username}@bookati.local`;
      const newEmail = updateData.email || `${updateData.username}@bookati.local`;

      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        updateData.employee_id,
        { email: newEmail }
      );

      if (authUpdateError) {
        return new Response(
          JSON.stringify({ error: `Auth update failed: ${authUpdateError.message}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      updates.username = updateData.username;
      updates.email = updateData.email || null;
    }

    if (updateData.password) {
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        updateData.employee_id,
        { password: updateData.password }
      );

      if (passwordError) {
        return new Response(
          JSON.stringify({ error: `Password update failed: ${passwordError.message}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update(updates)
        .eq('id', updateData.employee_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Employee updated successfully' }),
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