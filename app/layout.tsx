import type {Metadata} from 'next';
import EducationAnalytics from '@/components/education-analytics';
import './globals.css';

export const metadata:Metadata={
 title:'Illinois Venture Radar',
 description:'Independent VC startup discovery across the University of Illinois Urbana-Champaign ecosystem: student founders, Research Park, EnterpriseWorks, iVenture and university-linked ventures.'
};

/**
 * Pageview analytics is a production-only operator opt-in.
 * The client component uses an explicit public-route allowlist and manual
 * tracking, never automatic URL collection.
 */
export default function RootLayout({children}:{children:React.ReactNode}){
 const enabled=process.env.IVR_SIMPLE_ANALYTICS_ENABLED==='true'&&process.env.NODE_ENV==='production';
 return <html lang="en"><body>
  {children}
  {enabled&&<EducationAnalytics/>}
 </body></html>;
}
