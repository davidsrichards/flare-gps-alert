import bcrypt from 'bcryptjs';
import { supabase } from '../config/db';
import { UserRole } from '../types';

const password = process.env.SEED_PASSWORD || 'Flare@12345';

const accounts: { email: string; full_name: string; role: UserRole; badge_number?: string }[] = [
  { email: 'admin@flare.com', full_name: 'Flare Admin', role: 'admin' },
  { email: 'officer1@flare.com', full_name: 'Officer One', role: 'security', badge_number: 'SEC-001' },
  { email: 'citizen@test.com', full_name: 'Test Citizen', role: 'citizen' },
];

async function seed(): Promise<void> {
  const password_hash = await bcrypt.hash(password, 10);
  for (const account of accounts) {
    const { error } = await supabase
      .from('users')
      .upsert({ ...account, password_hash }, { onConflict: 'email' });
    if (error) throw new Error(`Failed to seed ${account.email}: ${error.message}`);
    console.log(`Seeded ${account.role}: ${account.email}`);
  }
  console.log(`Done. Password for all seeded accounts: ${password}`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
