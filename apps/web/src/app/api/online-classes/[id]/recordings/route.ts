import {NextResponse} from "next/server";
import {currentUser} from "@/lib/current-user";
import {listOnlineClassRecordings,onlineClassTeacherId,startOnlineClassRecording,stopOnlineClassRecording} from "@/lib/online-classes";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"برای دیدن ضبط‌ها باید وارد حساب شوید."},{status:401});
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"شناسهٔ کلاس معتبر نیست."},{status:400});
  const isTeacher=user.role==="teacher"&&(await onlineClassTeacherId(id))===user.id;
  if(!isTeacher&&user.role!=="admin")return NextResponse.json({error:"ضبط‌های کلاس فقط برای دبیر همان کلاس و مدیر است."},{status:403});
  const recordings=await listOnlineClassRecordings(user,id);
  return NextResponse.json({recordings},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"برای ضبط کلاس باید وارد حساب شوید."},{status:401});
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"شناسهٔ کلاس معتبر نیست."},{status:400});
  let body:Record<string,unknown>;try{body=await request.json()}catch{return NextResponse.json({error:"درخواست معتبر نیست."},{status:400})}
  const action=String(body.action||"");
  if(action==="start"){
    const result=await startOnlineClassRecording(user,id);
    if(!result.ok)return NextResponse.json({error:result.error},{status:400});
    return NextResponse.json({ok:true,recordingId:result.recordingId,egressId:result.egressId,startedAt:result.startedAt},{headers:{"Cache-Control":"no-store"}});
  }
  if(action==="stop"){
    const result=await stopOnlineClassRecording(user,id);
    if(!result.ok)return NextResponse.json({error:result.error},{status:400});
    return NextResponse.json({ok:true,durationSeconds:result.durationSeconds},{headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.json({error:"عملیات ضبط ناشناخته است."},{status:400});
}
