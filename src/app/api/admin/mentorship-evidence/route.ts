import { NextRequest,NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/admin/http';
import { reviewCommandSchema } from '@/lib/mentorship/evidence-policy';
import { decideEvidence,reviewQueue } from '@/lib/mentorship/evidence';
import { mentorshipErrorResponse } from '@/lib/mentorship/http';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){return withPlatformAdmin(request,async()=>NextResponse.json(await reviewQueue()));}
export async function POST(request:NextRequest){return withPlatformAdmin(request,async(req,admin)=>{
 const parsed=reviewCommandSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
 try{return NextResponse.json(await decideEvidence(admin.id,parsed.data));}catch(error){return mentorshipErrorResponse(error,'Evidence review');}
},{mutation:true});}
