import 'dotenv/config';
import { createAdminClient } from '../src/lib/supabase/admin';

async function run() {
    const transactionId = '65689c1d-6ff9-47fa-9da9-5f4925eef7ec';
    const supabase = createAdminClient();

    const { data: txn, error } = await supabase
        .from('payment_transactions')
        .select(`
            *,
            courses(title, program_id),
            invoices!payment_transactions_invoice_id_fkey(
                id, invoice_number, stream, items, due_date, school_id, portal_user_id, billing_cycle_id, metadata
            ),
            portal_users:portal_user_id(full_name, email),
            schools:school_id(id, name, address, commission_rate)
        `)
        .eq('id', transactionId)
        .single();

    console.log("Error:", error);
    console.log("Txn:", txn);
}

run();
