import {getInvestorUser} from '@/lib/auth';
import {all} from '@/lib/radar';

/** Roles are assigned only by the database owner in Supabase; never by email or JWT metadata. */
export async function isAdmin(){
 const user=await getInvestorUser();
 if(!user)return false;
 const rows=await all('SELECT role FROM investor_roles WHERE user_id=?',user.userId);
 return rows[0]?.role==='admin';
}
