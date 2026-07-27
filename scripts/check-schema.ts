
const { adminClient } = require('./_supabase');

async function main() {
    // Note: We cannot query information_schema easily via supabase-js client on public schema usually, 
    // unless we use RPC or direct connection. 
    // But we can try to insert a row with NULL gmail_account_id and see the error message.

    // Actually, let's try to query the migration table or just test the Insert directly.

    const supabase = adminClient();

    // Try to insert a dummy record that violates potential NOT NULL constraint on gmail_account_id
    // We'll use a fake user_id (Service key allows it if we bypass RLS or simply use a valid user if we have one)
    // We'll grab a user id first

    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers(); // Admin API needs service key

    if (userError || !users || users.length === 0) {
        console.log('No users found to test with.');
        return;
    }

    const testUserId = users[0].id;
    console.log(`Testing with user: ${testUserId}`);

    const fakeDoc = {
        user_id: testUserId,
        email_message_id: `test_schema_${Date.now()}`,
        file_hash: `test_hash_${Date.now()}`,
        filename: 'schema_test.pdf',
        original_classification: 'invoice',
        final_classification: 'invoice',
        received_date: new Date().toISOString(),
        // gmail_account_id: MISSING (should be allowed if nullable)
    };

    const { data, error } = await supabase.from('documents').insert(fakeDoc).select().single();

    if (error) {
        console.error('Insert failed:', error);
        if (error.message.includes('gmail_account_id') && error.message.includes('null value')) {
            console.log('❌ RESULT: gmail_account_id is NOT NULL (Migration not applied!)');
        } else {
            console.log('❌ RESULT: Insert failed for other reason.');
        }
    } else {
        console.log('✅ RESULT: Insert successful. gmail_account_id is Nullable.');
        // Cleanup
        await supabase.from('documents').delete().eq('id', data.id);
    }
}

main();
