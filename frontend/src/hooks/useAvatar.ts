import { useState, useEffect, useCallback } from 'react';

interface UseAvatarReturn {
  avatar: string | null;
  isLoading: boolean;
  error: string | null;
  uploadAvatar: (avatarData: string, avatarType: string) => Promise<void>;
  deleteAvatar: () => Promise<void>;
  refreshAvatar: () => Promise<void>;
}

export function useAvatar(userId?: number): UseAvatarReturn {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8002';

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }, []);

  const refreshAvatar = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/profile/avatar`, {
        headers: getHeaders()
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setAvatar(data.avatar_data || null);
    } catch (err: any) {
      console.error('Failed to load avatar:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, getHeaders]);

  const uploadAvatar = useCallback(async (avatarData: string, avatarType: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/profile/avatar`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ avatar_data: avatarData, avatar_type: avatarType })
      });

      if (!response.ok) {
        throw new Error('Failed to upload avatar');
      }

      setAvatar(avatarData);
    } catch (err: any) {
      console.error('Failed to upload avatar:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, getHeaders]);

  const deleteAvatar = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/profile/avatar`, {
        method: 'DELETE',
        headers: getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete avatar');
      }

      setAvatar(null);
    } catch (err: any) {
      console.error('Failed to delete avatar:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, getHeaders]);

  // Load avatar on mount
  useEffect(() => {
    refreshAvatar();
  }, [refreshAvatar]);

  return {
    avatar,
    isLoading,
    error,
    uploadAvatar,
    deleteAvatar,
    refreshAvatar
  };
}
