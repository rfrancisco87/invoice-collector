
const { createClient } = require('@supabase/supabase-js');

// Config from .env.local (Swapped keys noted: ANON_KEY contains service_role)
const SUPABASE_URL = 'https://dygkgeqizcgxqzljqphr.supabase.co';
// Using the key that has "service_role" in it (from NEXT_PUBLIC_SUPABASE_ANON_KEY in env)
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z2tnZXFpemNneHF6bGpxcGhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMzMDA4NSwiZXhwIjoyMDgzOTA2MDg1fQ.qjeEMWzTGsFx5_e4aMMIGkQLY8RRaVipx5AyNVAh27k';
const WEBHOOK_URL = 'http://localhost:3000/api/inbound-email';

async function main() {
    console.log('1. Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    console.log('2. Fetching user settings...');
    const { data: settings, error } = await supabase
        .from('user_settings')
        .select('inbound_email, user_id')
        .neq('inbound_email', null)
        .limit(1)
        .single();

    if (error || !settings) {
        console.error('Error fetching settings:', error);
        return;
    }

    const inboundEmail = settings.inbound_email;
    console.log(`Found inbound email: ${inboundEmail} (User: ${settings.user_id})`);

    console.log('3. Simulating Webhook Request...');

    // Sample PDF Content (Empty PDF for test)
    // Minimal PDF header
    const pdfContent = '%PDF-1.4\n%\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n3 0 obj\n<</Type/Page/MediaBox[0 0 595 842]>>\nendobj\ntrailer\n<</Size 4/Root 1 0 R>>\n%%EOF';
    const pdfBuffer = Buffer.from(pdfContent);

    const payload = {
        from: 'test-sender@example.com',
        to: [inboundEmail],
        subject: 'Test Inbound Invoice',
        html: '<p>Please process this invoice.</p>',
        text: 'Please process this invoice.',
        attachments: [
            {
                filename: 'test-invoice.pdf',
                content: pdfBuffer,
                type: 'application/pdf',
                size: pdfBuffer.length
            }
        ]
    };

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('Webhook Response:', JSON.stringify(result, null, 2));

        if (response.ok && result.success) {
            console.log('✅ SUCCESS: Inbound email processed correctly.');
        } else {
            console.log('❌ FAILED: Webhook returned error.');
        }

    } catch (err: any) {
        console.error('❌ Request Failed:', err.cause || err);
    }
}

main();
