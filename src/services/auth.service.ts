import { supabase } from '@/lib/supabase/client';

export const AuthService = {
  getUser: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },
  signIn: (email: string, password: string) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email: string, password: string, redirectTo: string) => supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }),
  signOut: () => supabase.auth.signOut(),
};
