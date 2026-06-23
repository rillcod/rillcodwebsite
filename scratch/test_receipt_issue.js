require('dotenv').config({ path: '.env.local' });
const { issueReceiptForTransaction } = require('../src/lib/finance/issue');

async function run() {
    const txIds = [
        '65689c1d-6ff9-47fa-9da9-5f4925eef7ec',
        '69267a6e-9d43-4635-8ef3-c130a9a15cd7'
    ];

    for (const txId of txIds) {
        console.log(`\n--- Issuing receipt for transaction ${txId} ---`);
        try {
            const res = await issueReceiptForTransaction(txId);
            console.log(`Success! URL: ${res.url}`);
            console.log(`Stream: ${res.stream}`);
            console.log(`Receipt Number: ${res.receiptNumber}`);
        } catch (err) {
            console.error('Error generating receipt:', err);
        }
    }
}

run();
