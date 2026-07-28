
const { adminClient } = require('./_supabase');

async function main() {
    const supabase = adminClient();

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
