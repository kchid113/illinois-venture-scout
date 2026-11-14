import type {Metadata} from 'next';
import './globals.css';
import './premium.css';
import './contrast.css';
export const metadata:Metadata={
 title:'Illinois Venture Radar',
 description:'Independent, evidence-backed discovery and research for startups connected to the University of Illinois.'
};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body>{children}</body></html>;
}
