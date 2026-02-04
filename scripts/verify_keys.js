
const fs = require('fs');
const path = require('path');

function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}

try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');

    let anonKey = '';
    let serviceKey = '';

    envFile.split('\n').forEach(line => {
        if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
            anonKey = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
        }
        if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
            serviceKey = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
        }
    });

    console.log("--- KEY ANALYSIS ---");

    if (anonKey) {
        const decoded = parseJwt(anonKey);
        console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY role: ${decoded.role}`);
        if (decoded.role === 'service_role') console.log("⚠️ CRITICAL: PUBLIC KEY IS ACTUALLY SERVICE_ROLE KEY!");
    }

    if (serviceKey) {
        const decoded = parseJwt(serviceKey);
        console.log(`SUPABASE_SERVICE_ROLE_KEY role:     ${decoded.role}`);
        if (decoded.role === 'anon') console.log("⚠️ ERROR: SERVICE KEY IS ACTUALLY ANON KEY!");
    }

} catch (e) {
    console.error(e);
}
