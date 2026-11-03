import type {Metadata} from 'next';
import Script from 'next/script';
import './globals.css';
export const metadata:Metadata={title:'Illinois Venture Radar',description:'Independent VC startup discovery across the University of Illinois Urbana-Champaign ecosystem: student founders, Research Park, EnterpriseWorks, iVenture and university-linked ventures.'};
/*
 * Third-party analytics are OFF unless explicitly enabled by the operator.
 * Route redaction runs before the external script, and private workspace,
 * company-specific and authentication pages are excluded.
 */
export default function RootLayout({children}:{children:React.ReactNode}){
 const analytics=process.env.IVR_SIMPLE_ANALYTICS_ENABLED==='true'&&process.env.NODE_ENV==='production';
 return <html lang="en"><body>
  {children}
  {analytics&&<>
   <Script src="/ivr-analytics-path.js" strategy="beforeInteractive"/>
   <Script src="https://scripts.simpleanalyticscdn.com/latest.js"
    strategy="afterInteractive"
    data-path-overwriter="ivrAnalyticsPath"
    data-ignore-pages="/companies/*,/watchlists,/research,/compare,/settings,/signin-with-chatgpt,/signout-with-chatgpt,/callback,/api/*"
    data-collect-dnt="false" data-allow-params="" data-strict-utm="true"/>
  </>}
 </body></html>;
}
