import {NextResponse} from "next/server";
import {currentUser} from "@/lib/current-user";
import {hideOnlineClassHistory} from "@/lib/online-classes";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){const user=await currentUser();if(!user||user.role!=="teacher")return NextResponse.json({error:"فقط دبیر می‌تواند سابقهٔ کلاس خودش را حذف کند."},{status:403});const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"شناسهٔ جلسه معتبر نیست."},{status:400});const result=await hideOnlineClassHistory(user,id);return result.ok?NextResponse.json(result,{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400});}
