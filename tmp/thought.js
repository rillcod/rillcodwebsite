const fetch = require('node-fetch');

async function testCreate() {
    const payload = {
        name: 'DashboardAutoTest_' + Date.now(),
        schoolType: 'PRIMARY',
        email: 'test' + Date.now() + '@example.com',
        status: 'approved'
    };

    console.log('Testing creation via API /api/schools...');
    const res = await fetch('http://localhost:3000/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (res.ok) {
        console.log('API Success! ID:', json.school.id);
        // Now check if it's in the list
        const listRes = await fetch('http://localhost:3000/api/schools');
        const listJson = await listRes.json();
        const found = listJson.data?.find(s => s.id === json.school.id);
        if (found) {
            console.log('Verified: School is in the list from API.');
        } else {
            console.error('CRITICAL: School was created but is NOT in the list!');
        }
    } else {
        console.error('API Error:', json.error);
    }
}

// Note: This script assumes the server is running on localhost:3000
// and might fail if Auth is enforced (GET requires admin).
// Since I can't fake the session easily here, I'll use the DB directly instead.
// But wait, the user said it IS created in school management.
// So the API is returning it.

console.log('User says it shows in School Management. This means /api/schools returns it.');
console.log('User says it is NOT on database. This is a paradox if /api/schools returns it.');
console.log('Maybe they are looking at the WRONG database or table.');
