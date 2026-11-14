import {NextResponse} from "next/server";
import {currentUser} from "@/lib/current-user";
import {studentNeedsYearUpdate,updateCurrentStudentYear} from "@/lib/auth-db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){const user=await currentUser();if(!user||user.role!=="student")return NextResponse.json({error:"دسترسی فقط برای دانش‌آموز است."},{status:403});return NextResponse.json({required:await studentNeedsYearUpdate(user.id)},{headers:{"Cache-Control":"no-store"}})}
export async function POST(request:Request){const user=await currentUser();if(!user||user.role!=="student")return NextResponse.json({error:"دسترسی فقط برای دانش‌آموز است."},{status:403});let body:Record<string,unknown>;try{body=await request.json()}catch{return NextResponse.json({error:"اطلاعات معتبر نیست."},{status:400})}if(["grade","fieldOfStudy","branch"].some(k=>typeof body[k]!=="string"))return NextResponse.json({error:"پایه، رشته و شعبه را انتخاب کنید."},{status:400});const result=await updateCurrentStudentYear(user.id,{grade:body.grade as string,fieldOfStudy:body.fieldOfStudy as string,branch:body.branch as string});return result.ok?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400})}
