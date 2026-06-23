const postgres = require('postgres');

const sql = postgres('postgres://postgres:rillcod12345.@db.akaorqukdoawacvxsdij.supabase.co:5432/postgres', {
    ssl: 'require',
    max: 1
});

async function run() {
    try {
        console.log("=== COMPLETED TRANSACTIONS WITH MISSING RECEIPTS ===");
        const missingReceipts = await sql`
            SELECT 
                t.id as transaction_id,
                t.created_at,
                t.amount,
                t.payment_method,
                t.payment_status,
                t.transaction_reference,
                t.school_id,
                t.portal_user_id,
                t.invoice_id,
                i.invoice_number,
                i.stream
            FROM public.payment_transactions t
            LEFT JOIN public.invoices i ON i.id = t.invoice_id OR i.payment_transaction_id = t.id
            LEFT JOIN public.receipts r ON r.transaction_id = t.id
            WHERE t.payment_status IN ('completed', 'paid', 'success', 'Success')
              AND r.id IS NULL;
        `;
        console.table(missingReceipts);

        console.log("\n=== TRANSACTIONS WITHOUT INVOICES ===");
        const noInvoices = await sql`
            SELECT 
                id,
                created_at,
                amount,
                payment_status,
                payment_method,
                transaction_reference,
                school_id,
                portal_user_id,
                invoice_id
            FROM public.payment_transactions
            WHERE invoice_id IS NULL;
        `;
        console.log(`Found: ${noInvoices.length}`);
        console.table(noInvoices);

        console.log("\n=== COMPLETED/PAID TRANSACTIONS WITH NULL PAID_AT ===");
        const nullPaidAt = await sql`
            SELECT id, payment_status, amount, created_at, paid_at
            FROM public.payment_transactions
            WHERE payment_status IN ('completed', 'paid', 'success', 'Success') AND paid_at IS NULL;
        `;
        console.log(`Found: ${nullPaidAt.length}`);
        if (nullPaidAt.length > 0) console.table(nullPaidAt);

        console.log("\n=== PENDING BANK TRANSFERS ===");
        const pendingTransfers = await sql`
            SELECT id, payment_method, payment_status, amount, created_at, payment_gateway_response
            FROM public.payment_transactions
            WHERE payment_method IN ('bank_transfer', 'transfer') AND payment_status = 'pending'
            LIMIT 10;
        `;
        console.log(`Found: ${pendingTransfers.length}`);
        if (pendingTransfers.length > 0) console.table(pendingTransfers);

        console.log("\n=== POTENTIAL STREAM MISALIGNMENTS IN INVOICES ===");
        const invoiceStreamIssues = await sql`
            SELECT id, invoice_number, stream, school_id, portal_user_id, status, amount
            FROM public.invoices
            WHERE 
                (stream = 'individual' AND school_id IS NOT NULL AND portal_user_id IS NULL)
                OR (stream = 'school' AND school_id IS NULL)
            LIMIT 20;
        `;
        console.log(`Found: ${invoiceStreamIssues.length}`);
        if (invoiceStreamIssues.length > 0) console.table(invoiceStreamIssues);

        console.log("\n=== POTENTIAL STREAM MISALIGNMENTS IN RECEIPTS ===");
        const receiptStreamIssues = await sql`
            SELECT id, receipt_number, stream, school_id, student_id, amount
            FROM public.receipts
            WHERE 
                (stream = 'individual' AND school_id IS NOT NULL AND student_id IS NULL)
                OR (stream = 'school' AND school_id IS NULL)
            LIMIT 20;
        `;
        console.log(`Found: ${receiptStreamIssues.length}`);
        if (receiptStreamIssues.length > 0) console.table(receiptStreamIssues);

        console.log("\n=== CHECKING ALL RECEIPTS IN DB ===");
        const allReceipts = await sql`
            SELECT id, receipt_number, transaction_id, school_id, student_id, amount, stream, issued_at
            FROM public.receipts;
        `;
        console.log(`Found receipts: ${allReceipts.length}`);
        if (allReceipts.length > 0) console.table(allReceipts);

        console.log("\n=== CHECKING ALL INVOICES IN DB ===");
        const allInvoices = await sql`
            SELECT id, invoice_number, payment_transaction_id, school_id, portal_user_id, amount, stream, status
            FROM public.invoices;
        `;
        console.log(`Found invoices: ${allInvoices.length}`);
        if (allInvoices.length > 0) console.table(allInvoices);

    } catch (err) {
        console.error('Error running audit queries:', err);
    } finally {
        await sql.end();
    }
}

run();
