import { Response } from 'express';
import { supabase } from '../config/db';
import { AuthRequest, User } from '../types';
import { calculateDistanceKm } from '../utils/geo';
import { sendExpoPushNotifications } from '../utils/notifications';

const RADIUS_KM = 10;

export async function createIncident(req: AuthRequest, res: Response): Promise<void> {
  const { latitude, longitude, incident_type, description } = req.body ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ error: 'latitude and longitude must be numbers' });
    return;
  }

  const { data: victim } = await supabase.from('users').select('full_name').eq('id', req.user!.id).single();
  if (!victim) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      victim_id: req.user!.id,
      victim_name: victim.full_name,
      latitude,
      longitude,
      incident_type: incident_type || 'Distress Alert',
      description: description || '',
      status: 'active',
    })
    .select()
    .single();

  if (error || !incident) {
    res.status(500).json({ error: 'Failed to save incident' });
    return;
  }

  const { data: officers } = await supabase
    .from('users')
    .select('expo_push_token,last_latitude,last_longitude')
    .eq('role', 'security')
    .not('expo_push_token', 'is', null);

  const all = (officers ?? []) as Pick<User, 'expo_push_token' | 'last_latitude' | 'last_longitude'>[];
  const nearby = all.filter(
    (o) =>
      o.last_latitude != null &&
      o.last_longitude != null &&
      calculateDistanceKm(latitude, longitude, o.last_latitude, o.last_longitude) <= RADIUS_KM
  );
  const targets = nearby.length > 0 ? nearby : all;
  const tokens = targets.map((o) => o.expo_push_token as string);

  await sendExpoPushNotifications(
    tokens,
    '🚨 DISTRESS ALERT',
    `${incident.incident_type} reported by ${incident.victim_name}`,
    { incident_id: incident.id, latitude, longitude, incident_type: incident.incident_type, victim_name: incident.victim_name }
  );

  res.status(201).json({ message: 'Distress alert broadcasted to nearest responders', incident });
}

export async function getIncidents(_req: AuthRequest, res: Response): Promise<void> {
  const { data, error } = await supabase.from('incidents').select('*').order('created_at', { ascending: false });
  if (error) {
    res.status(500).json({ error: 'Failed to fetch incidents' });
    return;
  }
  res.json(data);
}

export async function updateIncidentStatus(req: AuthRequest, res: Response): Promise<void> {
  const { status } = req.body ?? {};
  if (status !== 'responding' && status !== 'resolved') {
    res.status(400).json({ error: "status must be 'responding' or 'resolved'" });
    return;
  }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (req.user!.role === 'security') update.assigned_security_id = req.user!.id;

  const { data, error } = await supabase
    .from('incidents')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: 'Failed to update incident' });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  res.json(data);
}
