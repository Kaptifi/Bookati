import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../lib/db';
import { User, UserRole, Tenant } from '../types';

interface AuthUser {
  id: string;
  email?: string;
  username?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  userProfile: User | null;
  tenant: Tenant | null;
  loading: boolean;
  signIn: (email: string, password: string, forCustomer?: boolean) => Promise<{ error?: Error; userProfile?: User; tenant?: Tenant }>;
  signUp: (email: string, password: string, fullName: string, role: UserRole, tenantId?: string) => Promise<{ error?: Error }>;
  signOut: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Debug logging helper
const DEBUG = true; // Set to false to disable debug logs
const debugLog = (event: string, data: any) => {
  if (DEBUG) {
    console.log(`[AuthContext] ${event}`, {
      ...data,
      timestamp: new Date().toISOString(),
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
    });
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingProfileRef = React.useRef<string | null>(null);
  const userProfileRef = React.useRef<User | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    const prevProfile = userProfileRef.current;
    userProfileRef.current = userProfile;
    
    if (prevProfile !== userProfile) {
      debugLog('UserProfile State Changed', {
        prevId: prevProfile?.id,
        newId: userProfile?.id,
        prevRole: prevProfile?.role,
        newRole: userProfile?.role,
      });
    }
  }, [userProfile]);

  useEffect(() => {
    let isMounted = true;

    debugLog('AuthProvider Mounted', {});

    // Check active session
    db.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) {
        debugLog('Component Unmounted Before Session Check', {});
        return;
      }
      
      debugLog('Session Check Complete', {
        hasSession: !!session,
        userId: session?.user?.id,
      });
      
      setUser(session?.user ?? null);
      if (session?.user) {
        // Only fetch if we don't have a profile or if the user ID changed
        const currentProfile = userProfileRef.current;
        if (!currentProfile || currentProfile.id !== session.user.id) {
          debugLog('Fetching User Profile', {
            reason: !currentProfile ? 'no_profile' : 'user_id_changed',
            currentProfileId: currentProfile?.id,
            sessionUserId: session.user.id,
          });
          fetchUserProfile(session.user.id);
        } else {
          debugLog('Skipping Profile Fetch', {
            reason: 'profile_exists_and_matches',
            profileId: currentProfile.id,
          });
          setLoading(false);
        }
      } else {
        debugLog('No Session Found', {});
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        debugLog('Component Unmounted Before Auth State Change', { event });
        return;
      }
      
      debugLog('Auth State Change', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
      });

