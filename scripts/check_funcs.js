const fs = require('fs');
const sql = fs.readFileSync('database/remote_schema_truth.sql', 'utf8');

const funcs = [
    'get_course_avg_exam_score',
    'get_course_avg_assignment_grade',
    'get_at_risk_students'
];

for (const f of funcs) {
    if (sql.includes(f)) {
        console.log(`Function ${f} exists.`);
    } else {
        console.log(`Missing function: ${f}`);
    }
}
