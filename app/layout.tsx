import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={
 title:'Illinois Venture Radar',
 description:'Evidence-backed UIUC startup intelligence for venture investors. Independent and not university-endorsed.'
};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body>{children}</body></html>;
}
