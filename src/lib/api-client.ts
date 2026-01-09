const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface SignInResponse {
  user: any;
  tenant: any;
  session: {
    access_token: string;
    user: { id: string; email?: string };
  };
}

interface SignUpResponse {
  user: any;
  session: {
    access_token: string;
    user: { id: string; email?: string };
  };
}

class APIClient {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  async signIn(email: string, password: string, forCustomer: boolean = false): Promise<SignInResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, forCustomer })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Sign in failed');
    }

    const data = await response.json();

    if (data.session?.access_token) {
      localStorage.setItem('access_token', data.session.access_token);
    }

    return data;
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
    role: string,
    tenantId?: string,
    phone?: string,
    username?: string
  ): Promise<SignUpResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        role,
        tenant_id: tenantId,
        phone,
        username
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Sign up failed');
    }

    const data = await response.json();

    if (data.session?.access_token) {
      localStorage.setItem('access_token', data.session.access_token);
    }

    return data;
  }

  async signOut(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/auth/signout`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
    } finally {
      localStorage.removeItem('access_token');
    }
  }

  async getCurrentUser(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    const data = await response.json();
    return data.user;
  }

  async validateSession(): Promise<{ valid: boolean; user?: any; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/validate`, {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        return { valid: false };
      }

      return await response.json();
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  async refreshToken(): Promise<{ access_token: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();

    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token);
    }

    return data;
  }

  async updatePassword(newPassword: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/auth/update`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ password: newPassword })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update password');
    }
  }

  async checkHealth(): Promise<{ status: string; database?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      return await response.json();
    } catch (error) {
      throw new Error('Backend server is not running. Please start the server with: npm run dev (in the server directory)');
    }
  }
}

export const apiClient = new APIClient();
export default apiClient;
