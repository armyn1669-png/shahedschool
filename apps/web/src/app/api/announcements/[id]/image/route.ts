import {NextResponse} from "next/server";
import {currentUser} from "@/lib/current-user";
import {announcementImage} from "@/lib/announcements";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const user=await currentUser();if(!user)return NextResponse.json({error:"برای دیدن تصویر وارد شوید."},{status:401});const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return new Response(null,{status:404});const image=await announcementImage(user,id);if(!image)return new Response(null,{status:404});return new Response(image.bytes,{headers:{"Content-Type":image.mime,"Cache-Control":"private, max-age=86400","X-Content-Type-Options":"nosniff"}})}
