import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateSlotsRequest {
  shift_id: string;
  start_date: string;
  end_date: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const requestData: GenerateSlotsRequest = await req.json();
    const { shift_id, start_date, end_date } = requestData;

    if (!shift_id || !start_date || !end_date) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: shift_id, start_date, end_date" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call the database function which handles all capacity logic
    const { data: result, error: funcError } = await supabaseAdmin
      .rpc("generate_slots_for_shift", {
        p_shift_id: shift_id,
        p_start_date: start_date,
        p_end_date: end_date,
      });

    if (funcError) {
      console.error("Function error:", funcError);
      return new Response(
        JSON.stringify({ error: funcError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if the function returned an error
    if (result && !result.success) {
      return new Response(
        JSON.stringify({
          error: result.error,
          details: result
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        slots_generated: result.slots_generated || 0,
        capacity_mode: result.capacity_mode,
        slot_capacity: result.slot_capacity,
        shift_duration_minutes: result.shift_duration_minutes,
        service_duration_minutes: result.service_duration_minutes,
        message: `Generated ${result.slots_generated || 0} slots using ${result.capacity_mode} capacity mode`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
