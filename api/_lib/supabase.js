const { createClient } = require("@supabase/supabase-js");

let client;

function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !serviceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    }

    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}

module.exports = { getSupabase };
