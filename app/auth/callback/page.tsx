import {redirect} from 'next/navigation';
/** Legacy email links cannot grant public-site privileges. */
export default function Page(){redirect('/');}
