// API calls use relative paths — proxied by Next.js rewrites to backend
export function getApiBaseUrl() {
  return '';
}

// 认证相关 API
export const authApi = {
  // 登录
  login: async (username: string, password: string) => {
    const formBody = new URLSearchParams();
    formBody.append('username', username);
    formBody.append('password', password);

    const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    if (!response.ok) {
      throw new Error('登录失败');
    }

    return response.json();
  },

  // 注册
  register: async (data: {
    username: string;
    email: string;
    password: string;
    full_name?: string;
  }) => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '注册失败');
    }

    return response.json();
  },

  // 获取当前用户
  getCurrentUser: async (token: string) => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取用户信息失败');
    }

    return response.json();
  },

  // 登出
  logout: async (token: string) => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('登出失败');
    }

    return response.json();
  },
};

// Token 管理
export const tokenManager = {
  getToken: () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  },

  setToken: (token: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  },

  removeToken: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  },

  isAuthenticated: () => {
    return !!tokenManager.getToken();
  },
};
