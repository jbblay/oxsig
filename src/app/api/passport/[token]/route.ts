import { NextRequest,NextResponse } from 'next/server';
import { publicPassport } from '@/lib/mentorship/evidence';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { mentorshipErrorResponse } from '@/lib/mentorship/http';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{token:string}>}){
 const limited=await checkRateLimit(request,{maxRequests:30,windowMs:60000,failClosed:true},undefined,'public-passport');
 if(limited)return limited;
 try {return NextResponse.json(await publicPassport((await params).token),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});}
 catch(error){return mentorshipErrorResponse(error,'Public passport');}
}
