import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { supabase } from '../config/db';
import { User } from '../types';

export function signToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'] }
  );
}

const publicUser = (u: User) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role });

export async function registerCitizen(req: Request, res: Response): Promise<void> {
  const { email, password, full_name } = req.body ?? {};
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
  const { data, error } = await supabase
    .from('users')
    .insert({ email: normalizedEmail, password_hash, full_name, role: 'citizen' })
    .select()
    .single();

  if (error || !data) {
    res.status(500).json({ error: 'Failed to register user' });
    return;
  }
  res.status(201).json({ token: signToken(data), user: publicUser(data) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', String(email).trim().toLowerCase())
    .maybeSingle();

  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}
