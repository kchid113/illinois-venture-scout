import {NextRequest,NextResponse} from 'next/server';
/** Retired sign-out endpoint: the public site has no investor session. */
export function POST(req:NextRequest){return NextResponse.redirect(new URL('/',req.url),{status:303});}
