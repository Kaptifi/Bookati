import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/db';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Settings, Save, Building2, Lock, Eye, EyeOff, Mail, CheckCircle, XCircle, MessageCircle, FileText, ExternalLink } from 'lucide-react';

export function SettingsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { userProfile, tenant, user, signOut, loading: authLoading } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    name_ar: '',
    contact_email: '',
    tenant_time_zone: 'Asia/Riyadh',
    maintenance_mode: false,
  });
  const [smtpSettings, setSmtpSettings] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
  });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpTestLoading, setSmtpTestLoading] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  
  // WhatsApp settings state
  const [whatsappSettings, setWhatsappSettings] = useState({
    provider: 'meta' as 'meta' | 'twilio' | 'wati',
    api_url: '',
    api_key: '',
    phone_number_id: '',
    access_token: '',
    account_sid: '',
    auth_token: '',
    from: '',
  });
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappTestLoading, setWhatsappTestLoading] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showWhatsappToken, setShowWhatsappToken] = useState(false);

  // Zoho settings state
  const [zohoSettings, setZohoSettings] = useState({
    client_id: '',
    client_secret: '',
    redirect_uri: '',
    region: 'com',
  });
  const [zohoLoading, setZohoLoading] = useState(false);
  const [zohoTestLoading, setZohoTestLoading] = useState(false);
  const [zohoMessage, setZohoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showZohoSecret, setShowZohoSecret] = useState(false);
  const [zohoStatus, setZohoStatus] = useState<{
    has_config: boolean;
    has_tokens: boolean;
    connection_status: 'not_connected' | 'connected' | 'expired';
    token_expires_at: string | null;
  } | null>(null);

  // Access control: Redirect customers and unauthorized users
  useEffect(() => {
    if (authLoading) return; // Wait for auth to load

    if (!userProfile) {
      // Not logged in - redirect to login
      navigate('/login');
      return;
    }

    // Block customers - they should use customer dashboard
    if (userProfile.role === 'customer') {
      console.warn('[SettingsPage] Customer attempted to access admin settings, redirecting to customer dashboard');
      if (tenantSlug) {
        navigate(`/${tenantSlug}/customer/dashboard`);
      } else {
        navigate('/');
      }
      return;
    }

    // Only allow tenant_admin, receptionist, cashier, and solution_owner
    const allowedRoles = ['tenant_admin', 'receptionist', 'cashier', 'solution_owner'];
    if (!allowedRoles.includes(userProfile.role)) {
      console.warn('[SettingsPage] Unauthorized role attempted to access settings', { role: userProfile.role });
      navigate('/');
      return;
    }
  }, [userProfile, authLoading, navigate, tenantSlug]);

  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name || '',
        name_ar: tenant.name_ar || '',
        contact_email: tenant.contact_email || '',
        tenant_time_zone: tenant.tenant_time_zone || 'Asia/Riyadh',
        maintenance_mode: tenant.maintenance_mode || false,
      });
    }
  }, [tenant]);

  // Load SMTP settings
  useEffect(() => {
    async function loadSmtpSettings() {
      if (!tenant?.id) return;
      
      try {
        const token = localStorage.getItem('auth_token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${API_URL}/tenants/smtp-settings`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.smtp_settings) {
            setSmtpSettings({
              smtp_host: data.smtp_settings.smtp_host || 'smtp.gmail.com',
              smtp_port: data.smtp_settings.smtp_port || 587,
              smtp_user: data.smtp_settings.smtp_user || '',
              smtp_password: '', // Don't load password from server
            });
          }
        }
      } catch (err) {
        console.error('Error loading SMTP settings:', err);
      }
    }

    loadSmtpSettings();
  }, [tenant]);

  // Load WhatsApp settings
  useEffect(() => {
    async function loadWhatsappSettings() {
      if (!tenant?.id) return;
      
      try {
        const token = localStorage.getItem('auth_token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${API_URL}/tenants/whatsapp-settings`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.whatsapp_settings) {
            setWhatsappSettings({
              provider: data.whatsapp_settings.provider || 'meta',
              api_url: data.whatsapp_settings.api_url || '',
              api_key: data.whatsapp_settings.api_key || '',
              phone_number_id: data.whatsapp_settings.phone_number_id || '',
              access_token: '', // Don't load token from server
              account_sid: data.whatsapp_settings.account_sid || '',
              auth_token: '', // Don't load token from server
              from: data.whatsapp_settings.from || '',
            });
          }
        }
      } catch (err) {
        console.error('Error loading WhatsApp settings:', err);
      }
    }

    loadWhatsappSettings();
  }, [tenant]);

  // Load Zoho settings
  useEffect(() => {
    async function loadZohoSettings() {
      if (!tenant?.id) return;
      
      try {
        const token = localStorage.getItem('auth_token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        
        // Load config
        const configResponse = await fetch(`${API_URL}/tenants/zoho-config`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (configResponse.ok) {
          const data = await configResponse.json();
          if (data.zoho_config) {
            setZohoSettings({
              client_id: data.zoho_config.client_id || '',
              client_secret: '', // Don't load secret from server
              region: data.zoho_config.region || 'com',
            });
          }
        } else if (configResponse.status === 403) {
          const errorData = await configResponse.json();
          console.error('Access denied loading Zoho config:', errorData);
        }

        // Load status
        const statusResponse = await fetch(`${API_URL}/tenants/zoho-status`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setZohoStatus(statusData);
        } else if (statusResponse.status === 403) {
          const errorData = await statusResponse.json();
          console.error('Access denied loading Zoho status:', errorData);
          setZohoMessage({ 
            type: 'error', 
            text: errorData.error || 'Access denied. You do not have permission to view Zoho settings.' 
          });
        }
      } catch (err) {
        console.error('Error loading Zoho settings:', err);
      }
    }

    loadZohoSettings();
  }, [tenant]);

  async function handleSmtpSave(e: React.FormEvent) {
    e.preventDefault();
    setSmtpMessage(null);
    setSmtpLoading(true);

    if (!tenant?.id) {
      setSmtpMessage({ type: 'error', text: 'Tenant not found' });
      setSmtpLoading(false);
      return;
    }

    if (!smtpSettings.smtp_user || !smtpSettings.smtp_password) {
      setSmtpMessage({ type: 'error', text: 'Email and App Password are required' });
      setSmtpLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/tenants/smtp-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(smtpSettings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save SMTP settings');
      }

      setSmtpMessage({ type: 'success', text: 'SMTP settings saved successfully!' });
    } catch (err: any) {
      console.error('Error saving SMTP settings:', err);
      setSmtpMessage({ type: 'error', text: err.message || 'Failed to save SMTP settings' });
    } finally {
      setSmtpLoading(false);
    }
  }

  async function handleSmtpTest() {
    setSmtpMessage(null);
    setSmtpTestLoading(true);

    console.log('[Frontend] SMTP Test - Starting...');
    console.log('[Frontend] SMTP Settings:', {
      host: smtpSettings.smtp_host,
      port: smtpSettings.smtp_port,
      user: smtpSettings.smtp_user,
      password: smtpSettings.smtp_password ? '***SET***' : 'NOT SET',
    });

    if (!tenant?.id) {
      console.error('[Frontend] SMTP Test - Tenant not found');
      setSmtpMessage({ type: 'error', text: 'Tenant not found' });
      setSmtpTestLoading(false);
      return;
    }

    if (!smtpSettings.smtp_user || !smtpSettings.smtp_password) {
      console.error('[Frontend] SMTP Test - Missing credentials');
      setSmtpMessage({ type: 'error', text: 'Please enter email address and app password' });
      setSmtpTestLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      
      console.log('[Frontend] SMTP Test - Sending request to:', `${API_URL}/tenants/smtp-settings/test`);
      
      const response = await fetch(`${API_URL}/tenants/smtp-settings/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(smtpSettings),
      });

      console.log('[Frontend] SMTP Test - Response status:', response.status);
      console.log('[Frontend] SMTP Test - Response ok:', response.ok);

      const data = await response.json();
      console.log('[Frontend] SMTP Test - Response data:', data);

      if (!response.ok) {
        const errorMsg = data.error || data.message || 'SMTP connection test failed';
        console.error('[Frontend] SMTP Test - Error:', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('[Frontend] SMTP Test - Success!');
      setSmtpMessage({ 
        type: 'success', 
        text: `✅ Connection test successful! Test email sent to ${data.testEmail || smtpSettings.smtp_user}. Please check your inbox.` 
      });
    } catch (err: any) {
      console.error('[Frontend] SMTP Test - Exception:', err);
      console.error('[Frontend] SMTP Test - Error message:', err.message);
      console.error('[Frontend] SMTP Test - Error stack:', err.stack);
      
      let errorText = err.message || 'SMTP connection test failed. Please check your settings.';
      
      // Provide more helpful error messages
      if (err.message?.includes('Authentication failed') || err.message?.includes('EAUTH')) {
        errorText = 'Authentication failed. Please check your email address and app password. Make sure you\'re using an App Password, not your regular password.';
      } else if (err.message?.includes('Connection failed') || err.message?.includes('ECONNECTION')) {
        errorText = 'Connection failed. Please check your SMTP host and port settings.';
      } else if (err.message?.includes('timeout') || err.message?.includes('ETIMEDOUT')) {
        errorText = 'Connection timeout. Please check your network connection and try again.';
      } else if (err.message?.includes('fetch')) {
        errorText = 'Failed to connect to server. Please check if the server is running.';
      }
      
      setSmtpMessage({ 
        type: 'error', 
        text: errorText
      });
    } finally {
      setSmtpTestLoading(false);
      console.log('[Frontend] SMTP Test - Complete');
    }
  }

  async function handleWhatsappSave(e: React.FormEvent) {
    e.preventDefault();
    setWhatsappMessage(null);
    setWhatsappLoading(true);

    if (!tenant?.id) {
      setWhatsappMessage({ type: 'error', text: 'Tenant not found' });
      setWhatsappLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/tenants/whatsapp-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(whatsappSettings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save WhatsApp settings');
      }

      setWhatsappMessage({ type: 'success', text: 'WhatsApp settings saved successfully!' });
    } catch (err: any) {
      console.error('Error saving WhatsApp settings:', err);
      setWhatsappMessage({ type: 'error', text: err.message || 'Failed to save WhatsApp settings' });
    } finally {
      setWhatsappLoading(false);
    }
  }

  async function handleWhatsappTest() {
    setWhatsappMessage(null);
    setWhatsappTestLoading(true);

    if (!tenant?.id) {
      setWhatsappMessage({ type: 'error', text: 'Tenant not found' });
      setWhatsappTestLoading(false);
      return;
    }

    // Validate required fields based on provider
    if (whatsappSettings.provider === 'meta') {
      if (!whatsappSettings.phone_number_id || !whatsappSettings.access_token) {
        const missing = [];
        if (!whatsappSettings.phone_number_id) missing.push('Phone Number ID');
        if (!whatsappSettings.access_token) missing.push('Access Token');
        setWhatsappMessage({ 
          type: 'error', 
          text: `Please fill in ${missing.join(' and ')} field(s) before testing. These are required for Meta Cloud API.` 
        });
        setWhatsappTestLoading(false);
        return;
      }
    } else if (whatsappSettings.provider === 'twilio') {
      if (!whatsappSettings.account_sid || !whatsappSettings.auth_token) {
        setWhatsappMessage({ 
          type: 'error', 
          text: 'Please fill in Account SID and Auth Token fields before testing. These are required for Twilio.' 
        });
        setWhatsappTestLoading(false);
        return;
      }
    } else if (whatsappSettings.provider === 'wati') {
      if (!whatsappSettings.api_key) {
        setWhatsappMessage({ 
          type: 'error', 
          text: 'Please fill in API Key field before testing. This is required for WATI.' 
        });
        setWhatsappTestLoading(false);
        return;
      }
    }

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/tenants/whatsapp-settings/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(whatsappSettings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'WhatsApp connection test failed');
      }

      setWhatsappMessage({ 
        type: 'success', 
        text: `Connection test successful! WhatsApp is configured for ${whatsappSettings.provider}.` 
      });
    } catch (err: any) {
      console.error('WhatsApp test error:', err);
      setWhatsappMessage({ 
        type: 'error', 
        text: err.message || 'WhatsApp connection test failed. Please check your settings.' 
      });
    } finally {
      setWhatsappTestLoading(false);
    }
  }

  async function handleZohoSave(e: React.FormEvent) {
    e.preventDefault();
    setZohoMessage(null);
    setZohoLoading(true);

    if (!tenant?.id) {
      setZohoMessage({ type: 'error', text: 'Tenant not found' });
      setZohoLoading(false);
      return;
    }

    if (!zohoSettings.client_id || !zohoSettings.client_secret) {
      setZohoMessage({ type: 'error', text: 'Client ID and Client Secret are required' });
      setZohoLoading(false);
      return;
    }

    // Ensure redirect_uri is set (use default if not provided)
    if (!zohoSettings.redirect_uri || zohoSettings.redirect_uri.trim() === '') {
      const defaultUri = `${window.location.origin}/api/zoho/callback`;
      setZohoSettings({ ...zohoSettings, redirect_uri: defaultUri });
      console.log(`[SettingsPage] Using default redirect URI: ${defaultUri}`);
    }

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/tenants/zoho-config`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(zohoSettings),
      });

      const data = await response.json();

      if (!response.ok) {
        // Provide more helpful error message for access denied
        if (response.status === 403) {
          const errorMsg = data.error || 'Access denied';
          const hint = data.hint || '';
          throw new Error(`${errorMsg}${hint ? ' ' + hint : ''}`);
        }
        throw new Error(data.error || 'Failed to save Zoho configuration');
      }

      setZohoMessage({ type: 'success', text: 'Zoho configuration saved successfully!' });
      
      // Reload status
      await loadZohoStatus();
    } catch (err: any) {
      console.error('Error saving Zoho settings:', err);
      setZohoMessage({ type: 'error', text: err.message || 'Failed to save Zoho configuration' });
    } finally {
      setZohoLoading(false);
    }
  }

  async function handleZohoTest() {
    setZohoMessage(null);
    setZohoTestLoading(true);

    if (!tenant?.id) {
      setZohoMessage({ type: 'error', text: 'Tenant not found' });
      setZohoTestLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/tenants/zoho-config/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        // Provide more helpful error message for access denied
        if (response.status === 403) {
          const errorMsg = data.error || 'Access denied';
          const hint = data.hint || '';
          throw new Error(`${errorMsg}${hint ? ' ' + hint : ''}`);
        }
        throw new Error(data.error || 'Zoho connection test failed');
      }

      setZohoMessage({ 
        type: 'success', 
        text: data.message || 'Zoho connection test successful!' 
      });
    } catch (err: any) {
      console.error('Zoho test error:', err);
      setZohoMessage({ 
        type: 'error', 
        text: err.message || 'Zoho connection test failed. Please check your configuration and connect your account.' 
      });
    } finally {
      setZohoTestLoading(false);
    }
  }

  function handleZohoConnect() {
    if (!tenant?.id) {
      setZohoMessage({ type: 'error', text: 'Tenant not found' });
      return;
    }

    if (!zohoSettings.client_id || !zohoSettings.client_secret) {
      setZohoMessage({ type: 'error', text: 'Please save your Zoho credentials first' });
      return;
    }

    // Verify redirect URI is set
    const redirectUri = zohoSettings.redirect_uri || `${window.location.origin}/api/zoho/callback`;
    if (!redirectUri.includes('3001')) {
      setZohoMessage({ 
        type: 'error', 
        text: `Redirect URI must use port 3001 (backend). Current: ${redirectUri}. Please update in Settings and Zoho Developer Console.` 
      });
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const authUrl = `${API_URL}/zoho/auth?tenant_id=${tenant.id}`;
    
    // Open OAuth flow in popup window
    const popup = window.open(
      authUrl,
      'Zoho OAuth',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    // Listen for OAuth completion message
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'ZOHO_OAUTH_SUCCESS' && event.data.tenantId === tenant?.id) {
        // OAuth completed successfully, refresh status
        window.removeEventListener('message', messageHandler);
        setZohoMessage({ type: 'success', text: 'Zoho account connected successfully! Refreshing status...' });
        
        // Reload status after a short delay
        setTimeout(() => {
          loadZohoStatus();
        }, 1000);
      }
    };

    window.addEventListener('message', messageHandler);

    // Check if popup was blocked
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      setZohoMessage({ type: 'error', text: 'Popup was blocked. Please allow popups for this site and try again.' });
    }
  }

  async function loadZohoStatus() {
    if (!tenant?.id) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const statusResponse = await fetch(`${API_URL}/tenants/zoho-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        setZohoStatus(statusData);
      }
    } catch (err) {
      console.error('Error loading Zoho status:', err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!tenant?.id) return;

    setLoading(true);
    try {
      const { error } = await db
        .from('tenants')
        .update({
          name: formData.name,
          name_ar: formData.name_ar,
          contact_email: formData.contact_email,
          tenant_time_zone: formData.tenant_time_zone,
          maintenance_mode: formData.maintenance_mode,
        })
        .eq('id', tenant.id);

      if (error) throw error;

      alert('Settings saved successfully!');
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Error saving settings. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    // Validate passwords
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters long' });
      return;
    }

    setPasswordLoading(true);
    try {
      // First verify current password by attempting to re-authenticate
      // Pass forCustomer: false since this is admin/service provider/employee settings page
      const { error: signInError } = await db.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordData.currentPassword,
        forCustomer: false,
      });

      if (signInError) {
        setPasswordMessage({ type: 'error', text: 'Current password is incorrect' });
        setPasswordLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await db.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (updateError) throw updateError;

      setPasswordMessage({ type: 'success', text: 'Password updated successfully! You will be logged out in 3 seconds...' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });

      // Log out after 3 seconds to ensure new password takes effect
      setTimeout(async () => {
        await signOut();
        navigate('/login');
      }, 3000);
    } catch (err) {
      console.error('Error updating password:', err);
      setPasswordMessage({ type: 'error', text: 'Error updating password. Please try again.' });
    } finally {
      setPasswordLoading(false);
    }
  }

  // Show loading state if tenant is not loaded yet
  if (!tenant) {
    return (
      <div className="p-4 md:p-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{t('navigation.settings')}</h1>
        <p className="text-sm md:text-base text-gray-600 mt-1">Manage your tenant settings and preferences</p>
      </div>

      <div className="max-w-3xl">
        <div className="space-y-6">
          {/* Business Information Form */}
          <form onSubmit={handleSubmit}>
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Building2 className="w-6 h-6 text-blue-600" />
                {t('tenant.businessInformation')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Input
                label={t('tenant.businessNameEnglish')}
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Enter business name in English"
              />

              <Input
                label={t('tenant.businessNameArabic')}
                value={formData.name_ar || ''}
                onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                dir="rtl"
                placeholder="أدخل اسم العمل بالعربية"
              />

              <Input
                type="email"
                label={t('tenant.contactEmail')}
                value={formData.contact_email || ''}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                required
                placeholder="contact@example.com"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('tenant.timezone')}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.tenant_time_zone}
                  onChange={(e) => setFormData({ ...formData, tenant_time_zone: e.target.value })}
                  required
                >
                  <option value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
                  <option value="Asia/Kuwait">Asia/Kuwait</option>
                  <option value="Asia/Bahrain">Asia/Bahrain</option>
                  <option value="Asia/Qatar">Asia/Qatar</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                {t('tenant.operationalSettings')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.maintenance_mode}
                  onChange={(e) => setFormData({ ...formData, maintenance_mode: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">{t('tenant.maintenanceMode')}</span>
                  <p className="text-xs text-gray-500">{t('tenant.disablePublicBookings')}</p>
                </div>
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="submit"
              loading={loading}
              icon={<Save className="w-4 h-4" />}
              style={{
                background: `linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)`,
              }}
            >
              {t('tenant.saveSettings')}
            </Button>
          </div>
          </form>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Security Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                {passwordMessage && (
                  <div className={`p-3 rounded-lg text-sm ${
                    passwordMessage.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {passwordMessage.text}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Account Email
                  </label>
                  <Input
                    type="text"
                    value={user?.email || ''}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Current Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      placeholder="Enter current password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? 'text' : 'password'}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      placeholder="Enter new password (min. 6 characters)"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      placeholder="Confirm new password"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    loading={passwordLoading}
                    icon={<Lock className="w-4 h-4" />}
                  >
                    Update Password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Email Settings (SMTP)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {smtpMessage && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                    smtpMessage.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {smtpMessage.type === 'success' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {smtpMessage.text}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    SMTP Host
                  </label>
                  <Input
                    type="text"
                    value={smtpSettings.smtp_host}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_host: e.target.value })}
                    placeholder="smtp.gmail.com"
                    required
                  />
                  <p className="text-xs text-gray-500">Default: smtp.gmail.com</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    SMTP Port
                  </label>
                  <Input
                    type="number"
                    value={smtpSettings.smtp_port}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_port: parseInt(e.target.value) || 587 })}
                    placeholder="587"
                    required
                  />
                  <p className="text-xs text-gray-500">Default: 587 (Gmail uses 587)</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={smtpSettings.smtp_user}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_user: e.target.value })}
                    placeholder="your-email@gmail.com"
                    required
                  />
                  <p className="text-xs text-gray-500">The email address to send emails from</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    App Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showSmtpPassword ? 'text' : 'password'}
                      value={smtpSettings.smtp_password}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_password: e.target.value })}
                      placeholder="Enter App Password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    For Gmail: Generate an App Password from{" "}
                    <a 
                      href="https://myaccount.google.com/apppasswords" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Google Account Settings
                    </a>
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleSmtpTest}
                    loading={smtpTestLoading}
                    variant="secondary"
                    icon={<Mail className="w-4 h-4" />}
                  >
                    Test Connection
                  </Button>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSmtpSave(e as any);
                    }}
                    loading={smtpLoading}
                    icon={<Save className="w-4 h-4" />}
                  >
                    Save SMTP Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                WhatsApp Business Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {whatsappMessage && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                    whatsappMessage.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {whatsappMessage.type === 'success' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {whatsappMessage.text}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Provider
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={whatsappSettings.provider}
                    onChange={(e) => setWhatsappSettings({ ...whatsappSettings, provider: e.target.value as any })}
                    required
                  >
                    <option value="meta">Meta Cloud API</option>
                    <option value="twilio">Twilio</option>
                    <option value="wati">WATI</option>
                  </select>
                  <p className="text-xs text-gray-500">Choose your WhatsApp Business API provider</p>
                </div>

                {/* Meta Cloud API Settings */}
                {whatsappSettings.provider === 'meta' && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Phone Number ID
                      </label>
                      <Input
                        type="text"
                        value={whatsappSettings.phone_number_id}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, phone_number_id: e.target.value })}
                        placeholder="939237089264920"
                        required
                      />
                      <p className="text-xs text-gray-500">
                        Your WhatsApp Business Phone Number ID (not the phone number itself). 
                        Found in Meta Business Manager → WhatsApp → API Setup
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Access Token
                      </label>
                      <div className="relative">
                        <Input
                          type={showWhatsappToken ? 'text' : 'password'}
                          value={whatsappSettings.access_token}
                          onChange={(e) => setWhatsappSettings({ ...whatsappSettings, access_token: e.target.value })}
                          placeholder="Your WhatsApp Business Access Token"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowWhatsappToken(!showWhatsappToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showWhatsappToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">From Meta Business Manager → WhatsApp → API Setup</p>
                    </div>
                  </>
                )}

                {/* Twilio Settings */}
                {whatsappSettings.provider === 'twilio' && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Account SID
                      </label>
                      <Input
                        type="text"
                        value={whatsappSettings.account_sid}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, account_sid: e.target.value })}
                        placeholder="Your Twilio Account SID"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Auth Token
                      </label>
                      <div className="relative">
                        <Input
                          type={showWhatsappToken ? 'text' : 'password'}
                          value={whatsappSettings.auth_token}
                          onChange={(e) => setWhatsappSettings({ ...whatsappSettings, auth_token: e.target.value })}
                          placeholder="Your Twilio Auth Token"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowWhatsappToken(!showWhatsappToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showWhatsappToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        From (WhatsApp Number)
                      </label>
                      <Input
                        type="text"
                        value={whatsappSettings.from}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, from: e.target.value })}
                        placeholder="whatsapp:+14155238886"
                      />
                      <p className="text-xs text-gray-500">Format: whatsapp:+1234567890</p>
                    </div>
                  </>
                )}

                {/* WATI Settings */}
                {whatsappSettings.provider === 'wati' && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        API URL
                      </label>
                      <Input
                        type="text"
                        value={whatsappSettings.api_url}
                        onChange={(e) => setWhatsappSettings({ ...whatsappSettings, api_url: e.target.value })}
                        placeholder="https://api.wati.io"
                      />
                      <p className="text-xs text-gray-500">Default: https://api.wati.io</p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        API Key
                      </label>
                      <div className="relative">
                        <Input
                          type={showWhatsappToken ? 'text' : 'password'}
                          value={whatsappSettings.api_key}
                          onChange={(e) => setWhatsappSettings({ ...whatsappSettings, api_key: e.target.value })}
                          placeholder="Your WATI API Key"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowWhatsappToken(!showWhatsappToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showWhatsappToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleWhatsappTest}
                    loading={whatsappTestLoading}
                    variant="secondary"
                    icon={<MessageCircle className="w-4 h-4" />}
                  >
                    Test Connection
                  </Button>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleWhatsappSave(e as any);
                    }}
                    loading={whatsappLoading}
                    icon={<Save className="w-4 h-4" />}
                  >
                    Save WhatsApp Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-white">
                <FileText className="w-5 h-5" />
                Zoho Invoice Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {zohoMessage && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                    zohoMessage.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {zohoMessage.type === 'success' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {zohoMessage.text}
                  </div>
                )}

                {/* Connection Status */}
                {zohoStatus && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Connection Status</h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Configuration:</span>
                        {zohoStatus.has_config ? (
                          <span className="text-green-600 font-medium">✓ Saved</span>
                        ) : (
                          <span className="text-gray-400">Not configured</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Zoho Account:</span>
                        {zohoStatus.connection_status === 'connected' ? (
                          <span className="text-green-600 font-medium">✓ Connected</span>
                        ) : zohoStatus.connection_status === 'expired' ? (
                          <span className="text-yellow-600 font-medium">⚠ Expired</span>
                        ) : (
                          <span className="text-gray-400">Not connected</span>
                        )}
                      </div>
                      {zohoStatus.token_expires_at && (
                        <div className={`text-xs mt-2 ${
                          zohoStatus.connection_status === 'expired' 
                            ? 'text-yellow-600 font-medium' 
                            : 'text-gray-500'
                        }`}>
                          {zohoStatus.connection_status === 'expired' ? (
                            <>Token expired: {new Date(zohoStatus.token_expires_at).toLocaleString()}</>
                          ) : (
                            <>Token expires: {new Date(zohoStatus.token_expires_at).toLocaleString()}</>
                          )}
                        </div>
                      )}
                      {zohoStatus.connection_status === 'expired' && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                          <strong>Token Expired:</strong> Your Zoho access token has expired. Click "Reconnect to Zoho" to refresh your connection.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">📋 Setup Instructions</h4>
                  <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Go to <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer" className="underline">Zoho Developer Console</a></li>
                    <li>Create a "Server-based Application"</li>
                    <li><strong>IMPORTANT:</strong> Set Redirect URI in Zoho Console to exactly: <code className="bg-blue-100 px-1 rounded font-mono">{zohoSettings.redirect_uri || `${window.location.origin}/api/zoho/callback`}</code></li>
                    <li>Copy Client ID and Client Secret from Zoho</li>
                    <li><strong>VERIFY:</strong> The Client ID in Zoho matches the one you enter below (this is critical!)</li>
                    <li>Enter the <strong>exact same Redirect URI</strong> in the field below</li>
                    <li>Save credentials, then click "Connect to Zoho"</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Client ID
                  </label>
                  <Input
                    type="text"
                    value={zohoSettings.client_id}
                    onChange={(e) => setZohoSettings({ ...zohoSettings, client_id: e.target.value })}
                    placeholder="1000.XXXXXXXXXXXXX"
                    required
                  />
                  <p className="text-xs text-gray-500">From Zoho Developer Console → Your App → Client ID</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Client Secret
                  </label>
                  <div className="relative">
                    <Input
                      type={showZohoSecret ? 'text' : 'password'}
                      value={zohoSettings.client_secret}
                      onChange={(e) => setZohoSettings({ ...zohoSettings, client_secret: e.target.value })}
                      placeholder="Enter your Client Secret"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowZohoSecret(!showZohoSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showZohoSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">From Zoho Developer Console → Your App → Client Secret</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Redirect URI <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={zohoSettings.redirect_uri}
                    onChange={(e) => setZohoSettings({ ...zohoSettings, redirect_uri: e.target.value })}
                    placeholder={`${window.location.origin}/api/zoho/callback`}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    <strong>Must match exactly</strong> what you configured in Zoho Developer Console. 
                    Default: <code className="bg-gray-100 px-1 rounded font-mono">{window.location.origin}/api/zoho/callback</code>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultUri = `${window.location.origin}/api/zoho/callback`;
                      setZohoSettings({ ...zohoSettings, redirect_uri: defaultUri });
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Use default: {window.location.origin}/api/zoho/callback
                  </button>
                  <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-300">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Redirect URI that will be used:</p>
                    <code className="text-xs font-mono text-gray-800 break-all">
                      {zohoSettings.redirect_uri || `${window.location.origin}/api/zoho/callback`}
                    </code>
                    <p className="text-xs text-gray-600 mt-1">
                      ⚠️ Copy this EXACT URI and add it to Zoho Developer Console → Authorized Redirect URIs
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Region
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={zohoSettings.region}
                    onChange={(e) => setZohoSettings({ ...zohoSettings, region: e.target.value })}
                  >
                    <option value="com">United States (com)</option>
                    <option value="eu">Europe (eu)</option>
                    <option value="in">India (in)</option>
                    <option value="au">Australia (au)</option>
                    <option value="jp">Japan (jp)</option>
                  </select>
                  <p className="text-xs text-gray-500">Select your Zoho region based on your account location</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleZohoConnect}
                    variant="secondary"
                    icon={<ExternalLink className="w-4 h-4" />}
                    disabled={!zohoSettings.client_id || !zohoSettings.client_secret}
                  >
                    {zohoStatus?.connection_status === 'expired' || zohoStatus?.connection_status === 'not_connected' 
                      ? 'Reconnect to Zoho' 
                      : 'Connect to Zoho'}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleZohoTest}
                    loading={zohoTestLoading}
                    variant="secondary"
                    icon={<CheckCircle className="w-4 h-4" />}
                  >
                    Test Connection
                  </Button>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleZohoSave(e as any);
                    }}
                    loading={zohoLoading}
                    icon={<Save className="w-4 h-4" />}
                  >
                    Save Zoho Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
