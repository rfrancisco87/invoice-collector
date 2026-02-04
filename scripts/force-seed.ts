
const { createClient } = require('@supabase/supabase-js');
const { nanoid } = require('nanoid');

// Config from .env.local
const SUPABASE_URL = 'https://dygkgeqizcgxqzljqphr.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z2tnZXFpemNneHF6bGpxcGhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMzMDA4NSwiZXhwIjoyMDgzOTA2MDg1fQ.qjeEMWzTGsFx5_e4aMMIGkQLY8RRaVipx5AyNVAh27k';

async function main() {
    console.log('Initializing admin client...');
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('Failed to list users:', userError);
        return;
    }

    // Assume the first user or specific ID
    const userId = 'f0321369-38aa-42dd-a3d1-e728f9b85989';
    const targetUser = users.find((u: any) => u.id === userId);

    if (!targetUser) {
        console.error(`User ${userId} not found in user list. Using first available: ${users[0]?.id}`);
    }

    const finalUserId = targetUser ? targetUser.id : users[0].id;
    console.log(`Seeding for user: ${finalUserId}`);

    // Create a fake invoice record
    const fakeInvoice = {
        user_id: finalUserId,
        email_message_id: `demo_${Date.now()}`,
        file_hash: `demo_hash_${Date.now()}`,
        filename: 'fatura-casadamoeda.pdf',
        subject: 'Fatura Casa da Moeda',
        sender: 'contacto@casadamoeda.com',
        sender_domain: 'casadamoeda.com',
        received_date: new Date().toISOString(),
        status: 'pending',
        source: 'gmail', // Changed from upload due to constraint
        confidence_score: 1.0,

        // Required DB Fields
        original_classification: 'invoice',
        final_classification: 'invoice',

        // Extracted Data per User Request
        invoice_number: 'FR/123456789',
        supplier_name: 'Casa da Moeda Lda',
        invoice_total: 100.00,
        total_vat: 23.00,
        total_without_vat: 77.00,
        currency: 'EUR',
        issue_date: new Date().toISOString().split('T')[0],
        // extract_data removed
    };

    const { data, error } = await supabase
        .from('documents')
        .insert(fakeInvoice)
        .select()
        .single();

    if (error) {
        console.error('Force seed failed:', error);
    } else {
        console.log('✅ Force seed successful!');
        console.log('Document ID:', data.id);
    }
}

main();
