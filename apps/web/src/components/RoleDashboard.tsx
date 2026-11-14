import type {AuthenticatedUser} from "@/lib/auth-db";
import {StudentDashboard} from "@/components/StudentDashboard";
import {TeacherDashboard} from "@/components/TeacherDashboard";
import {GuardianDashboard} from "@/components/GuardianDashboard";
import {AdminDashboard} from "@/components/AdminDashboard";
export function RoleDashboard({user}:{user:AuthenticatedUser}){
 if(user.role==="admin")return <AdminDashboard user={user}/>;
 if(user.role==="student")return <StudentDashboard user={user}/>;
 if(user.role==="teacher")return <TeacherDashboard user={user}/>;
 return <GuardianDashboard user={user}/>;
}
