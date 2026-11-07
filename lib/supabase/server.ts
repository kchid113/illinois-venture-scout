import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';

function config(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw Error('Supabase Auth is not configured');
 return {url,key};
}
export async function createClient(){
 const {url,key}=config();
 const store=await cookies();
 return createServerClient(url,key,{
  cookies:{
   getAll(){return store.getAll();},
   setAll(values){
    try{for(const {name,value,options} of values)store.set(name,value,options);}
    catch{/* Server Components are read-only; proxy refreshes session cookies. */}
   }
  }
 });
}
