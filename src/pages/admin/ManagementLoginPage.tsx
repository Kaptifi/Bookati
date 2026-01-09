import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LanguageToggle } from '../../components/layout/LanguageToggle';
import { Shield } from 'lucide-react';

const SOLUTION_OWNER_CREDENTIALS = {
  username: 'Bookatiadmin',
  password: 'Flipper@6722',
};

export function ManagementLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simple username/password validation
    if (
      username === SOLUTION_OWNER_CREDENTIALS.username &&
      password === SOLUTION_OWNER_CREDENTIALS.password
    ) {
      // Store a session token in localStorage to mark as authenticated
      localStorage.setItem('management_auth', 'true');
      localStorage.setItem('management_user', username);

      // Small delay for better UX
      setTimeout(() => {
        navigate('/solution-admin');
      }, 500);
    } else {
      setError(t('admin.invalidCredentials'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="w-12 h-12 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('admin.platformManagement')}</h1>
          <p className="text-slate-400 text-sm">{t('admin.solutionOwnerAccess')}</p>
        </div>

        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-center text-white">{t('admin.secureLogin')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Input
                type="text"
                label={t('admin.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder={t('admin.username')}
                className="bg-slate-900/50 border-slate-600 text-white"
              />

              <Input
                type="password"
                label={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder={t('auth.password')}
                className="bg-slate-900/50 border-slate-600 text-white"
              />

              <Button type="submit" fullWidth loading={loading} className="bg-blue-600 hover:bg-blue-700">
                {t('admin.accessPlatform')}
              </Button>

              <div className="text-center pt-4">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="text-sm text-slate-400 hover:text-slate-300"
                >
                  ← {t('admin.backToHomepage')}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-slate-500">
          <p>{t('admin.restrictedArea')}</p>
          <p className="mt-1">{t('admin.accessLogged')}</p>
        </div>
      </div>
    </div>
  );
}
