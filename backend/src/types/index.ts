import { Request } from 'express';

export type UserRole = 'citizen' | 'security' | 'admin';
export type IncidentStatus = 'active' | 'responding' | 'resolved';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  badge_number?: string | null;
  expo_push_token?: string | null;
  last_latitude?: number | null;
  last_longitude?: number | null;
}

export interface Incident {
  id: string;
  victim_id: string;
  victim_name: string;
  latitude: number;
  longitude: number;
  incident_type: string;
  description: string;
  status: IncidentStatus;
  assigned_security_id?: string | null;
  created_at: string;
}

export interface JwtUserPayload {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: JwtUserPayload;
}
