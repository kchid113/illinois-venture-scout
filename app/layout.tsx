import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Illinois Venture Radar',description:'Independent, evidence-first intelligence for the Illinois innovation ecosystem.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
