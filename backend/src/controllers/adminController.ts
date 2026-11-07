import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/db';
import { AuthRequest } from '../types';

export async function createSecurityOfficer(req: AuthRequest, res: Response): Promise<void> {
  const { email, password, full_name, badge_number } = req.body ?? {};
  if (!email || !password || !full_name) {
    res.status(400).json({ error: 'email, password and full_name are required' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  const { data: existing } = await supabase.from('users').select('id').eq('email', normalizedEmail).maybeSingle();
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const password_hash = await bcrypt.hash(String(password), 10);
  const { error } = await supabase.from('users').insert({
    email: normalizedEmail,
    password_hash,
    full_name,
    role: 'security',
    badge_number: badge_number ?? null,
  });

  if (error) {
    res.status(500).json({ error: 'Failed to create security officer' });
    return;
  }
  res.status(201).json({ message: 'Security Officer account created successfully' });
}
