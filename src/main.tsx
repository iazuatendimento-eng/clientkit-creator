import { createRoot } from 'react-dom/client'
import { supabase } from '@/integrations/supabase/client'
import App from './App.tsx'
import './index.css'

// Wake up the database immediately on app load
supabase.from("teams").select("id").limit(1).maybeSingle().then(() => {});

createRoot(document.getElementById("root")!).render(<App />);
