export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const { email } = await request.json();

    if (!email || !email.includes('@') || !email.includes('.')) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400,
        headers,
      });
    }

    // Store in KV: key = email, value = timestamp
    if (env.NOTIFY_EMAILS) {
      await env.NOTIFY_EMAILS.put(email, JSON.stringify({
        email,
        subscribed: new Date().toISOString(),
        source: 'how-early-am-i',
      }));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers,
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
