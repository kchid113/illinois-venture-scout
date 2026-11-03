import Radar from '@/components/radar';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <Radar section="company" slug={slug}/>;}
