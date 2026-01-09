import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

interface LogEntry {
  timestamp: string;
  event: string;
  data: any;
}

export function NavigationTest() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile, tenant, loading: authLoading, user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Log function
  const addLog = (event: string, data: any = {}) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      event,
      data: {
        ...data,
        location: location.pathname,
        userProfile: userProfile ? { id: userProfile.id, role: userProfile.role, email: userProfile.email } : null,
        tenant: tenant ? { id: tenant.id, slug: tenant.slug } : null,
        authLoading,
        user: user ? { id: user.id, email: user.email } : null,
        authSession: localStorage.getItem('auth_session') ? 'exists' : 'missing',
        authToken: localStorage.getItem('auth_token') ? 'exists' : 'missing',
      },
    };
    setLogs((prev) => [...prev, entry]);
    console.log(`[NavigationTest] ${event}`, entry);
  };

  // Monitor auth state changes
  useEffect(() => {
    addLog('Location Changed', { pathname: location.pathname });
  }, [location.pathname]);

  useEffect(() => {
    addLog('UserProfile Changed', { 
      hasProfile: !!userProfile,
      profileId: userProfile?.id,
      profileRole: userProfile?.role,
    });
  }, [userProfile]);

  useEffect(() => {
    addLog('Auth Loading Changed', { loading: authLoading });
  }, [authLoading]);

  useEffect(() => {
    addLog('Tenant Changed', { 
      hasTenant: !!tenant,
      tenantId: tenant?.id,
      tenantSlug: tenant?.slug,
    });
  }, [tenant]);

  useEffect(() => {
    addLog('User Changed', { 
      hasUser: !!user,
      userId: user?.id,
    });
  }, [user]);

  // Test scenario
  const testNavigation = async () => {
    if (!tenant?.slug) {
      addLog('ERROR', { message: 'No tenant slug available' });
      return;
    }

    setIsRunning(true);
    setCurrentStep(0);
    // Don't clear logs - keep initial logs for reference
    // setLogs([]);

    const steps = [
      { name: 'Dashboard', path: `/${tenant.slug}/admin` },
      { name: 'Services', path: `/${tenant.slug}/admin/services` },
      { name: 'Bookings', path: `/${tenant.slug}/admin/bookings` },
      { name: 'Settings', path: `/${tenant.slug}/admin/settings` },
      { name: 'Back to Dashboard', path: `/${tenant.slug}/admin` },
    ];

    addLog('TEST_START', { 
      steps: steps.length,
      initialUserProfile: userProfile ? userProfile.id : null,
      initialTenant: tenant ? tenant.slug : null,
    });

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i + 1);
      const step = steps[i];
      
      // Capture state before navigation
      const stateBefore = {
        userProfile: userProfile ? { id: userProfile.id, email: userProfile.email } : null,
        tenant: tenant ? { id: tenant.id, slug: tenant.slug } : null,
        authLoading,
        session: !!localStorage.getItem('auth_session'),
        token: !!localStorage.getItem('auth_token'),
      };
      
      addLog('BEFORE_NAVIGATION', { 
        step: step.name, 
        path: step.path, 
        stepNumber: i + 1,
        ...stateBefore,
      });
      
      // Navigate
      console.log(`[NavigationTest] Navigating to: ${step.path}`);
      navigate(step.path);
      
      // Wait for navigation to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      // Wait for state updates (multiple checks)
      for (let check = 0; check < 5; check++) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        
        // Capture current state
        const currentState = {
          userProfile: userProfile ? { id: userProfile.id, email: userProfile.email } : null,
          tenant: tenant ? { id: tenant.id, slug: tenant.slug } : null,
          authLoading,
          session: !!localStorage.getItem('auth_session'),
          token: !!localStorage.getItem('auth_token'),
          currentPath: window.location.pathname,
        };
        
        addLog('AFTER_NAVIGATION_CHECK', {
          step: step.name,
          checkNumber: check + 1,
          ...currentState,
        });
        
        // Special check for dashboard return
        if (step.name === 'Back to Dashboard' && check === 4) {
          addLog('DASHBOARD_RETURN_FINAL_CHECK', {
            userProfileExists: !!userProfile,
            userProfileId: userProfile?.id,
            userProfileEmail: userProfile?.email,
            authLoading,
            sessionExists: !!localStorage.getItem('auth_session'),
            tokenExists: !!localStorage.getItem('auth_token'),
            currentPath: window.location.pathname,
            sessionContent: localStorage.getItem('auth_session')?.substring(0, 100),
          });

          // Check if we got logged out
          if (!userProfile) {
            addLog('LOGOUT_DETECTED', {
              message: 'UserProfile became null after returning to dashboard',
              session: localStorage.getItem('auth_session'),
              token: localStorage.getItem('auth_token'),
              stackTrace: new Error().stack,
            });
          }
        }
      }
    }

    addLog('TEST_COMPLETE', {
      finalUserProfile: userProfile ? userProfile.id : null,
      finalTenant: tenant ? tenant.slug : null,
    });
    setIsRunning(false);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `navigation-test-${new Date().toISOString()}.json`;
    link.click();
  };

  if (!tenant?.slug) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-red-600">No tenant available. Please log in as a service provider first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Navigation Test - Debug Dashboard Logout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={testNavigation} disabled={isRunning}>
              {isRunning ? `Running... Step ${currentStep}` : 'Start Navigation Test'}
            </Button>
            <Button onClick={clearLogs} variant="secondary" disabled={isRunning}>
              Clear Logs
            </Button>
            <Button onClick={exportLogs} variant="secondary" disabled={logs.length === 0}>
              Export Logs
            </Button>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Current State:</h3>
            <div className="text-sm space-y-1">
              <div>Location: <code className="bg-white px-2 py-1 rounded">{location.pathname}</code></div>
              <div>UserProfile: {userProfile ? `✅ ${userProfile.email} (${userProfile.role})` : '❌ null'}</div>
              <div>Tenant: {tenant ? `✅ ${tenant.slug}` : '❌ null'}</div>
              <div>Auth Loading: {authLoading ? '⏳ true' : '✅ false'}</div>
              <div>Session: {localStorage.getItem('auth_session') ? '✅ exists' : '❌ missing'}</div>
              <div>Token: {localStorage.getItem('auth_token') ? '✅ exists' : '❌ missing'}</div>
            </div>
          </div>

          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs max-h-96 overflow-y-auto">
            <div className="mb-2 text-white font-semibold">Event Log ({logs.length} entries):</div>
            {logs.length === 0 ? (
              <div className="text-gray-500">No logs yet. Click "Start Navigation Test" to begin.</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-2 border-b border-gray-700 pb-2">
                  <div className="text-yellow-400">
                    [{new Date(log.timestamp).toLocaleTimeString()}] {log.event}
                  </div>
                  <pre className="text-gray-300 mt-1 whitespace-pre-wrap">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

