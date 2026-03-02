const fs = require('fs');

const data = fs.readFileSync('database/remote_schema_truth.sql', 'utf8');
const policies = data.match(/CREATE POLICY[\s\S]*?;/g);

let count = 0;
if (policies) {
    for (const pol of policies) {
        if (pol.includes('portal_users')) {
            console.log('POLICY WITH PORTAL_USERS:', pol.replace(/\s+/g, ' '));
            count++;
        }
    }
}
console.log('Total:', count);
