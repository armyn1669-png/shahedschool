import {NextResponse} from "next/server";
import {currentUser} from "@/lib/current-user";
import {temporaryOnlineAbsenceReports,dismissTemporaryOnlineReport} from "@/lib/academic-db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"دسترسی فقط برای مدیر است."},{status:403});return NextResponse.json({reports:await temporaryOnlineAbsenceReports(user)},{headers:{"Cache-Control":"no-store"}})}
export async function DELETE(request:Request){const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"دسترسی فقط برای مدیر است."},{status:403});const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"شناسهٔ گزارش معتبر نیست."},{status:400});const result=await dismissTemporaryOnlineReport(user,id);return result.ok?NextResponse.json({ok:true}):NextResponse.json({error:result.error},{status:400})}
