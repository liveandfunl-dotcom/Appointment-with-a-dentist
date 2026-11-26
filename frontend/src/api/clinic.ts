import type { Clinic } from '@clinic/shared';

import { api } from './client';

export const getClinic = () => api.get<Clinic>('/api/clinic');
