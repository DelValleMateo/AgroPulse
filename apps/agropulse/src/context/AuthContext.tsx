import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Membership, Organization, UserRole } from '../types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  activeOrg: Organization | null;
  memberships: Membership[];
  activeRole: UserRole | null;
  isLoading: boolean;
  lastTickTime: Date | null;
  setLastTickTime: (date: Date) => void;
  signIn: (email: string, pass: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  switchOrganization: (orgId: string) => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastTickTime, setLastTickTime] = useState<Date | null>(null);

  const fetchUserContext = async (currentUser: User) => {
    try {
      // 1. Fetch user memberships with organizations
      const { data: memData, error: memError } = await supabase
        .from('memberships')
        .select(`
          id,
          user_id,
          organization_id,
          role,
          organizations (
            id,
            name,
            region
          )
        `)
        .eq('user_id', currentUser.id);

      if (memError) {
        console.warn('Error fetching memberships:', memError.message);
        return;
      }

      if (memData && memData.length > 0) {
        const formatted: Membership[] = memData.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          organization_id: m.organization_id,
          role: m.role as UserRole,
          organization: m.organizations as Organization,
        }));

        setMemberships(formatted);

        // Keep existing active org if still valid, otherwise default to first
        setActiveOrg((prev) => {
          if (prev) {
            const found = formatted.find((f) => f.organization_id === prev.id);
            if (found && found.organization) return found.organization;
          }
          return formatted[0].organization || null;
        });
      } else {
        // Fallback default mock membership if running in local sandbox without auth table
        const fallbackOrg: Organization = {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Estancia Didáctica Concordia',
          region: 'Concordia, Entre Ríos',
        };
        const fallbackRole: UserRole = currentUser.email?.includes('asesor')
          ? 'advisor'
          : currentUser.email?.includes('operador')
          ? 'operator'
          : 'producer';

        setMemberships([
          {
            id: 'mock-membership-id',
            user_id: currentUser.id,
            organization_id: fallbackOrg.id,
            role: fallbackRole,
            organization: fallbackOrg,
          },
        ]);
        setActiveOrg(fallbackOrg);
      }
    } catch (err) {
      console.error('Failed to load user context:', err);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          if (initialSession?.user) {
            await fetchUserContext(initialSession.user);
          }
        }
      } catch (err) {
        console.error('Error reading initial session:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        await fetchUserContext(newSession.user);
      } else {
        setMemberships([]);
        setActiveOrg(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, pass: string): Promise<{ error?: string }> => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) {
        return { error: error.message };
      }

      return {};
    } catch (err: any) {
      return { error: err.message || 'Error de autenticación' };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setIsLoading(true);
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setSession(null);
      setMemberships([]);
      setActiveOrg(null);
      setIsLoading(false);
    }
  };

  const switchOrganization = (orgId: string) => {
    const mem = memberships.find((m) => m.organization_id === orgId);
    if (mem && mem.organization) {
      setActiveOrg(mem.organization);
    }
  };

  const refreshUserData = async () => {
    if (user) {
      await fetchUserContext(user);
    }
  };

  // Derive current role based on active organization
  const activeRole: UserRole | null = React.useMemo(() => {
    if (!activeOrg || memberships.length === 0) return null;
    const mem = memberships.find((m) => m.organization_id === activeOrg.id);
    return mem ? mem.role : null;
  }, [activeOrg, memberships]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        activeOrg,
        memberships,
        activeRole,
        isLoading,
        lastTickTime,
        setLastTickTime,
        signIn,
        signOut,
        switchOrganization,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
