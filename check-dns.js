const dns = require('dns');

const hosts = [
    'db.akaorqukdoawacvxsdij.supabase.co',
    'db.akaorqukdoawacvxsdij.supabase.com',
    'akaorqukdoawacvxsdij.supabase.co',
    'akaorqukdoawacvxsdij.supabase.com'
];

async function check() {
    for (const host of hosts) {
        try {
            const result = await dns.promises.lookup(host);
            console.log(`✅ ${host} resolved to ${result.address}`);
        } catch (e) {
            console.log(`❌ ${host} failed: ${e.message}`);
        }
    }
}

check();
