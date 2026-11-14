import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { updateOwnTeacherCredentials, updateTeacherCredentials } from "@/lib/auth-db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function PATCH(request:Request){
  const user=await currentUser();if(!user||user.role!=="teacher")return NextResponse.json({error:"فقط دبیر واردشده می‌تواند مشخصات ورود خود را تغییر دهد."},{status:403});
  let body:Record<string,unknown>;try{body=await request.json();}catch{return NextResponse.json({error:"درخواست معتبر نیست."},{status:400});}
  const result=await updateOwnTeacherCredentials(user.id,{username:typeof body.username==="string"?body.username:"",currentPassword:typeof body.currentPassword==="string"?body.currentPassword:"",newPassword:typeof body.newPassword==="string"?body.newPassword:""});
  return result.ok?NextResponse.json({ok:true,username:result.username}):NextResponse.json({error:result.error},{status:400});
}

export async function POST(request:Request){
  const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"فقط مدیر می‌تواند مشخصات حساب دبیر را ویرایش کند."},{status:403});
  let body:Record<string,unknown>;try{body=await request.json();}catch{return NextResponse.json({error:"درخواست معتبر نیست."},{status:400});}
  const result=await updateTeacherCredentials(user,{userId:Number(body.userId),username:typeof body.username==="string"?body.username:"",password:typeof body.password==="string"?body.password:""});
  return result.ok?NextResponse.json({ok:true,username:result.username}):NextResponse.json({error:result.error},{status:400});
}
