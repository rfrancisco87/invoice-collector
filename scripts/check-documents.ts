
const { createClient } = require('@supabase/supabase-js');

// Config from .env.local
const SUPABASE_URL = 'https://dygkgeqizcgxqzljqphr.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z2tnZXFpemNneHF6bGpxcGhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMzMDA4NSwiZXhwIjoyMDgzOTA2MDg1fQ.qjeEMWzTGsFx5_e4aMMIGkQLY8RRaVipx5AyNVAh27k';

async function main() {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    console.log('Checking documents...');
    // Order by processed_at as created_at does not exist on this table
    const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${documents.length} documents.`);
    documents.forEach((doc: any) => {
        console.log(`- [${doc.status}] ${doc.filename} (ID: ${doc.id})`);
        console.log(`  Source: ${doc.source}`);
        console.log(`  Invoice Number: ${doc.invoice_number}`);
        console.log(`  Total: ${doc.invoice_total}`);
    });
}

main();
