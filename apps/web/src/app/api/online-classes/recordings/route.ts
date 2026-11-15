import {NextResponse} from "next/server";
import {currentUser} from "@/lib/current-user";
import {listOnlineClassRecordings,recordingDownloadUrl} from "@/lib/online-classes";
export const runtime="nodejs";export const dynamic="force-dynamic";
// Manager-area list: every recording the caller may see (teacher: own classes, admin: all),
// each finished recording with a 15-minute presigned download link (B2 files are private).
export async function GET(){
  const user=await currentUser();if(!user)return NextResponse.json({error:"برای دیدن ضبط‌ها باید وارد حساب شوید."},{status:401});
  if(user.role!=="teacher"&&user.role!=="admin")return NextResponse.json({error:"ضبط‌های کلاس فقط برای دبیر و مدیر است."},{status:403});
  const recordings=await listOnlineClassRecordings(user);
  const withUrls=await Promise.all(recordings.map(async r=>{
    if(r.status==="stopped"||r.status==="completed"){
      const dl=await recordingDownloadUrl(user,r.id);
      if(dl.ok)return {...r,downloadUrl:dl.url};
    }
    return r;
  }));
  return NextResponse.json({recordings:withUrls},{headers:{"Cache-Control":"no-store"}});
}