      // Only handle actual auth events, not token refreshes
      if (event === 'SIGNED_OUT') {
        debugLog('SIGNED_OUT Event', {});
        setUser(null);
        setUserProfile(null);
        setTenant(null);
        setLoading(false);
        fetchingProfileRef.current = null;
        userProfileRef.current = null;
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        debugLog('SIGNED_IN/USER_UPDATED Event', { event });
        setUser(session?.user ?? null);
        if (session?.user) {
          // Only fetch if we don't have a profile or if the user ID changed
          const currentProfile = userProfileRef.current;
          if (!currentProfile || currentProfile.id !== session.user.id) {
            debugLog('Fetching Profile After Auth Event', {
              reason: !currentProfile ? 'no_profile' : 'user_id_changed',
              currentProfileId: currentProfile?.id,
              sessionUserId: session.user.id,
            });
            fetchUserProfile(session.user.id);
          } else {
            debugLog('Skipping Profile Fetch After Auth Event', {
              reason: 'profile_exists_and_matches',
              profileId: currentProfile.id,
            });
          }
        }
      } else if (event === 'TOKEN_REFRESHED') {
        debugLog('TOKEN_REFRESHED Event', {
          hasSession: !!session,
          userId: session?.user?.id,
          currentUserProfile: !!userProfileRef.current,
        });
        // Token refresh should NEVER clear state - only update if session exists
        // If session is null, it might be a temporary issue, so keep existing state
        if (session?.user) {
          // Session exists, update user but keep profile and tenant
          setUser(session.user);
          // Don't clear or refetch - keep existing userProfile and tenant
        } else {
          // Session is null - this could be a temporary parsing issue
          // NEVER clear state on TOKEN_REFRESHED with null session
          // Only clear if we're absolutely sure there's no session
          const sessionStr = localStorage.getItem('auth_session');
          const token = localStorage.getItem('auth_token');
          
          if (!sessionStr && !token) {
            // No session at all - but still don't clear immediately
            // Wait for explicit SIGNED_OUT event
            debugLog('TOKEN_REFRESHED with no session data - keeping state (waiting for SIGNED_OUT)');
          } else {
            // Session data exists in localStorage - keep state
            debugLog('TOKEN_REFRESHED with null session but localStorage exists - keeping state');
          }
          // Always keep existing state on TOKEN_REFRESHED
        }
      }
    });

    return () => {
      debugLog('AuthProvider Unmounting', {});
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array - only run once on mount

  async function fetchUserProfile(userId: string) {
    // Skip if userId is invalid
    if (!userId || userId === 'unknown' || userId === 'null' || userId === 'undefined') {
      debugLog('Invalid User ID - Skipping Profile Fetch', { userId });
      fetchingProfileRef.current = null;
      setLoading(false);
      return;
    }

    // Prevent duplicate fetches for the same user
    if (fetchingProfileRef.current === userId) {
      debugLog('Duplicate Fetch Prevented', { userId });
      return;
    }

    fetchingProfileRef.current = userId;
    debugLog('Fetching User Profile Started', { userId });

    try {
      // Double-check session exists before fetching
      const sessionCheck = await db.auth.getSession();
      if (!sessionCheck.data?.session) {
        debugLog('No Session During Profile Fetch', { userId });
        // Check localStorage before giving up
        const sessionStr = localStorage.getItem('auth_session');
        const token = localStorage.getItem('auth_token');
        
        if (!sessionStr && !token) {
          // No session at all
          fetchingProfileRef.current = null;
          setLoading(false);
          return;
        } else {
          // Session exists in localStorage but getSession failed
          // This might be a parsing issue - retry once
          debugLog('Session in localStorage but getSession failed - retrying', { userId });
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
          const retryCheck = await db.auth.getSession();
          if (!retryCheck.data?.session) {
            fetchingProfileRef.current = null;
            setLoading(false);
            return;
          }
        }
      }

      const { data, error } = await db
        .from('users')
        .select('id, tenant_id, email, phone, full_name, role, is_active, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        debugLog('Error Fetching User Profile', { error: error.message, userId });
        fetchingProfileRef.current = null;
        
        // NEVER clear state on fetch error - always keep existing profile
        // Network errors, temporary DB issues, etc. shouldn't cause logout
        const sessionStr = localStorage.getItem('auth_session');
        const token = localStorage.getItem('auth_token');
        
        if (sessionStr || token) {
          // Session exists - keep existing profile
          debugLog('Session Exists After Fetch Error - Keeping Existing Profile', { 
            userId,
            hasExistingProfile: !!userProfileRef.current 
          });
          // Keep existing profile if it exists
          if (userProfileRef.current) {
            // Profile exists, just set loading to false
            setLoading(false);
            return;
          }
        }
        
        // No session and no existing profile - but still don't clear user state
        // Wait for explicit SIGNED_OUT event
        setLoading(false);
        return;
      }

      if (data) {
        // Check if user account is active
        if (data.is_active === false) {
          debugLog('User Account Deactivated', {
            userId: data.id,
            role: data.role,
            email: data.email,
          });
          // Sign out the user if account is deactivated
          await db.auth.signOut();
          setUser(null);
          setUserProfile(null);
          setTenant(null);
          userProfileRef.current = null;
          fetchingProfileRef.current = null;
          setLoading(false);
          return;
        }

        debugLog('User Profile Fetched Successfully', {
          userId: data.id,
          role: data.role,
          email: data.email,
        });
        setUserProfile(data);

        if (data.tenant_id) {
          debugLog('Fetching Tenant Data', { tenantId: data.tenant_id });
          const { data: tenantData } = await db
            .from('tenants')
            .select('*')
            .eq('id', data.tenant_id)
            .maybeSingle();

          if (tenantData) {
            // Check if tenant account is active (for tenant-based roles)
            if ((data.role === 'tenant_admin' || data.role === 'receptionist' || data.role === 'cashier') && tenantData.is_active === false) {
              debugLog('Tenant Account Deactivated', {
                tenantId: tenantData.id,
                slug: tenantData.slug,
                userRole: data.role,
              });
              // Sign out the user if tenant is deactivated
              await db.auth.signOut();
              setUser(null);
              setUserProfile(null);
              setTenant(null);
              userProfileRef.current = null;
              fetchingProfileRef.current = null;
              setLoading(false);
              return;
            }
            
            debugLog('Tenant Data Fetched Successfully', {
              tenantId: tenantData.id,
              slug: tenantData.slug,
            });
            setTenant(tenantData);
          } else {
            debugLog('Tenant Data Not Found', { tenantId: data.tenant_id });
          }
        }
      } else {
        debugLog('User Profile Not Found', { userId });
        // User not found - check if session still exists before clearing
        const sessionStr = localStorage.getItem('auth_session');
        const token = localStorage.getItem('auth_token');
        
        if (sessionStr || token) {
          // Session exists, don't clear profile - might be a temporary DB issue
          debugLog('Session Exists But Profile Not Found - Keeping Existing Profile', {
            hasExistingProfile: !!userProfileRef.current,
            existingProfileId: userProfileRef.current?.id,
          });
          // Keep existing profile if it exists
          if (!userProfileRef.current) {
            setLoading(false);
          }
        } else {
          // No session, safe to clear
          setUserProfile((prevProfile) => {
            if (!prevProfile) {
              debugLog('Clearing Profile - No Existing Profile And No Session', {});
              setTenant(null);
              return null;
            }
            debugLog('Keeping Existing Profile - No Session But Profile Exists', {
              existingProfileId: prevProfile.id,
            });
            return prevProfile;
          });
        }
      }
    } catch (error: any) {
      debugLog('Exception Fetching User Profile', {
        error: error.message,
        userId,
      });
      fetchingProfileRef.current = null;
      // Don't clear the user profile on exception - keep existing session
      setLoading((prevLoading) => {
        if (prevLoading && !userProfileRef.current) {
          return false;
        }
        return prevLoading;
      });
      return;
    } finally {
      fetchingProfileRef.current = null;
      debugLog('Fetching User Profile Complete', { userId });
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string, forCustomer: boolean = false) {
    debugLog('Sign In Started', { email, forCustomer });
    try {
      const { data: authData, error } = await db.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        debugLog('Sign In Error', { error: error.message, email, errorCode: error.code });
        console.error('Sign in API error:', error);

        // Provide more helpful error message for network errors
        let errorMessage = error.message || 'Authentication failed';

        // Check for server connection errors
        if (error.code === 'NETWORK_ERROR' ||
            error.code === 'SERVER_NOT_RUNNING' ||
            error.message?.includes('Cannot connect to server') ||
            error.message?.includes('Backend server is not running') ||
            error.message?.includes('ERR_CONNECTION_REFUSED') ||
            error.message?.includes('Failed to fetch')) {
          errorMessage = 'Backend server is not running. Please start the server:\n\n1. Open terminal\n2. cd to project/server\n3. Run: npm run dev\n\nOr double-click start-server.bat';
        }

        return { error: new Error(errorMessage) };
      }

      if (authData?.user && authData?.session) {
        debugLog('Auth Successful - Fetching User Profile', { userId: authData.user.id });

        // Ensure session is set in the client
        await db.auth.setSession({
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
        });

        // Small delay to ensure session is fully established
        await new Promise(resolve => setTimeout(resolve, 100));

        // Fetch user profile from users table
        const { data: userProfile, error: profileError } = await db
          .from('users')
          .select('id, tenant_id, email, phone, full_name, role, is_active, created_at, updated_at')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profileError || !userProfile) {
          debugLog('User Profile Fetch Error', {
            error: profileError?.message,
            errorCode: profileError?.code,
            errorDetails: profileError?.details,
            userId: authData.user.id,
            hasProfile: !!userProfile
          });
          console.error('Profile fetch error details:', {
            error: profileError,
            userProfile,
            userId: authData.user.id
          });
          await db.auth.signOut();

          const errorMsg = profileError?.message
            ? `Account setup error: ${profileError.message}`
            : 'Account setup incomplete. Please contact support.';
          return { error: new Error(errorMsg) };
        }

        // Check if forCustomer flag matches the role
        if (!forCustomer && userProfile.role === 'customer') {
          debugLog('Customer Login Blocked on Non-Customer Page', { userId: userProfile.id });
          await db.auth.signOut();
          return { error: new Error('Access denied: Customers must use the customer login page.') };
        }

        if (forCustomer && userProfile.role !== 'customer') {
          debugLog('Non-Customer Login Blocked on Customer Page', { userId: userProfile.id });
          await db.auth.signOut();
          return { error: new Error('Access denied: This login page is for customers only.') };
        }

        // Check if user is active
        if (!userProfile.is_active) {
          debugLog('Inactive User Account', { userId: userProfile.id });
          await db.auth.signOut();
          return { error: new Error('Your account has been deactivated. Please contact support.') };
        }

        let tenantData: Tenant | null = null;

        // Fetch tenant if user has one
        if (userProfile.tenant_id) {
          debugLog('Fetching Tenant', { tenantId: userProfile.tenant_id });
          const { data: tenant, error: tenantError } = await db
            .from('tenants')
            .select('*')
            .eq('id', userProfile.tenant_id)
            .maybeSingle();

          debugLog('Tenant Fetch Result', {
            hasTenant: !!tenant,
            hasError: !!tenantError,
            errorMessage: tenantError?.message,
            tenantSlug: tenant?.slug
          });

          if (tenant) {
            // Check if tenant is active
            if (!tenant.is_active) {
              debugLog('Inactive Tenant Account', { tenantId: tenant.id });
              await db.auth.signOut();
              return { error: new Error('Your business account has been deactivated. Please contact support.') };
            }
            tenantData = tenant;
          } else if (tenantError) {
            debugLog('Tenant Fetch Error', { error: tenantError.message, code: tenantError.code, details: tenantError.details });
            console.error('Tenant fetch error details:', tenantError);
          } else {
            debugLog('No Tenant Found', { tenantId: userProfile.tenant_id });
          }
        }

        debugLog('Sign In Successful', {
          userId: userProfile.id,
          role: userProfile.role,
          hasTenant: !!tenantData,
          tenantSlug: tenantData?.slug
        });

        // Update state immediately
        setUser({ id: userProfile.id, email: userProfile.email });
        setUserProfile(userProfile);
        if (tenantData) {
          setTenant(tenantData);
        }

        // Start token refresh interval (refresh 1 day before expiration)
        startTokenRefreshInterval();

        console.log('[AuthContext] signIn returning:', {
          hasUserProfile: !!userProfile,
          hasTenant: !!tenantData,
          tenantSlug: tenantData?.slug,
          userRole: userProfile.role
        });

        return { userProfile, tenant: tenantData };
      }

      debugLog('Sign In Failed - No User Data', { email });
      console.error('No user data in response:', authData);
      return { error: new Error('No user data received from server') };
    } catch (error) {
      debugLog('Sign In Exception', { error: (error as Error).message, email });
      console.error('Sign in exception:', error);
      return { error: error as Error };
    }
  }

  // Token refresh interval reference
  const tokenRefreshIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  function startTokenRefreshInterval() {
    // Clear existing interval if any
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
    }

    // Refresh token every 6 days (1 day before 7-day expiration)
    // This ensures the token is always fresh
    tokenRefreshIntervalRef.current = setInterval(async () => {
      try {
        const { data, error } = await db.auth.refreshSession();
        if (error) {
          debugLog('Token refresh failed', { error: error.message });
          // Don't clear session on refresh failure - token might still be valid
        } else if (data) {
          debugLog('Token refreshed successfully', {});
        }
      } catch (err) {
        debugLog('Token refresh exception', { error: (err as Error).message });
      }
    }, 6 * 24 * 60 * 60 * 1000); // 6 days in milliseconds
  }

  function stopTokenRefreshInterval() {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    tenantId?: string
  ) {
    try {
      // Create auth user with metadata
      const { data: authData, error: authError } = await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            tenant_id: tenantId,
          },
        },
      });

      if (authError) return { error: authError };

      if (authData?.user) {
        // User profile is created by the trigger automatically
        debugLog('Sign Up Successful', {
          userId: authData.user.id,
          email: authData.user.email,
        });
        return {};
      }

      return {};
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signOut() {
    debugLog('Sign Out Started', {});
    stopTokenRefreshInterval();
    await db.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setTenant(null);
    userProfileRef.current = null;
    fetchingProfileRef.current = null;
    debugLog('Sign Out Complete', {});
  }

  function hasRole(roles: UserRole[]): boolean {
    if (!userProfile) return false;
    return roles.includes(userProfile.role);
  }

  const value = {
    user,
    userProfile,
    tenant,
    loading,
    signIn,
    signUp,
    signOut,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

