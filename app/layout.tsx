import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Illinois Venture Radar',description:'Independent VC startup discovery across the University of Illinois Urbana-Champaign ecosystem: student founders, Research Park, EnterpriseWorks, iVenture and university-linked ventures.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
