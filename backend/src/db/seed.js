const bcrypt = require('bcryptjs');
const pool = require('../config/db');
require('dotenv').config();

async function seed() {
  const [[role]] = await pool.query("SELECT id FROM roles WHERE code = 'SUPER_ADMIN'");
  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role_id, status)
     VALUES (?, ?, 'Super', 'Admin', ?, 'active')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    ['superadmin@academia-portal.local', passwordHash, role.id]
  );

  const [[existingRegion]] = await pool.query("SELECT id FROM regions WHERE code = 'ME'");
  if (!existingRegion) {
    await pool.query("INSERT INTO regions (name, code) VALUES ('Middle East', 'ME'), ('Africa', 'AF'), ('South Asia', 'SA')");
  }

  console.log('Seed complete. Super Admin login: superadmin@academia-portal.local / ChangeMe123!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
