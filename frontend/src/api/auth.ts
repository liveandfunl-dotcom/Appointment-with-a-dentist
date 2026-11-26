import { api } from './client';
import type { Me } from './types';

export const getMe = () => api.get<Me>('/api/auth/me');
export const requestMagicLink = (email: string, lang: string) => api.post('/api/auth/magic-link', { email, lang });
export const verifyMagicLink = (token: string) => api.post('/api/auth/magic-link/verify', { token });
export const loginWithPassword = (login: string, password: string) => api.post('/api/auth/login', { login, password });
export const logoutRequest = () => api.post('/api/auth/logout');
