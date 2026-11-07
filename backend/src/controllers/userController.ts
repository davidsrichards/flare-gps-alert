import { Response } from 'express';
import { supabase } from '../config/db';
import { AuthRequest } from '../types';

export async function updateDeviceTelemetry(req: AuthRequest, res: Response): Promise<void> {
  const { expo_push_token, latitude, longitude } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (typeof expo_push_token === 'string') update.expo_push_token = expo_push_token;
  if (typeof latitude === 'number') update.last_latitude = latitude;
  if (typeof longitude === 'number') update.last_longitude = longitude;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'Provide expo_push_token and/or latitude and longitude' });
    return;
  }

  const { error } = await supabase.from('users').update(update).eq('id', req.user!.id);
  if (error) {
    res.status(500).json({ error: 'Failed to update device telemetry' });
    return;
  }
  res.json({ message: 'Device telemetry updated' });
}
