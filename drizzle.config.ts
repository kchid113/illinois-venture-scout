import {defineConfig} from 'drizzle-kit';
export default defineConfig({
 schema:'./db/schema.ts',
 out:'./supabase/drizzle-generated',
 dialect:'postgresql',
 dbCredentials:{url:process.env.DATABASE_URL||'postgres://localhost:5432/illinois_venture_radar'}
});
