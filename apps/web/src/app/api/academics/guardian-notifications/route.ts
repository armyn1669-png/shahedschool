import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { guardianNotificationQueue, retryGuardianNotification } from "@/lib/academic-db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"دسترسی فقط برای مدیر است."},{status:403});return NextResponse.json({notifications:await guardianNotificationQueue(user)},{headers:{"Cache-Control":"no-store"}})}
export async function POST(request:Request){const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"دسترسی فقط برای مدیر است."},{status:403});let body:Record<string,unknown>;try{body=await request.json()}catch{return NextResponse.json({error:"درخواست معتبر نیست."},{status:400})}const id=Number(body.id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"پیام معتبر نیست."},{status:400});const result=await retryGuardianNotification(user,id);return result.ok?NextResponse.json({ok:true}):NextResponse.json({error:result.error},{status:400})}
