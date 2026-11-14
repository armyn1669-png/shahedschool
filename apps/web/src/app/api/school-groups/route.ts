import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { createSchoolGroup, deleteSchoolGroup, schoolGroupsSnapshot, updateSchoolGroup } from "@/lib/school-groups";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"برای دیدن گروه‌های مدرسه وارد شوید."},{status:401,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json(await schoolGroupsSnapshot(user),{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request){
  const user=await currentUser();
  if(!user||user.role!=="admin")return NextResponse.json({error:"فقط مدیر مدرسه می‌تواند گروه یا کانال به فهرست مدرسه اضافه کند."},{status:403,headers:{"Cache-Control":"no-store"}});
  let body:Record<string,unknown>;
  try{body=await request.json();}catch{return NextResponse.json({error:"درخواست معتبر نیست."},{status:400});}
  const text=(key:string,max:number)=>typeof body[key]==="string"?(body[key] as string).trim().slice(0,max):"";
  const kind=body.kind,visibility=body.visibility;
  const courseIds=Array.isArray(body.courseIds)?body.courseIds.map(Number):[];
  const staffIds=Array.isArray(body.staffIds)?body.staffIds.map(Number):[];
  const imageData=text("imageData",2_500_000);
  if(!text("name",80)||!(["channel","group"] as unknown[]).includes(kind)||!(["school","selected"] as unknown[]).includes(visibility)||courseIds.length>100||staffIds.length>100||courseIds.some(id=>!Number.isSafeInteger(id)||id<1)||staffIds.some(id=>!Number.isSafeInteger(id)||id<1)||imageData.length>2_000_000){
    return NextResponse.json({error:"نام، نوع، شیوهٔ دسترسی یا تصویر معتبر نیست."},{status:400,headers:{"Cache-Control":"no-store"}});
  }
  const result=await createSchoolGroup(user,{name:text("name",80),description:text("description",500),kind:kind as "channel"|"group",visibility:visibility as "school"|"selected",externalUrl:text("externalUrl",500),imageData,courseIds,staffIds});
  return result.ok?NextResponse.json(result,{status:201,headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400,headers:{"Cache-Control":"no-store"}});
}

export async function DELETE(request:Request){
  const user=await currentUser();
  if(!user||user.role!=="admin")return NextResponse.json({error:"فقط مدیر مدرسه می‌تواند گروه را حذف کند."},{status:403});
  const id=Number(new URL(request.url).searchParams.get("id"));
  if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"گروه انتخاب‌شده معتبر نیست."},{status:400});
  const deleted=await deleteSchoolGroup(id);
  return deleted?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:"گروه پیدا نشد."},{status:404});
}

export async function PATCH(request:Request){
  const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"فقط مدیر مدرسه می‌تواند کانال را ویرایش کند."},{status:403});
  let body:Record<string,unknown>;try{body=await request.json()}catch{return NextResponse.json({error:"اطلاعات ویرایش معتبر نیست."},{status:400})}
  const id=Number(body.id),name=typeof body.name==="string"?body.name.trim():"",description=typeof body.description==="string"?body.description.trim():"",externalUrl=typeof body.externalUrl==="string"?body.externalUrl.trim():"",imageData=typeof body.imageData==="string"?body.imageData:"";
  if(!Number.isSafeInteger(id)||id<1||!name||name.length>80||description.length>500||externalUrl.length>500||imageData.length>2_000_000)return NextResponse.json({error:"نام، لینک یا تصویر معتبر نیست."},{status:400});
  const result=await updateSchoolGroup(id,{name,description,externalUrl,imageData});return result.ok?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400});
}
