import Radar from '@/components/radar';
import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!['discover','learn','activity','watchlists','research','sources','settings','methodology'].includes(section))notFound();return <Radar section={section}/>;}
