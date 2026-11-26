import { api } from './client';
import type { UserCard, UserDetails } from './types';

export const listUsers = () => api.get<UserCard[]>('/api/users');
export const getUser = (id: string | number) => api.get<UserDetails>(`/api/users/${id}`);
export const createUser = (body: Record<string, unknown>) => api.post<UserDetails>('/api/users', body);
export const updateUser = (id: string | number, body: Record<string, unknown>) =>
  api.patch<UserDetails>(`/api/users/${id}`, body);
